/**
 * Garmin reconciliation cron — Pull-first recovery
 * =========================================================================
 *
 * Phase 4 (PR #771) installed this cron as an asker — when an activity was
 * stranded as `summary_only`, we called Garmin's backfill API to re-request
 * the missing webhook. Phase 7 (this revision) upgrades it to an active
 * RECOVERER: we directly pull the activity details JSON from Garmin's
 * `/wellness-api/rest/activityDetails` endpoint (Activity API v1.2.5 §7.3)
 * and write streams/power/polyline ourselves, bypassing the broken webhook
 * delivery that strands ~70% of activities.
 *
 * Per spec §8, PULL-ONLY integrations are not allowed. We remain
 * push-based: `api/garmin-webhook-process.js` handles the steady-state
 * happy path. This cron is a reconciliation-only fallback.
 *
 * Per run:
 *   1. Selects Garmin activities `summary_only` or `needs_resync` from the
 *      last 7 days, at least 15 min old, throttled to 15 min between
 *      attempts, capped at 5 reconciler attempts total.
 *   2. Groups candidates by user_id (one integration lookup per user) and
 *      then into 24h upload windows so each Pull call covers as many
 *      stranded activities as possible.
 *   3. For each window: one `fetchActivityDetailsByUploadRange` call.
 *      Matches returned items to in-window candidates by activityId /
 *      summaryId, writes streams + powerMetrics, calls refreshCompleteness
 *      which flips the row to 'full' automatically.
 *   4. For activities NOT matched in the Pull (Garmin's pipeline truly has
 *      nothing yet): bumps the counter. As a single first-attempt nudge
 *      for activities < 4h old, also re-requests the webhook backfill —
 *      sometimes Garmin's transcoder is just slow.
 *   5. After 5 attempts AND age > 48h AND the most recent Pull returned
 *      no data, flips `data_completeness = 'unrecoverable'` and emits a
 *      structured Sentry event tagged `garmin.unrecoverable`.
 *
 * Per-run cap of 50 activities and 60 s function timeout.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import {
  requestActivityDetailsBackfill,
  fetchActivityDetailsByUploadRange,
  AuthError,
  ConsentRevokedError,
  BadRangeError,
} from './utils/garmin/garminApiClient.js';
import { extractStreamsFromActivityDetails } from './utils/garmin/activityDetailsParser.js';
import { refreshCompleteness } from './utils/garmin/completeness.js';
import { captureServerError } from './utils/serverSentry.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';

const supabase = getSupabaseAdmin();

const MAX_ATTEMPTS = 5;
const RETRY_INTERVAL_MINUTES = 15;
const LOOKBACK_DAYS = 7;
const PER_RUN_LIMIT = 50;
const UNRECOVERABLE_AGE_HOURS = 48;
const MIN_AGE_MINUTES = 15;
// Spec §7 caps every Pull query at 24h. We anchor each window at the
// earliest in-group `created_at` minus a 1h pre-roll (cheap insurance
// against any clock-skew between our insert time and Garmin's upload
// time), then extend forward for 23h. Total window = 24h, satisfying the
// `endSec - startSec <= 86400` precondition in fetchActivityDetailsByUploadRange.
const WINDOW_PRE_ROLL_SECONDS = 3600;
const WINDOW_SPAN_SECONDS = 86400;
const LEGACY_BACKFILL_AGE_HOURS = 4;

export default async function handler(req, res) {
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Reconciliation Started (Pull-first) ===');
  const startedAt = Date.now();
  const results = {
    candidates: 0,
    recovered_with_data: 0,
    still_waiting: 0,
    legacy_backfill_requested: 0,
    skipped_no_integration: 0,
    skipped_no_token: 0,
    skipped_consent_revoked: 0,
    skipped_no_start_date: 0,
    marked_unrecoverable: 0,
    errors: 0,
  };

  try {
    const now = new Date();
    const retryCutoff = new Date(now.getTime() - RETRY_INTERVAL_MINUTES * 60_000).toISOString();
    const lookbackCutoff = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const minAgeCutoff = new Date(now.getTime() - MIN_AGE_MINUTES * 60_000).toISOString();

    const { data: candidates, error: selErr } = await supabase
      .from('activities')
      .select('id, user_id, start_date, created_at, type, provider_activity_id, data_completeness, resync_attempt_count, last_resync_requested_at')
      .eq('provider', 'garmin')
      .in('data_completeness', ['summary_only', 'needs_resync'])
      .gte('start_date', lookbackCutoff)
      .lte('start_date', minAgeCutoff)
      .lt('resync_attempt_count', MAX_ATTEMPTS)
      .or(`last_resync_requested_at.is.null,last_resync_requested_at.lt.${retryCutoff}`)
      .order('start_date', { ascending: false })
      .limit(PER_RUN_LIMIT);

    if (selErr) throw selErr;
    results.candidates = candidates?.length || 0;
    console.log(`Found ${results.candidates} candidate(s)`);

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
    }

    // Group candidates by user. Each user gets one integration lookup and
    // one Pull-per-window pass.
    const byUser = new Map();
    for (const c of candidates) {
      if (!c.start_date) {
        results.skipped_no_start_date++;
        continue;
      }
      const list = byUser.get(c.user_id) ?? [];
      list.push(c);
      byUser.set(c.user_id, list);
    }

    for (const [userId, userCandidates] of byUser.entries()) {
      try {
        const integration = await loadIntegration(userId);
        if (!integration) {
          results.skipped_no_integration += userCandidates.length;
          // No active integration. For activities already maxed out, mark
          // unrecoverable now — the user is gone and won't be reconnecting.
          for (const c of userCandidates) {
            const nextCount = (c.resync_attempt_count || 0) + 1;
            const ageHours = ageInHours(c.start_date);
            if (nextCount >= MAX_ATTEMPTS && ageHours >= UNRECOVERABLE_AGE_HOURS) {
              await maybeMarkUnrecoverable(c, 'no active garmin integration', results);
            }
          }
          continue;
        }
        if (integration.refresh_token_invalid) {
          results.skipped_no_token += userCandidates.length;
          continue;
        }

        let accessToken;
        try {
          accessToken = await ensureValidAccessToken(integration, supabase);
        } catch (tokenErr) {
          console.warn(`Token refresh failed for user ${userId}: ${tokenErr.message}`);
          results.skipped_no_token += userCandidates.length;
          continue;
        }

        await reconcileUser(userId, userCandidates, accessToken, results);
      } catch (perUserErr) {
        results.errors++;
        console.error(`Reconcile failed for user ${userId}:`, perUserErr.message);
        captureServerError(perUserErr, {
          tag: 'garmin.reconcile_user_error',
          extra: { user_id: userId, candidate_count: userCandidates.length },
        });
      }
    }

    console.log('=== Garmin Reconciliation Complete ===', results);
    return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
  } catch (err) {
    console.error('Reconciliation crashed:', err);
    captureServerError(err, { tag: 'garmin.reconcile_crash' });
    return res.status(500).json({ error: 'Reconciliation failed', details: err.message });
  }
}

async function loadIntegration(userId) {
  const { data } = await supabase
    .from('bike_computer_integrations')
    .select('user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, status, sync_enabled')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .eq('status', 'active')
    .eq('sync_enabled', true)
    .maybeSingle();
  return data || null;
}

async function reconcileUser(userId, candidates, accessToken, results) {
  // Sort ascending by created_at, then greedy-pack into 24h windows.
  const sorted = [...candidates].sort((a, b) => {
    const at = new Date(a.created_at || a.start_date).getTime();
    const bt = new Date(b.created_at || b.start_date).getTime();
    return at - bt;
  });

  const windows = [];
  let current = null;
  for (const c of sorted) {
    const refMs = new Date(c.created_at || c.start_date).getTime();
    if (!current || refMs >= current.endMs) {
      const startSec = Math.floor(refMs / 1000) - WINDOW_PRE_ROLL_SECONDS;
      current = {
        startSec,
        endSec: startSec + WINDOW_SPAN_SECONDS,
        endMs: (startSec + WINDOW_SPAN_SECONDS) * 1000,
        items: [],
      };
      windows.push(current);
    }
    current.items.push(c);
  }

  for (const w of windows) {
    let details;
    try {
      details = await fetchActivityDetailsByUploadRange(accessToken, w.startSec, w.endSec);
    } catch (pullErr) {
      if (pullErr instanceof ConsentRevokedError) {
        // 412 — user revoked the Activity Details consent on the Garmin
        // account page. Every Pull will fail; bail out of this user's
        // remaining windows. One Sentry event total, not per activity.
        console.warn(`[PULL] consent revoked for user ${userId}; abandoning windows`);
        captureServerError(pullErr, {
          tag: 'garmin.consent_revoked',
          extra: { user_id: userId, remaining_windows: windows.length - windows.indexOf(w) },
        });
        results.skipped_consent_revoked += w.items.length;
        // Also stamp the remaining candidates so the next cron run skips them
        // (otherwise we'd hammer Garmin on every tick).
        for (const c of w.items) {
          await markAttempt(c, /*recovered*/ false);
        }
        return;
      }
      if (pullErr instanceof AuthError) {
        console.warn(`[PULL] auth error for user ${userId}: ${pullErr.message}`);
        results.skipped_no_token += w.items.length;
        return;
      }
      if (pullErr instanceof BadRangeError) {
        console.warn(`[PULL] bad range ${w.startSec}-${w.endSec}: ${pullErr.message}`);
        results.errors++;
        continue;
      }
      // Generic failure (5xx, network) — bump counter so we don't retry too
      // hard on the next tick, but no terminal action.
      console.warn(`[PULL] failed for ${userId} window ${w.startSec}-${w.endSec}: ${pullErr.message}`);
      results.errors++;
      for (const c of w.items) await markAttempt(c, /*recovered*/ false);
      continue;
    }

    // Build a lookup keyed on every form of ID we might match on. Vintage
    // matters — early rows used Garmin's `activityId` as the integer,
    // later code uses the string `summaryId`. Index both.
    const byId = new Map();
    for (const d of details || []) {
      if (d.activityId != null) byId.set(String(d.activityId), d);
      if (d.summaryId) byId.set(String(d.summaryId).replace(/-detail$/, ''), d);
    }

    for (const c of w.items) {
      const match = byId.get(String(c.provider_activity_id));
      if (match) {
        try {
          await writeStreamsFromDetail(c, match);
          results.recovered_with_data++;
          console.log(`✅ [PULL] recovered ${c.id} (${c.provider_activity_id})`);
        } catch (writeErr) {
          results.errors++;
          console.error(`Failed to write streams for ${c.id}:`, writeErr.message);
          captureServerError(writeErr, {
            tag: 'garmin.pull_write_error',
            extra: { activity_id: c.id, user_id: c.user_id },
          });
        }
        continue;
      }

      // No match in Pull response. Either Garmin still hasn't produced the
      // data (transcoder lag for brand-new activities) or never will.
      results.still_waiting++;
      const ageHours = ageInHours(c.start_date);
      const isFirstAttempt = (c.resync_attempt_count || 0) === 0;

      // One-shot legacy nudge for fresh activities — sometimes the
      // webhook backfill request triggers Garmin to publish data the
      // pipeline already has but hasn't pushed yet.
      if (isFirstAttempt && ageHours < LEGACY_BACKFILL_AGE_HOURS) {
        try {
          const startSec = Math.floor(new Date(c.start_date).getTime() / 1000);
          await requestActivityDetailsBackfill(accessToken, startSec);
          results.legacy_backfill_requested++;
        } catch (bfErr) {
          // Non-fatal — just a nudge.
          console.warn(`Legacy backfill nudge failed for ${c.id}: ${bfErr.message}`);
        }
      }

      const nextCount = await markAttempt(c, /*recovered*/ false);

      if (nextCount >= MAX_ATTEMPTS && ageHours >= UNRECOVERABLE_AGE_HOURS) {
        await maybeMarkUnrecoverable(c, `pull empty after ${MAX_ATTEMPTS} attempts (age=${Math.round(ageHours)}h)`, results);
      }
    }
  }
}

async function writeStreamsFromDetail(activity, detail) {
  const result = extractStreamsFromActivityDetails(detail);
  if (result.error) {
    throw new Error(`extractStreams failed: ${result.error}`);
  }
  // Same update shape `processFitFile` writes — dual-write the canonical
  // metric columns alongside their legacy twins per CLAUDE.md metric freeze.
  const update = { updated_at: new Date().toISOString() };
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

  // Stamp the resync timestamp + bump the counter as part of the same
  // write so the row's reconciliation state is consistent.
  update.last_resync_requested_at = new Date().toISOString();
  update.resync_attempt_count = (activity.resync_attempt_count || 0) + 1;

  const { error: updErr } = await supabase
    .from('activities')
    .update(update)
    .eq('id', activity.id);
  if (updErr) throw updErr;

  // refreshCompleteness re-reads the row and writes data_completeness
  // (mirror of the SQL view). Non-critical; a failure here just leaves
  // the column drifted — the next cron tick or admin endpoint will
  // notice and re-derive.
  await refreshCompleteness(supabase, activity.id);
}

async function markAttempt(activity, _recovered) {
  const nextCount = (activity.resync_attempt_count || 0) + 1;
  const { error } = await supabase
    .from('activities')
    .update({
      last_resync_requested_at: new Date().toISOString(),
      resync_attempt_count: nextCount,
    })
    .eq('id', activity.id);
  if (error) console.warn(`Could not record attempt for ${activity.id}: ${error.message}`);
  return nextCount;
}

async function maybeMarkUnrecoverable(activity, reason, results) {
  const { error } = await supabase
    .from('activities')
    .update({ data_completeness: 'unrecoverable' })
    .eq('id', activity.id);
  if (error) {
    console.warn(`Could not mark ${activity.id} unrecoverable: ${error.message}`);
    return;
  }
  results.marked_unrecoverable++;
  captureServerError(new Error(`Garmin activity unrecoverable: ${reason}`), {
    tag: 'garmin.unrecoverable',
    extra: {
      activity_id: activity.id,
      user_id: activity.user_id,
      provider_activity_id: activity.provider_activity_id,
      activity_type: activity.type,
      start_date: activity.start_date,
      resync_attempts: activity.resync_attempt_count,
      reason,
      path: 'pull',
    },
  });
  console.warn(`🪦 Marked ${activity.id} unrecoverable: ${reason}`);
}

function ageInHours(isoOrDate) {
  if (!isoOrDate) return 0;
  return (Date.now() - new Date(isoOrDate).getTime()) / 3_600_000;
}
