/**
 * Diagnostic: request a §7.3 Activity Details backfill for one specific
 * activity, and report Garmin's response status.
 *
 * Why this exists: as of 2026-06-05 we've been unable to make the
 * Activity Details pull path work, because Garmin returns
 * InvalidPullTokenException on direct calls to /wellness-api/rest/activityDetails
 * with OAuth Bearer auth (spec requires a pull token from a ping's callbackURL).
 *
 * The /wellness-api/rest/backfill/activityDetails endpoint is a SEPARATE
 * backfill request endpoint we haven't tried — it asks Garmin to re-send
 * an ACTIVITY_DETAIL_PING for a time window, which would arrive at our
 * Cloudflare worker with a fresh callbackURL containing the embedded
 * pull token. That's the auth Garmin actually requires for §7.3.
 *
 * This endpoint makes one such backfill request and reports what Garmin
 * said. Three meaningful outcomes:
 *
 *   202 Accepted          → Garmin will async-send an ACTIVITY_DETAIL_PING.
 *                           Watch garmin_webhook_events for the new row.
 *                           If that works, we can recover all stuck rides.
 *
 *   409 Already processed → Same dead end as /backfill/activities. The
 *                           18+ stuck rides are unrecoverable via this path.
 *
 *   412 Precondition      → User consent does not authorize Activity Details
 *                           (which would also explain why no ACTIVITY_DETAIL_PING
 *                           notifications have ever arrived organically). Need
 *                           to disconnect+reconnect with that scope granted.
 *
 * No DB writes. Pure diagnostic. Auth: Bearer (user's Supabase access token),
 * activity must belong to the calling user.
 *
 * Manual invocation (from the tribos.studio browser console while logged in):
 *
 *   const { data: { session } } = await supabase.auth.getSession();
 *   fetch('/api/garmin2-request-activity-details-backfill', {
 *     method: 'POST',
 *     headers: {
 *       Authorization: `Bearer ${session.access_token}`,
 *       'Content-Type': 'application/json'
 *     },
 *     body: JSON.stringify({ activityId: '<uuid>' })
 *   }).then(r => r.json()).then(console.log);
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

const supabase = getSupabaseAdmin();

const GARMIN_BACKFILL_ACTIVITY_DETAILS_URL =
  'https://apis.garmin.com/wellness-api/rest/backfill/activityDetails';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Auth ----------------------------------------------------------------
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { data: { user: authUser }, error: authError } =
    await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !authUser) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // --- Input ---------------------------------------------------------------
  const { activityId } = req.body || {};
  if (!activityId || typeof activityId !== 'string') {
    return res.status(400).json({ error: 'activityId (string) required in body' });
  }

  try {
    // --- Activity + ownership check ---------------------------------------
    const { data: activity, error: actErr } = await supabase
      .from('activities')
      .select('id, user_id, provider, provider_activity_id, start_date, data_completeness, name')
      .eq('id', activityId)
      .maybeSingle();

    if (actErr) {
      console.error('activity lookup failed:', actErr);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    if (activity.user_id !== authUser.id) {
      return res.status(403).json({ error: 'Not your activity' });
    }
    if (activity.provider !== 'garmin') {
      return res.status(400).json({ error: 'Only garmin activities are supported by this endpoint' });
    }
    if (!activity.start_date) {
      return res.status(400).json({ error: 'Activity has no start_date — cannot calculate window' });
    }

    // --- Integration lookup -----------------------------------------------
    // Same filter as every other garmin2-* reader: sync_enabled +
    // refresh_token_invalid. NEVER status (phantom column).
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled')
      .eq('user_id', authUser.id)
      .eq('provider', 'garmin')
      .eq('sync_enabled', true)
      .eq('refresh_token_invalid', false)
      .maybeSingle();

    if (!integration) {
      return res.status(400).json({
        error: 'No active Garmin integration. Reconnect Garmin in Settings.',
        requiresReconnect: true,
      });
    }

    // --- Token refresh via mutex ------------------------------------------
    let accessToken;
    try {
      accessToken = await ensureValidAccessToken(integration, supabase);
    } catch (err) {
      return res.status(401).json({
        error: 'Token refresh failed; reconnect Garmin in Settings',
        details: err.message,
        requiresReconnect: true,
      });
    }

    // --- Build the time window --------------------------------------------
    // Same window pattern as the existing requestActivityDetailsBackfill
    // helper: 1h before activity start to 2h after. 3h is well within
    // Garmin's published backfill query limits and brackets the upload
    // time for almost all real activities.
    const startTimeInSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
    const summaryStartTimeInSeconds = startTimeInSeconds - 3600;
    const summaryEndTimeInSeconds = startTimeInSeconds + 7200;

    const url =
      `${GARMIN_BACKFILL_ACTIVITY_DETAILS_URL}` +
      `?summaryStartTimeInSeconds=${summaryStartTimeInSeconds}` +
      `&summaryEndTimeInSeconds=${summaryEndTimeInSeconds}`;

    console.log(`📤 [BACKFILL-DETAILS] requesting for activity ${activity.provider_activity_id}, window ${new Date(summaryStartTimeInSeconds * 1000).toISOString()} → ${new Date(summaryEndTimeInSeconds * 1000).toISOString()}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const body = await response.text().catch(() => '');
    console.log(`📥 [BACKFILL-DETAILS] Garmin responded ${response.status}: ${body.substring(0, 200)}`);

    // --- Interpret the result for the caller ------------------------------
    let meaning;
    if (response.status === 202) {
      meaning = 'Accepted. Garmin will async-send an ACTIVITY_DETAIL_PING with a callbackURL containing the embedded pull token. Watch garmin_webhook_events for the new row over the next few minutes. If a ping arrives, the recovery path works for this and similar stuck activities.';
    } else if (response.status === 409) {
      meaning = 'Garmin considers this window already processed — no ping will arrive. Same dead end as /backfill/activities. The 18+ stuck rides are not recoverable through this path.';
    } else if (response.status === 412) {
      meaning = 'Precondition failed — user consent does not authorize Activity Details. This would also explain why no ACTIVITY_DETAIL_PING notifications have ever arrived organically. Disconnect+reconnect and grant Activity Details on the consent screen.';
    } else if (response.status === 401 || response.status === 403) {
      meaning = 'Auth failure. Token may have just expired between refresh and call; try again.';
    } else if (response.status === 400) {
      meaning = 'Bad request from our side — likely a window-math bug. See garmin_response for Garmin\'s reason.';
    } else if (response.status === 410) {
      meaning = 'Endpoint no longer available for this consumer key.';
    } else {
      meaning = `Unexpected status; see garmin_response.`;
    }

    return res.status(200).json({
      activity: {
        id: activity.id,
        name: activity.name,
        provider_activity_id: activity.provider_activity_id,
        start_date: activity.start_date,
        data_completeness: activity.data_completeness,
      },
      window: {
        start_sec: summaryStartTimeInSeconds,
        end_sec: summaryEndTimeInSeconds,
        start_iso: new Date(summaryStartTimeInSeconds * 1000).toISOString(),
        end_iso: new Date(summaryEndTimeInSeconds * 1000).toISOString(),
      },
      garmin_status: response.status,
      garmin_response: body.substring(0, 500),
      meaning,
    });
  } catch (err) {
    console.error('garmin2-request-activity-details-backfill crashed:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
