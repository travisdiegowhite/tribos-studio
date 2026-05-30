/**
 * Garmin per-activity re-sync — user-triggered escape hatch
 * =========================================================================
 *
 * Phase 5 installed this endpoint; Phase 7 upgrades it to do an active
 * Pull from Garmin's `/wellness-api/rest/activityDetails` endpoint
 * (Activity API v1.2.5 §7.3) instead of merely asking Garmin to re-send
 * a webhook. The reconciliation cron `/api/garmin-reconcile` runs the
 * same logic every 15 min; this endpoint is the "fix it now" button for
 * users who don't want to wait.
 *
 * Per spec §8, PULL-ONLY integrations are not allowed. The webhook
 * processor in `api/garmin-webhook-process.js` is the steady-state
 * primary path; this Pull is a reconciliation fallback.
 *
 * POST /api/garmin-resync-activity
 *   Auth:  Bearer <supabase access_token>     (user must own the activity)
 *   Body:  { activity_id: string }
 *   Returns 200 with:
 *     status = 'recovered_with_data'  Pull matched, streams written, row now 'full'
 *            | 'still_waiting'        Pull empty; activity still pending
 *            | 'already_full'         Idempotent no-op
 *            | 'throttled'            <5min since last attempt (429)
 *            | 'at_max_attempts'      ≥5 attempts (409)
 *            | 'no_integration'       User disconnected Garmin
 *            | 'no_token'             Refresh token expired
 *            | 'consent_revoked'      User revoked Activity Details consent
 *
 * Behavior:
 *   - If the activity is already `full`, returns `already_full` without
 *     calling Garmin (cheap idempotency for accidental double-clicks).
 *   - Otherwise: Pull a 24h window around the activity's upload time, look
 *     for a match by activityId / summaryId. If found, write streams and
 *     refresh completeness — the row flips to 'full' in this same call.
 *   - If Pull returns nothing, fall back to the legacy webhook backfill
 *     request and stamp the counter so the next click is throttled.
 *   - Rate-limited per-activity: at most one request per 5 minutes.
 *   - Respects MAX_ATTEMPTS=5 — same ceiling as the cron.
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
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const MAX_ATTEMPTS = 5;
const USER_THROTTLE_MINUTES = 5;

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const { activity_id } = req.body || {};
    if (!activity_id || typeof activity_id !== 'string') {
      return res.status(400).json({ success: false, error: 'activity_id required' });
    }

    // Fetch + ownership check in one round trip
    const { data: activity, error: actErr } = await supabase
      .from('activities')
      .select('id, user_id, provider, start_date, created_at, type, provider_activity_id, data_completeness, resync_attempt_count, last_resync_requested_at')
      .eq('id', activity_id)
      .maybeSingle();

    if (actErr) {
      console.error('Activity lookup failed:', actErr);
      return res.status(500).json({ success: false, error: 'Lookup failed' });
    }
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }
    if (activity.user_id !== authUser.id) {
      return res.status(403).json({ success: false, error: 'Not your activity' });
    }
    if (activity.provider !== 'garmin') {
      return res.status(400).json({ success: false, error: 'Re-sync only supported for Garmin activities' });
    }

    if (activity.data_completeness === 'full') {
      return res.status(200).json({
        success: true,
        status: 'already_full',
        data_completeness: 'full',
        resync_attempt_count: activity.resync_attempt_count,
      });
    }

    if ((activity.resync_attempt_count || 0) >= MAX_ATTEMPTS) {
      return res.status(409).json({
        success: false,
        status: 'at_max_attempts',
        error: `Already attempted ${MAX_ATTEMPTS} times. Garmin will not provide more data for this activity.`,
        data_completeness: activity.data_completeness,
        resync_attempt_count: activity.resync_attempt_count,
      });
    }

    // Per-activity user throttle
    if (activity.last_resync_requested_at) {
      const sinceLast = Date.now() - new Date(activity.last_resync_requested_at).getTime();
      if (sinceLast < USER_THROTTLE_MINUTES * 60_000) {
        const waitSeconds = Math.ceil((USER_THROTTLE_MINUTES * 60_000 - sinceLast) / 1000);
        return res.status(429).json({
          success: false,
          status: 'throttled',
          error: `Please wait ${waitSeconds}s before requesting another re-sync.`,
          retry_after_seconds: waitSeconds,
        });
      }
    }

    if (!activity.start_date) {
      return res.status(400).json({ success: false, error: 'Activity has no start_date — cannot request backfill' });
    }

    // Look up integration. NOTE: bike_computer_integrations has no `status`
    // column (see database/create_bike_computer_integrations.sql) — it has
    // `sync_enabled`. Earlier Phase 7 code filtered on a phantom status, which
    // caused PostgREST to error and the integration lookup to return null,
    // making the resync silently inert. Fixed in the hotfix preceding the
    // ping/pull rebuild.
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled')
      .eq('user_id', authUser.id)
      .eq('provider', 'garmin')
      .eq('sync_enabled', true)
      .maybeSingle();

    if (!integration) {
      return res.status(200).json({
        success: false,
        status: 'no_integration',
        error: 'No active Garmin integration. Reconnect Garmin in Settings.',
        data_completeness: activity.data_completeness,
      });
    }
    if (integration.refresh_token_invalid) {
      return res.status(200).json({
        success: false,
        status: 'no_token',
        error: 'Garmin token expired. Reconnect Garmin in Settings.',
        data_completeness: activity.data_completeness,
      });
    }

    let accessToken;
    try {
      accessToken = await ensureValidAccessToken(integration, supabase);
    } catch (tokenErr) {
      console.warn(`Token refresh failed for ${authUser.id}: ${tokenErr.message}`);
      return res.status(200).json({
        success: false,
        status: 'no_token',
        error: 'Garmin token refresh failed. Reconnect Garmin in Settings.',
        data_completeness: activity.data_completeness,
      });
    }

    // Pull-first: build a 24h window centered around the activity's
    // upload time and ask Garmin directly for the detailed sample data.
    // Spec §7.3 caps the window at 24h; we anchor on created_at (when
    // OUR webhook handler stored the activity, which closely tracks
    // Garmin's upload time) with a 1h pre-roll for clock-skew tolerance.
    const anchorMs = new Date(activity.created_at || activity.start_date).getTime();
    const startSec = Math.floor(anchorMs / 1000) - 3600;     // -1h
    const endSec = startSec + 86400;                          // +23h relative to anchor
    const nextCount = (activity.resync_attempt_count || 0) + 1;

    let details;
    try {
      details = await fetchActivityDetailsByUploadRange(accessToken, startSec, endSec);
    } catch (pullErr) {
      if (pullErr instanceof ConsentRevokedError) {
        return res.status(200).json({
          success: false,
          status: 'consent_revoked',
          error: 'Garmin Activity Details consent was revoked. Reconnect Garmin in Settings.',
          data_completeness: activity.data_completeness,
        });
      }
      if (pullErr instanceof AuthError) {
        return res.status(200).json({
          success: false,
          status: 'no_token',
          error: 'Garmin authentication failed. Reconnect Garmin in Settings.',
          data_completeness: activity.data_completeness,
        });
      }
      if (pullErr instanceof BadRangeError) {
        // Programmer error in window math; surface as 500 for monitoring.
        console.error('garmin-resync bad range:', pullErr.message);
        captureServerError(pullErr, {
          tag: 'garmin.resync_bad_range',
          extra: { activity_id: activity.id, startSec, endSec },
        });
        return res.status(500).json({ success: false, error: 'Bad time range' });
      }
      // Generic Pull failure (5xx, network). Don't give up; bump the counter
      // so the user can try again after the throttle and the cron will pick
      // it up on the next 15 min tick.
      console.warn(`Pull failed for ${activity.id}: ${pullErr.message}`);
      await stampAttempt(activity.id, nextCount);
      return res.status(200).json({
        success: false,
        status: 'still_waiting',
        error: 'Garmin temporarily unavailable. Try again shortly.',
        data_completeness: activity.data_completeness,
        resync_attempt_count: nextCount,
        attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
      });
    }

    // Look for a match in the returned details.
    const targetId = String(activity.provider_activity_id);
    const match = (details || []).find(d => {
      if (d.activityId != null && String(d.activityId) === targetId) return true;
      if (d.summaryId && String(d.summaryId).replace(/-detail$/, '') === targetId) return true;
      return false;
    });

    if (match) {
      try {
        await writeStreamsFromDetail(activity, match, nextCount);
      } catch (writeErr) {
        console.error('writeStreams failed:', writeErr);
        captureServerError(writeErr, {
          tag: 'garmin.resync_write_error',
          extra: { activity_id: activity.id, user_id: activity.user_id },
        });
        return res.status(500).json({ success: false, error: 'Failed to save activity data' });
      }
      return res.status(200).json({
        success: true,
        status: 'recovered_with_data',
        data_completeness: 'full',
        resync_attempt_count: nextCount,
        attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
        message: 'Activity data recovered from Garmin. Refresh to see the full ride.',
      });
    }

    // No match. Fall back to a webhook backfill nudge (sometimes works for
    // recent activities Garmin's pipeline hasn't surfaced yet) and stamp
    // the attempt so the throttle kicks in.
    let nudged = false;
    try {
      const startTimeInSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
      nudged = await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);
    } catch (bfErr) {
      console.warn(`Backfill nudge failed for ${activity.id}: ${bfErr.message}`);
    }
    await stampAttempt(activity.id, nextCount);

    return res.status(200).json({
      success: false,
      status: 'still_waiting',
      data_completeness: activity.data_completeness,
      resync_attempt_count: nextCount,
      attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
      message: nudged
        ? "Garmin hasn't released the full file for this ride yet. We've asked them to re-send it — try again in a few minutes."
        : "Garmin hasn't released the full file for this ride yet. Try again in a few minutes.",
    });
  } catch (err) {
    console.error('garmin-resync-activity crashed:', err);
    captureServerError(err, { tag: 'garmin.resync_endpoint_crash' });
    return res.status(500).json({ success: false, error: 'Re-sync failed', details: err.message });
  }
}

// Write the parsed streams + powerMetrics into the activity row, stamp the
// reconciliation attempt counters in the same UPDATE, then refresh
// data_completeness so the row flips to 'full' atomically with the data
// write. Mirrors the shape `processFitFile` writes in
// api/garmin-webhook-process.js so downstream consumers don't care which
// path delivered the data.
async function writeStreamsFromDetail(activity, detail, nextCount) {
  const result = extractStreamsFromActivityDetails(detail);
  if (result.error) {
    throw new Error(`extractStreams failed: ${result.error}`);
  }
  const update = {
    updated_at: new Date().toISOString(),
    last_resync_requested_at: new Date().toISOString(),
    resync_attempt_count: nextCount,
  };
  if (result.polyline) update.map_summary_polyline = result.polyline;
  if (result.activityStreams) update.activity_streams = result.activityStreams;

  const pm = result.powerMetrics;
  if (pm) {
    if (pm.avgPower != null) update.average_watts = pm.avgPower;
    if (pm.normalizedPower != null) {
      // Dual-write canonical + legacy per CLAUDE.md metric freeze.
      update.normalized_power = pm.normalizedPower;
      update.effective_power = pm.normalizedPower;
    }
    if (pm.maxPower != null) update.max_watts = pm.maxPower;
    if (pm.powerCurveSummary) update.power_curve_summary = pm.powerCurveSummary;
    if (pm.workKj != null) update.kilojoules = pm.workKj;
    update.device_watts = true;
  }

  const { error: updErr } = await supabase
    .from('activities')
    .update(update)
    .eq('id', activity.id);
  if (updErr) throw updErr;

  await refreshCompleteness(supabase, activity.id);
}

async function stampAttempt(activityId, nextCount) {
  const { error } = await supabase
    .from('activities')
    .update({
      last_resync_requested_at: new Date().toISOString(),
      resync_attempt_count: nextCount,
    })
    .eq('id', activityId);
  if (error) console.warn(`Could not stamp resync attempt for ${activityId}: ${error.message}`);
}
