/**
 * Garmin Ping/Pull Cron — primary activity ingest path
 * =========================================================================
 *
 * Phase 1 of the Garmin ping/pull rebuild. This cron drains the ping queue
 * populated by the (Phase 2) Cloudflare worker / Vercel fallback receiver
 * and pulls full activity details from Garmin's §7.3 endpoint.
 *
 * In the steady state:
 *
 *   Garmin ──PING──► Cloudflare worker ──storePing()──► garmin_webhook_events
 *                                                              │
 *                              this cron (every 5 min) ◄───────┘
 *                              for each ping:
 *                                resolve integration by provider_user_id
 *                                ensureValidAccessToken (mutex)
 *                                pullActivityDetail (callbackURL → window fallback)
 *                                writeActivityFromDetail (insert/update + dual-write
 *                                  + dedup + completeness + side-effect chain)
 *                                markProcessed / markFailed
 *
 * Per Garmin Activity API §8 (Push/Pull integration rules) and the rebuild
 * plan: we are PUSH-based (ping-based) with synchronous pull-as-fetch — NOT
 * a PULL-ONLY integration. Compliant.
 *
 * Per CLAUDE.md hard constraints:
 *  - Uses the singleton via `getSupabaseAdmin()` (never `createClient`).
 *  - Match integrations by `provider_user_id` + `sync_enabled=true` +
 *    `refresh_token_invalid=false`. NEVER `.eq('status','active')` — that
 *    phantom column is the bug that made Phase 7 inert (see hotfix commit
 *    a8f3a43).
 *  - Per-row finalize via pingQueue.markProcessed/markFailed. ConsentRevoked
 *    (412) → one Sentry event per user per run, not per ping.
 *
 * NOTE: Phase 1 deliverable. The cron is NOT yet registered in vercel.json —
 * the Phase 2 worker change ships pings into the queue first. Until then,
 * manually invoke with a CRON_SECRET bearer to test.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { captureServerError } from './utils/serverSentry.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import {
  claimPings,
  markProcessed,
  markFailed,
  ACTIVITY_PING,
} from './utils/garmin2/pingQueue.js';
import {
  pullActivityDetail,
  AuthError,
  ConsentRevokedError,
  BadRangeError,
  GarminPullError,
} from './utils/garmin2/pullActivity.js';
import { writeActivityFromDetail } from './utils/garmin2/writeActivity.js';

const supabase = getSupabaseAdmin();

const PER_RUN_LIMIT = 50;

export default async function handler(req, res) {
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const results = {
    claimed: 0,
    inserted: 0,
    updated: 0,
    taken_over: 0,
    merged: 0,
    skipped: 0,
    no_match: 0,
    no_integration: 0,
    no_token: 0,
    consent_revoked: 0,
    errors: 0,
  };

  try {
    const pings = await claimPings(supabase, {
      limit: PER_RUN_LIMIT,
      eventTypePrefix: ACTIVITY_PING,
    });
    results.claimed = pings.length;
    console.log(`=== Garmin Ping/Pull cron: ${pings.length} ping(s) claimed ===`);

    if (pings.length === 0) {
      return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
    }

    // Group by garmin_user_id so we resolve each user's integration / token
    // exactly once per run.
    const byUser = new Map();
    for (const p of pings) {
      const list = byUser.get(p.garmin_user_id) ?? [];
      list.push(p);
      byUser.set(p.garmin_user_id, list);
    }

    for (const [garminUserId, userPings] of byUser.entries()) {
      try {
        await processUserPings(garminUserId, userPings, results);
      } catch (perUserErr) {
        results.errors++;
        console.error(`Per-user processing failed for ${garminUserId}:`, perUserErr.message);
        captureServerError(perUserErr, {
          tag: 'garmin.pull_cron_user_error',
          extra: { garmin_user_id: garminUserId, ping_count: userPings.length },
        });
      }
    }

    console.log('=== Garmin Ping/Pull cron complete ===', results);
    return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
  } catch (err) {
    console.error('Garmin Ping/Pull cron crashed:', err);
    captureServerError(err, { tag: 'garmin.pull_cron_crash' });
    return res.status(500).json({ error: 'pull cron failed', details: err.message });
  }
}

async function processUserPings(garminUserId, userPings, results) {
  // Resolve integration. NEVER filter on `status` — see file header.
  const { data: integration } = await supabase
    .from('bike_computer_integrations')
    .select('id, user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled')
    .eq('provider', 'garmin')
    .eq('provider_user_id', String(garminUserId))
    .eq('sync_enabled', true)
    .eq('refresh_token_invalid', false)
    .maybeSingle();

  if (!integration) {
    // No active integration for this Garmin user. Don't keep retrying — park
    // the rows so we don't drain budget on every cron tick. (User may have
    // disconnected; or the OAuth flow never persisted provider_user_id.)
    results.no_integration += userPings.length;
    for (const p of userPings) {
      await markProcessed(supabase, p.id, { note: 'no active integration' });
    }
    return;
  }

  let accessToken;
  try {
    accessToken = await ensureValidAccessToken(integration, supabase);
  } catch (tokenErr) {
    // Token refresh failure — set up for retry next tick (don't park).
    results.no_token += userPings.length;
    for (const p of userPings) {
      await markFailed(supabase, p, `token refresh: ${tokenErr.message}`);
    }
    return;
  }

  for (const ping of userPings) {
    try {
      let detail;
      try {
        detail = await pullActivityDetail(ping, accessToken);
      } catch (pullErr) {
        // Map typed errors to queue actions.
        if (pullErr instanceof ConsentRevokedError) {
          // 412 — user revoked Activity Details consent. Every subsequent
          // pull for this user will also 412 until they reconnect. Park all
          // their pings this run and emit one Sentry event.
          results.consent_revoked += userPings.length;
          captureServerError(pullErr, {
            tag: 'garmin.consent_revoked',
            extra: { user_id: integration.user_id, ping_count: userPings.length },
          });
          for (const remaining of userPings) {
            await markProcessed(supabase, remaining.id, { note: 'consent revoked' });
          }
          return;
        }
        if (pullErr instanceof AuthError) {
          // Token may have died mid-run. Retry next tick.
          results.no_token++;
          await markFailed(supabase, ping, `auth: ${pullErr.message}`);
          continue;
        }
        if (pullErr instanceof BadRangeError) {
          // Programmer/data error — the window endpoint rejected our params.
          // Park; manual diagnosis.
          results.errors++;
          await markProcessed(supabase, ping.id, { note: `bad range: ${pullErr.message}` });
          continue;
        }
        if (pullErr instanceof GarminPullError && pullErr.status === 410) {
          // callbackURL expired AND we had no window to fall back to.
          // Garmin can't tell us about this activity anymore — park.
          results.errors++;
          await markProcessed(supabase, ping.id, { note: 'callbackURL expired, no fallback window' });
          continue;
        }
        // Generic failure (5xx, network) — exponential backoff retry.
        results.errors++;
        await markFailed(supabase, ping, pullErr);
        continue;
      }

      if (!detail) {
        // Pull succeeded but no matching activity in the returned window.
        // Garmin sometimes pings before the activity is fully indexed; retry
        // with backoff. After MAX_RETRIES the queue parks it.
        results.no_match++;
        await markFailed(supabase, ping, 'no match in pulled window');
        continue;
      }

      const writeResult = await writeActivityFromDetail({
        supabase,
        integration,
        ping,
        detail,
      });

      if (writeResult.error) {
        results.errors++;
        await markFailed(supabase, ping, writeResult.error);
        continue;
      }

      results[writeResult.action] = (results[writeResult.action] || 0) + 1;
      await markProcessed(supabase, ping.id, {
        activityImportedId: writeResult.activityId,
        note: writeResult.action,
      });
      console.log(`✅ [PULL] ${writeResult.action} activity ${writeResult.activityId} from ping ${ping.id}`);
    } catch (perPingErr) {
      results.errors++;
      console.error(`Per-ping processing failed for ${ping.id}:`, perPingErr.message);
      captureServerError(perPingErr, {
        tag: 'garmin.pull_cron_ping_error',
        extra: { ping_id: ping.id, user_id: integration.user_id, activity_id: ping.activity_id },
      });
      await markFailed(supabase, ping, perPingErr).catch(() => {});
    }
  }
}
