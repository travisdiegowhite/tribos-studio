/**
 * Garmin Health API client functions
 * All functions accept accessToken as a parameter (no module-level state)
 */

/**
 * Fetch activity details from Garmin Health API.
 * The webhook only contains minimal data - this fetches full details.
 *
 * @param {string} accessToken - Valid Garmin OAuth access token
 * @param {string} summaryId - Garmin activity summary ID
 * @returns {Promise<object|null>} Activity details or null on failure
 */
export async function fetchGarminActivityDetails(accessToken, summaryId) {
  try {
    console.log('🔍 Fetching activity details from Garmin API for summaryId:', summaryId);

    const apiUrl = `https://apis.garmin.com/wellness-api/rest/activities?summaryId=${summaryId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Garmin API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Garmin API authentication failed: ${response.status}`);
      }

      console.warn('⚠️ Could not fetch activity details from Garmin API, will use webhook data');
      return null;
    }

    const activities = await response.json();

    if (Array.isArray(activities) && activities.length > 0) {
      const activity = activities[0];
      console.log('✅ Fetched activity details from Garmin API:', {
        activityName: activity.activityName,
        activityType: activity.activityType,
        distance: activity.distanceInMeters ? `${(activity.distanceInMeters / 1000).toFixed(2)} km` : 'N/A',
        duration: activity.durationInSeconds ? `${Math.round(activity.durationInSeconds / 60)} min` : 'N/A',
        avgHR: activity.averageHeartRateInBeatsPerMinute || 'N/A',
        avgPower: activity.averageBikingPowerInWatts || 'N/A',
        elevation: activity.elevationGainInMeters || 'N/A'
      });
      return activity;
    }

    console.warn('⚠️ Garmin API returned empty or unexpected response:', activities);
    return null;

  } catch (error) {
    console.error('❌ Error fetching activity from Garmin API:', error.message);
    return null;
  }
}

/**
 * Request activity backfill from Garmin for a specific time window.
 * Triggers Garmin to send PING notifications with FIT file callbackURLs.
 *
 * IMPORTANT from Garmin API docs (Section 8 - Summary Backfill):
 * - There is NO /backfill/activityFiles endpoint (returns 404)
 * - /backfill/activities handles BOTH activity summaries AND activity files
 * - The callbackURL is valid for 24 hours only
 * - Duplicate downloads are rejected with HTTP 410
 *
 * @param {string} accessToken - Valid Garmin access token
 * @param {number} startTimeInSeconds - Activity start time (epoch seconds)
 * @returns {Promise<boolean>} true if backfill was requested successfully
 */
export async function requestActivityDetailsBackfill(accessToken, startTimeInSeconds) {
  try {
    if (!startTimeInSeconds || !accessToken) {
      console.log('ℹ️ Cannot request backfill: missing startTime or accessToken');
      return false;
    }

    const startTimestamp = startTimeInSeconds - 3600; // 1 hour before
    const endTimestamp = startTimeInSeconds + 7200;   // 2 hours after

    const backfillUrl = `https://apis.garmin.com/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

    console.log('📤 Requesting activity backfill (includes FIT files via PING)...');
    console.log(`   Time range: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`);

    const response = await fetch(backfillUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 202 || response.status === 409 || response.ok) {
      console.log('✅ Activity backfill requested - activityFiles PING will arrive with FIT callbackURL');
      return true;
    }

    const errorText = await response.text();
    console.warn('⚠️ Activity backfill request failed:', response.status, errorText.substring(0, 100));
    return false;

  } catch (error) {
    console.warn('⚠️ Could not request activity backfill:', error.message);
    return false;
  }
}

const PARTNER_GATEWAY_BASE = 'https://apis.garmin.com/partner-gateway/rest';
// The pre-2.0 path. Garmin's OAuth2 PKCE spec 2.0 documents the user
// endpoints under partner-gateway; this stays as a fallback until the new
// path has been confirmed for every user.
const LEGACY_USER_ID_URL = 'https://apis.garmin.com/wellness-api/rest/user/id';

/**
 * Fetch the Garmin User ID for an access token. This ID is the linchpin for
 * webhook matching (bike_computer_integrations.provider_user_id) — without
 * it every webhook for the user is unmatchable. Used by api/garmin-auth.js
 * exchange/repair, the webhook processor and token maintenance (to self-heal
 * NULL provider_user_id rows).
 *
 * Tries the documented partner-gateway path first and falls back to the
 * legacy wellness-api path on a 404.
 *
 * @param {string} accessToken - Valid Garmin OAuth access token
 * @returns {Promise<string|null>} Garmin user ID, or null on failure
 */
export async function fetchGarminUserId(accessToken) {
  for (const url of [`${PARTNER_GATEWAY_BASE}/user/id`, LEGACY_USER_ID_URL]) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        console.warn('⚠️ Garmin /user/id fetch failed:', response.status);
        return null;
      }
      const data = await response.json();
      return data?.userId ? String(data.userId) : null;
    } catch (error) {
      console.warn('⚠️ Garmin /user/id fetch error:', error.message);
      return null;
    }
  }
  return null;
}

/**
 * Fetch the permissions the user granted at consent time (OAuth2 PKCE spec
 * §8), e.g. ['ACTIVITY_EXPORT', 'HEALTH_EXPORT', 'COURSE_IMPORT'].
 * Later changes arrive through the userPermissionsChange webhook.
 *
 * @param {string} accessToken - Valid Garmin OAuth access token
 * @returns {Promise<string[]|null>} Granted permissions, or null on failure
 */
export async function fetchGarminPermissions(accessToken) {
  try {
    const response = await fetch(`${PARTNER_GATEWAY_BASE}/user/permissions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      console.warn('⚠️ Garmin /user/permissions fetch failed:', response.status);
      return null;
    }
    const data = await response.json();
    return Array.isArray(data?.permissions) ? data.permissions : null;
  } catch (error) {
    console.warn('⚠️ Garmin /user/permissions fetch error:', error.message);
    return null;
  }
}

/**
 * Delete the user's registration with Garmin (OAuth2 PKCE spec §6). Garmin
 * requires this whenever tribos offers a disconnect or delete-account path:
 * without it the user stays registered and Garmin keeps pushing their data.
 * Garmin answers with a deregistration notification, which the webhook
 * receivers treat as an idempotent cleanup.
 *
 * Never throws: a failed call must not block the local disconnect.
 *
 * @param {string} accessToken - Valid Garmin OAuth access token
 * @returns {Promise<{ok: boolean, status: number}>}
 */
export async function deregisterGarminUser(accessToken) {
  if (!accessToken) return { ok: false, status: 0 };
  try {
    const response = await fetch(`${PARTNER_GATEWAY_BASE}/user/registration`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('⚠️ Garmin DELETE /user/registration failed:', response.status, body.substring(0, 200));
    }
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.warn('⚠️ Garmin DELETE /user/registration error:', error.message);
    return { ok: false, status: 0 };
  }
}

// ============================================================================
// Activity Details PULL endpoint (Activity API v1.2.5 §7.3)
// ============================================================================
//
// This is the recovery path used by the reconciler and the user "Re-sync"
// button when Garmin's ACTIVITY_FILE_DATA webhook (§7.4) never arrived.
// The Pull endpoint returns the same sample data (lat/lon/HR/power/cadence)
// as a webhook would have delivered — JSON, not FIT.
//
// Compliance (§8): PULL-ONLY integrations are not allowed. We are push-based
// with pull-as-reconciliation, which is permitted.

// Typed errors so callers can map to per-activity skip reasons without
// re-parsing strings.
export class GarminPullError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GarminPullError';
    this.status = status;
  }
}
export class BadRangeError extends GarminPullError {}
export class AuthError extends GarminPullError {}
export class ConsentRevokedError extends GarminPullError {}

/**
 * Pull Activity Details for a 24-hour upload window.
 *
 * @param {string} accessToken
 * @param {number} startSec - Unix seconds, inclusive
 * @param {number} endSec   - Unix seconds, exclusive. Must be > startSec
 *                            and (endSec - startSec) <= 86400 per spec §7.
 * @returns {Promise<Array>} The §7.3 response array. Each element has
 *   { summaryId, activityId, summary: {...}, samples: [...], laps: [...] }.
 *   Returns [] on 200 with empty body / no activities in window.
 * @throws {BadRangeError}        on HTTP 400
 * @throws {AuthError}            on HTTP 401 or 403
 * @throws {ConsentRevokedError}  on HTTP 412 (user revoked summary consent)
 * @throws {GarminPullError}      on any other non-2xx
 */
export async function fetchActivityDetailsByUploadRange(accessToken, startSec, endSec) {
  if (!accessToken) throw new Error('accessToken required');
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    throw new RangeError('startSec and endSec must be finite numbers');
  }
  if (endSec <= startSec) {
    throw new RangeError(`endSec (${endSec}) must be > startSec (${startSec})`);
  }
  if (endSec - startSec > 86400) {
    throw new RangeError(`Window ${endSec - startSec}s exceeds 24h cap (86400s)`);
  }

  const url = `https://apis.garmin.com/wellness-api/rest/activityDetails`
    + `?uploadStartTimeInSeconds=${startSec}`
    + `&uploadEndTimeInSeconds=${endSec}`;

  console.log('📥 [PULL] activityDetails',
    new Date(startSec * 1000).toISOString(), '→',
    new Date(endSec * 1000).toISOString());

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (response.status === 200) {
    const text = await response.text();
    if (!text || text.trim() === '' || text.trim() === '[]') return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        console.warn('⚠️ [PULL] activityDetails returned non-array:', typeof parsed);
        return [];
      }
      return parsed;
    } catch (parseErr) {
      throw new GarminPullError(`Malformed JSON: ${parseErr.message}`, 200);
    }
  }

  const body = await response.text().catch(() => '');
  const snippet = body.substring(0, 200);

  if (response.status === 400) {
    throw new BadRangeError(`Bad request: ${snippet}`, 400);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Auth failed (${response.status}): ${snippet}`, response.status);
  }
  if (response.status === 412) {
    throw new ConsentRevokedError(`Consent revoked: ${snippet}`, 412);
  }
  throw new GarminPullError(
    `Pull failed (${response.status}): ${snippet}`,
    response.status,
  );
}
