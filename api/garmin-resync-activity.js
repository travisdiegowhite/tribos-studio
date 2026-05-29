/**
 * Garmin per-activity re-sync — user-triggered escape hatch
 * =========================================================================
 *
 * Phase 5 of the Garmin reliability rollout. The reconciliation cron
 * (/api/garmin-reconcile, every 15 min) is the steady-state safety net;
 * this endpoint is the "fix it now" button the user clicks from the
 * activity detail page when they don't want to wait.
 *
 * POST /api/garmin-resync-activity
 *   Auth:  Bearer <supabase access_token>     (user must own the activity)
 *   Body:  { activity_id: string }
 *   Returns:
 *     200 { success: true, status: 'requested'|'already_full'|'no_token'|'no_integration',
 *           data_completeness, resync_attempt_count }
 *     400 / 401 / 403 / 404 / 409 / 500 on errors
 *
 * Behavior:
 *   - If the activity is already `full`, returns `already_full` without
 *     calling Garmin (cheap idempotency for accidental double-clicks).
 *   - If the user has no active Garmin integration or their refresh
 *     token is invalid, returns the reason — caller surfaces a
 *     "reconnect Garmin" prompt.
 *   - Otherwise calls requestActivityDetailsBackfill, bumps
 *     resync_attempt_count, stamps last_resync_requested_at.
 *   - Rate-limited per-user: at most one request per activity per
 *     5 minutes. Garmin's 409 throttle is ~60min on their side, so
 *     more aggressive than that just wastes API calls. Returns 429
 *     when throttled.
 *   - Respects the same MAX_ATTEMPTS=5 ceiling as the cron. After
 *     that, returns 409 with `at_max_attempts` so the UI can flip
 *     the button into a "give up / contact support" state.
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
      .select('id, user_id, provider, start_date, type, provider_activity_id, data_completeness, resync_attempt_count, last_resync_requested_at')
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

    // Look up integration
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, status, sync_enabled')
      .eq('user_id', authUser.id)
      .eq('provider', 'garmin')
      .eq('status', 'active')
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

    const startTimeInSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
    const ok = await requestActivityDetailsBackfill(accessToken, startTimeInSeconds);

    const nextCount = (activity.resync_attempt_count || 0) + 1;
    await supabase
      .from('activities')
      .update({
        last_resync_requested_at: new Date().toISOString(),
        resync_attempt_count: nextCount,
      })
      .eq('id', activity.id);

    return res.status(200).json({
      success: true,
      status: ok ? 'requested' : 'backfill_failed',
      data_completeness: activity.data_completeness,
      resync_attempt_count: nextCount,
      attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
      message: ok
        ? 'Re-sync requested. Garmin usually delivers within 1–5 minutes; refresh shortly.'
        : 'Re-sync request did not go through. Try again in a moment.',
    });
  } catch (err) {
    console.error('garmin-resync-activity crashed:', err);
    captureServerError(err, { tag: 'garmin.resync_endpoint_crash' });
    return res.status(500).json({ success: false, error: 'Re-sync failed', details: err.message });
  }
}
