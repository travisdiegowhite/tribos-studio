#!/usr/bin/env node

/**
 * One-shot backfill of stranded Garmin activities via the Activity Details
 * Pull endpoint (Activity API v1.2.5 §7.3).
 *
 * Phase 7 of the Garmin reliability rollout. After the new Pull-first
 * reconciler in `api/garmin-reconcile.js` is verified in production, run
 * this script once to recover the ~377 historical `summary_only` rows
 * that the old retry mechanism couldn't fix (because it could only ask
 * Garmin to re-send a webhook, and Garmin's pipeline never produced the
 * event for those activities).
 *
 * Reads the same `data_completeness` flag and emits the same row writes
 * as the cron — they're idempotent with respect to each other.
 *
 * Usage:
 *   node scripts/garmin-pull-backfill.js [options]
 *
 * Options:
 *   --commit         Actually write changes. Default is dry-run.
 *   --user-id <id>   Process only one user.
 *   --limit <n>      Cap total activities scanned (default: 500).
 *   --lookback <d>   Days back to scan (default: 30, Garmin's typical
 *                    Activity Details retention window).
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { ensureValidAccessToken } from '../api/utils/garmin/tokenManager.js';
import {
  fetchActivityDetailsByUploadRange,
  AuthError,
  ConsentRevokedError,
  BadRangeError,
} from '../api/utils/garmin/garminApiClient.js';
import { extractStreamsFromActivityDetails } from '../api/utils/garmin/activityDetailsParser.js';
import { refreshCompleteness } from '../api/utils/garmin/completeness.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// CLI args
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const USER_ID = readArg('--user-id');
const LIMIT = parseInt(readArg('--limit') || '500', 10);
const LOOKBACK_DAYS = parseInt(readArg('--lookback') || '30', 10);
const PULL_GAP_MS = 250;     // Be polite to Garmin between Pull calls.

function readArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

async function main() {
  console.log('=== Garmin Pull Backfill ===');
  console.log(`Mode:         ${COMMIT ? 'COMMIT (will write changes)' : 'DRY RUN (read-only)'}`);
  console.log(`User filter:  ${USER_ID || 'all'}`);
  console.log(`Activity cap: ${LIMIT}`);
  console.log(`Lookback:     ${LOOKBACK_DAYS} days`);
  console.log('');

  const lookbackIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  let query = supabase
    .from('activities')
    .select('id, user_id, start_date, created_at, type, provider_activity_id, data_completeness, resync_attempt_count, last_resync_requested_at')
    .eq('provider', 'garmin')
    .eq('data_completeness', 'summary_only')
    .gte('start_date', lookbackIso)
    .order('user_id', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  if (USER_ID) query = query.eq('user_id', USER_ID);

  const { data: candidates, error: selErr } = await query;
  if (selErr) {
    console.error('Failed to load candidates:', selErr);
    process.exit(1);
  }
  console.log(`Loaded ${candidates.length} stranded activities`);

  const byUser = new Map();
  for (const c of candidates) {
    const list = byUser.get(c.user_id) ?? [];
    list.push(c);
    byUser.set(c.user_id, list);
  }
  console.log(`Spread across ${byUser.size} users`);
  console.log('');

  const totals = {
    scanned: 0,
    recovered: 0,
    no_match: 0,
    no_integration: 0,
    no_token: 0,
    consent_revoked: 0,
    errors: 0,
  };
  const perUser = [];

  for (const [userId, userCandidates] of byUser.entries()) {
    const userStats = { user_id: userId, scanned: userCandidates.length, recovered: 0, no_match: 0, errors: 0 };
    process.stdout.write(`User ${userId.slice(0, 8)}… (${userCandidates.length} activities)  `);

    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, status, sync_enabled')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .eq('status', 'active')
      .eq('sync_enabled', true)
      .maybeSingle();
    if (!integration) {
      totals.no_integration += userCandidates.length;
      console.log('SKIP no_integration');
      perUser.push({ ...userStats, status: 'no_integration' });
      continue;
    }
    if (integration.refresh_token_invalid) {
      totals.no_token += userCandidates.length;
      console.log('SKIP no_token');
      perUser.push({ ...userStats, status: 'no_token' });
      continue;
    }

    let accessToken;
    try {
      accessToken = await ensureValidAccessToken(integration, supabase);
    } catch (tokenErr) {
      totals.no_token += userCandidates.length;
      console.log(`SKIP token refresh failed: ${tokenErr.message}`);
      perUser.push({ ...userStats, status: 'no_token' });
      continue;
    }

    // Build 24h windows greedy from sorted candidates.
    const sorted = [...userCandidates].sort((a, b) => {
      return new Date(a.created_at || a.start_date) - new Date(b.created_at || b.start_date);
    });
    const windows = [];
    let current = null;
    for (const c of sorted) {
      const refMs = new Date(c.created_at || c.start_date).getTime();
      if (!current || refMs >= current.endMs) {
        const startSec = Math.floor(refMs / 1000) - 3600;
        current = { startSec, endSec: startSec + 86400, endMs: (startSec + 86400) * 1000, items: [] };
        windows.push(current);
      }
      current.items.push(c);
    }

    let userConsentRevoked = false;
    for (const w of windows) {
      if (userConsentRevoked) break;
      let details;
      try {
        details = await fetchActivityDetailsByUploadRange(accessToken, w.startSec, w.endSec);
        await sleep(PULL_GAP_MS);
      } catch (pullErr) {
        if (pullErr instanceof ConsentRevokedError) {
          totals.consent_revoked += w.items.length;
          userStats.errors += w.items.length;
          userConsentRevoked = true;
          continue;
        }
        if (pullErr instanceof AuthError) {
          totals.no_token += w.items.length;
          userStats.errors += w.items.length;
          continue;
        }
        if (pullErr instanceof BadRangeError) {
          console.log(`  ⚠️ bad range ${w.startSec}-${w.endSec}: ${pullErr.message}`);
          totals.errors += w.items.length;
          userStats.errors += w.items.length;
          continue;
        }
        console.log(`  ⚠️ pull failed: ${pullErr.message}`);
        totals.errors += w.items.length;
        userStats.errors += w.items.length;
        continue;
      }

      const byId = new Map();
      for (const d of details || []) {
        if (d.activityId != null) byId.set(String(d.activityId), d);
        if (d.summaryId) byId.set(String(d.summaryId).replace(/-detail$/, ''), d);
      }

      for (const c of w.items) {
        totals.scanned++;
        const match = byId.get(String(c.provider_activity_id));
        if (!match) {
          totals.no_match++;
          userStats.no_match++;
          continue;
        }
        try {
          const result = extractStreamsFromActivityDetails(match);
          if (result.error) throw new Error(result.error);
          if (COMMIT) {
            await writeStreams(c, result);
          }
          totals.recovered++;
          userStats.recovered++;
        } catch (writeErr) {
          totals.errors++;
          userStats.errors++;
          console.log(`  ⚠️ write failed for ${c.id}: ${writeErr.message}`);
        }
      }
    }

    console.log(`recovered=${userStats.recovered} no_match=${userStats.no_match} errors=${userStats.errors}`);
    perUser.push({ ...userStats, status: userConsentRevoked ? 'consent_revoked' : 'ok' });
  }

  console.log('');
  console.log('=== Totals ===');
  console.log(JSON.stringify(totals, null, 2));
  console.log('');
  if (!COMMIT) {
    console.log('Dry-run only — no changes written. Re-run with --commit to apply.');
  }
}

async function writeStreams(activity, result) {
  const update = {
    updated_at: new Date().toISOString(),
    resync_attempt_count: (activity.resync_attempt_count || 0) + 1,
    last_resync_requested_at: new Date().toISOString(),
  };
  if (result.polyline) update.map_summary_polyline = result.polyline;
  if (result.activityStreams) update.activity_streams = result.activityStreams;
  const pm = result.powerMetrics;
  if (pm) {
    if (pm.avgPower != null) update.average_watts = pm.avgPower;
    if (pm.normalizedPower != null) {
      update.normalized_power = pm.normalizedPower;
      update.effective_power = pm.normalizedPower;
    }
    if (pm.maxPower != null) update.max_watts = pm.maxPower;
    if (pm.powerCurveSummary) update.power_curve_summary = pm.powerCurveSummary;
    if (pm.workKj != null) update.kilojoules = pm.workKj;
    update.device_watts = true;
  }
  const { error } = await supabase
    .from('activities')
    .update(update)
    .eq('id', activity.id);
  if (error) throw error;
  await refreshCompleteness(supabase, activity.id);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
