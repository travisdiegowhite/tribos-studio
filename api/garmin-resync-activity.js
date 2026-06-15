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
import { requestActivityDetailsBackfill } from './utils/garmin/garminApiClient.js';
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

    // The §7.3 direct pull path that used to live here was removed in
    // 2026-06-12: Garmin rejects it with `InvalidPullTokenException` because
    // direct activityDetails calls require a pull token from a ping
    // callbackURL, not OAuth Bearer (spec §4.2 + §6). The error was
    // surfacing as a confusing "Bad time range" 500 to users because the
    // 400 from Garmin was misclassified as a BadRangeError.
    //
    // What we actually do now is the same thing the legacy cron does for
    // stuck activities: ask Garmin to re-send the ACTIVITY_FILE_DATA
    // webhook for this activity's time window. Garmin's response is
    // usually one of:
    //   202 → queued, a fresh webhook may arrive within minutes
    //   409 → "duplicate backfill processed" — Garmin won't re-send
    // Either way `requestActivityDetailsBackfill` returns true (it treats
    // 202 and 409 both as "request accepted"). The user-facing message
    // doesn't promise success — only that we tried.
    const nextCount = (activity.resync_attempt_count || 0) + 1;
    let nudged = false;
    try {
      const startTimeInSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
      nudged = await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);
    } catch (bfErr) {
      console.warn(`Backfill nudge failed for ${activity.id}: ${bfErr.message}`);
      captureServerError(bfErr, {
        tag: 'garmin.resync_backfill_error',
        extra: { activity_id: activity.id, user_id: activity.user_id },
      });
    }
    await stampAttempt(activity.id, nextCount);

    return res.status(200).json({
      success: nudged,
      status: nudged ? 'backfill_requested' : 'still_waiting',
      data_completeness: activity.data_completeness,
      resync_attempt_count: nextCount,
      attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
      message: nudged
        ? "We've asked Garmin to re-send the FIT data for this ride. If they honor the request, the activity will fill in within a few minutes — refresh the page to check. If it's been older than 24 hours, Garmin usually won't re-send (they consider it already delivered)."
        : "Couldn't reach Garmin right now. Try again in a few minutes.",
    });
  } catch (err) {
    console.error('garmin-resync-activity crashed:', err);
    captureServerError(err, { tag: 'garmin.resync_endpoint_crash' });
    return res.status(500).json({ success: false, error: 'Re-sync failed', details: err.message });
  }
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
