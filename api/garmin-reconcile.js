/**
 * Garmin reconciliation cron
 * =========================================================================
 *
 * Phase 4 of the Garmin reliability rollout. Closes the gap where Garmin
 * delivers a CONNECT_ACTIVITY summary webhook but never follows up with the
 * ACTIVITY_FILE_DATA event carrying the FIT callbackURL — leaving the
 * activity stranded as `summary_only` (no streams, no power curve, no
 * polyline) even though our processor asked for backfill at insert time.
 *
 * This cron runs every 15 minutes and:
 *
 *   1. Selects Garmin activities marked `summary_only` or `needs_resync`
 *      from the last 7 days that haven't been retried in 15+ minutes and
 *      haven't already exceeded MAX_ATTEMPTS reconciliation attempts.
 *   2. Re-calls Garmin's Activity Details Backfill API for each, asking
 *      Garmin to re-emit the activityFiles PING with the FIT callbackURL.
 *   3. Bumps `last_resync_requested_at` and `resync_attempt_count` so the
 *      next run respects the throttle.
 *   4. When `resync_attempt_count` hits MAX_ATTEMPTS AND the activity is
 *      old enough that Garmin won't have the FIT anymore (>48h), flips
 *      `data_completeness` to `unrecoverable` and emits a structured
 *      Sentry event tagged `garmin.unrecoverable`. This is the loud
 *      give-up — surfaces in admin/garmin-health and tells the user
 *      via the (Phase 5) re-sync UI that nothing more can be done.
 *
 * Throttling:
 *   - 15 minutes between attempts per activity (matches the cron cadence,
 *     so each activity gets exactly one attempt per cron run).
 *   - 50 activities per run cap to keep the function under 60s.
 *   - Garmin's API returns 409 when the same backfill window is requested
 *     twice in a short period. We log it but still bump the counter — it's
 *     "request is on file," not a failure.
 *
 * What this cron does NOT do:
 *   - Does not download FIT files directly. Garmin's API requires the
 *     callbackURL from a webhook PING; we can only request a new PING.
 *   - Does not touch non-Garmin activities (`data_completeness` is NULL
 *     for them — the WHERE clause filters them out implicitly).
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import { requestActivityDetailsBackfill } from './utils/garmin/garminApiClient.js';
import { captureServerError } from './utils/serverSentry.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';

const supabase = getSupabaseAdmin();

const MAX_ATTEMPTS = 5;
const RETRY_INTERVAL_MINUTES = 15;
const LOOKBACK_DAYS = 7;
const PER_RUN_LIMIT = 50;
// Garmin's Activity Details backfill returns nothing for activities older
// than ~48h (the FIT file is no longer in their PING queue). After we've
// exhausted attempts on something older than this, mark it unrecoverable.
const UNRECOVERABLE_AGE_HOURS = 48;
// Skip activities that just arrived — the processor's initial backfill
// request needs time to land before we double up.
const MIN_AGE_MINUTES = 15;

export default async function handler(req, res) {
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Reconciliation Started ===');
  const startedAt = Date.now();
  const results = {
    candidates: 0,
    requested: 0,
    skipped_no_integration: 0,
    skipped_no_token: 0,
    skipped_no_start_date: 0,
    backfill_failed: 0,
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
      .select('id, user_id, start_date, type, provider_activity_id, data_completeness, resync_attempt_count, last_resync_requested_at')
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
    console.log(`Found ${results.candidates} candidate(s) for reconciliation`);

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
    }

    // Cache integrations per user — most users have one or two activities per run.
    const integrationCache = new Map();

    for (const activity of candidates) {
      try {
        if (!activity.start_date) {
          results.skipped_no_start_date++;
          continue;
        }

        // Look up active integration (cached)
        let integration = integrationCache.get(activity.user_id);
        if (integration === undefined) {
          const { data: rows } = await supabase
            .from('bike_computer_integrations')
            .select('user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, status, sync_enabled')
            .eq('user_id', activity.user_id)
            .eq('provider', 'garmin')
            .eq('status', 'active')
            .eq('sync_enabled', true)
            .maybeSingle();
          integration = rows || null;
          integrationCache.set(activity.user_id, integration);
        }

        if (!integration) {
          results.skipped_no_integration++;
          // If user has no active integration and we're at max attempts,
          // they're never coming back — mark unrecoverable.
          await maybeMarkUnrecoverable(activity, 'no active garmin integration', results);
          continue;
        }

        if (integration.refresh_token_invalid) {
          results.skipped_no_token++;
          // Don't mark unrecoverable here — user might reconnect and we'd
          // want to retry. Just skip this run.
          continue;
        }

        // Refresh token if needed
        let accessToken;
        try {
          accessToken = await ensureValidAccessToken(integration, supabase);
        } catch (tokenErr) {
          console.warn(`Token refresh failed for user ${activity.user_id}: ${tokenErr.message}`);
          results.skipped_no_token++;
          continue;
        }

        const startTimeInSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
        const requested = await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);

        // Always bump the counter even on 409 / failed — the attempt was made
        // and we don't want to spin forever on the same broken activity.
        const nextCount = (activity.resync_attempt_count || 0) + 1;
        const { error: updErr } = await supabase
          .from('activities')
          .update({
            last_resync_requested_at: new Date().toISOString(),
            resync_attempt_count: nextCount,
          })
          .eq('id', activity.id);
        if (updErr) {
          console.warn(`Could not record resync attempt for ${activity.id}: ${updErr.message}`);
        }

        if (requested) {
          results.requested++;
        } else {
          results.backfill_failed++;
        }

        // If this was the final attempt, evaluate unrecoverable.
        if (nextCount >= MAX_ATTEMPTS) {
          const ageHours = (Date.now() - new Date(activity.start_date).getTime()) / 3_600_000;
          if (ageHours >= UNRECOVERABLE_AGE_HOURS) {
            await maybeMarkUnrecoverable(activity, `max attempts reached (age=${Math.round(ageHours)}h)`, results);
          }
        }
      } catch (perActivityErr) {
        results.errors++;
        console.error(`Reconcile failed for activity ${activity.id}:`, perActivityErr.message);
        captureServerError(perActivityErr, {
          tag: 'garmin.reconcile_error',
          extra: { activity_id: activity.id, user_id: activity.user_id },
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
    },
  });
  console.warn(`🪦 Marked activity ${activity.id} unrecoverable: ${reason}`);
}
