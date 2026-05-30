/**
 * pullActivity — retrieve one Activity Details payload for a ping row.
 *
 * Part of the Garmin ping/pull rebuild. Garmin pings carry a pre-authorized
 * `callbackURL` that targets the exact upload window the ping describes;
 * fetching it returns the same shape as the §7.3 `activityDetails` window
 * endpoint. We try the callbackURL first (one round trip, exact window) and
 * fall back to the explicit window endpoint when the URL is missing or
 * expired (Garmin's callbackURLs expire ~24h after issue).
 *
 * Both paths return the standard §7.3 array shape:
 *   [{ summaryId, activityId, summary: {...}, samples: [...], laps: [...] }, ...]
 *
 * This module is I/O only. It does NOT touch Supabase. The caller
 * (`api/garmin2-pull.js`) is responsible for queue lifecycle (claim, mark
 * processed, mark failed) and for handing matched details to `writeActivity`.
 */

import {
  fetchActivityDetailsByUploadRange,
  GarminPullError,
  BadRangeError,
  AuthError,
  ConsentRevokedError,
} from '../garmin/garminApiClient.js';

// Re-export the typed errors so callers in `garmin2/` can `import` from a
// single namespace without reaching back into the legacy `garmin/` tree.
export { GarminPullError, BadRangeError, AuthError, ConsentRevokedError };

/**
 * GET the callbackURL directly with the user's bearer token.
 *
 * Same response shape as the window endpoint: an array of detail objects.
 * Garmin pre-signs the URL and embeds the upload window as query params, so
 * we don't have to know what they were — the URL itself targets the exact
 * window.
 *
 * @param {string} callbackURL
 * @param {string} accessToken
 * @returns {Promise<Array>}
 * @throws {AuthError}            on HTTP 401 / 403
 * @throws {ConsentRevokedError}  on HTTP 412
 * @throws {GarminPullError}      on any other non-2xx
 */
export async function fetchActivityDetailsByCallbackURL(callbackURL, accessToken) {
  if (!callbackURL) throw new Error('callbackURL required');
  if (!accessToken) throw new Error('accessToken required');

  const response = await fetch(callbackURL, {
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
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      throw new GarminPullError(`Malformed JSON from callbackURL: ${err.message}`, 200);
    }
  }

  const snippet = (await response.text().catch(() => '')).substring(0, 200);
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`callbackURL auth failed (${response.status}): ${snippet}`, response.status);
  }
  if (response.status === 410) {
    // Pre-signed URL expired or already-consumed. Caller should fall back to
    // the explicit-window endpoint reconstructed from the ping payload's
    // uploadStart/EndTimeInSeconds.
    throw new GarminPullError(`callbackURL gone (410): ${snippet}`, 410);
  }
  if (response.status === 412) {
    throw new ConsentRevokedError(`Consent revoked: ${snippet}`, 412);
  }
  throw new GarminPullError(`callbackURL failed (${response.status}): ${snippet}`, response.status);
}

/**
 * Resolve a ping row to the matching Activity Details payload.
 *
 * Tries the callbackURL first; on 410 (expired) or missing URL, falls back
 * to the explicit-window endpoint using uploadStartTimeInSeconds /
 * uploadEndTimeInSeconds from the ping payload. Filters the returned array
 * down to the single detail matching the ping's summaryId / activity_id.
 *
 * @param {object} ping       Row from `garmin_webhook_events`. Required:
 *                            activity_id, file_url (callbackURL), payload.
 * @param {string} accessToken
 * @returns {Promise<object|null>} Matched detail, or null if no match (the
 *   window contained other activities but not this one — e.g., Garmin
 *   delivered the ping before the activity was fully indexed). Null is
 *   recoverable; the caller should defer with backoff.
 * @throws {AuthError|ConsentRevokedError|BadRangeError|GarminPullError}
 *   Network / API errors bubble up so the caller can apply retry policy.
 */
export async function pullActivityDetail(ping, accessToken) {
  if (!ping || !ping.activity_id) {
    throw new Error('ping with activity_id required');
  }
  const targetId = String(ping.activity_id);

  let details = null;
  let callbackURLExpired = false;

  // Preferred: pre-authorized callbackURL.
  if (ping.file_url) {
    try {
      details = await fetchActivityDetailsByCallbackURL(ping.file_url, accessToken);
    } catch (err) {
      // 410 (gone) → fall through to window endpoint. Auth / consent / other
      // failures bubble.
      if (err instanceof GarminPullError && err.status === 410) {
        callbackURLExpired = true;
      } else {
        throw err;
      }
    }
  }

  // Fallback: explicit window endpoint, reconstructed from the ping payload.
  if (details == null) {
    const payload = ping.payload || {};
    const startSec = payload.uploadStartTimeInSeconds;
    const endSec = payload.uploadEndTimeInSeconds;
    if (typeof startSec !== 'number' || typeof endSec !== 'number') {
      // No usable fallback. Status reflects the cause:
      //   410 — callbackURL was tried and went 410, no window to fall back to.
      //   400 — never had a usable input in the first place (data error).
      throw new GarminPullError(
        callbackURLExpired
          ? 'callbackURL expired (410) and ping payload missing upload window'
          : 'ping has no callbackURL and no upload window',
        callbackURLExpired ? 410 : 400,
      );
    }
    details = await fetchActivityDetailsByUploadRange(accessToken, startSec, endSec);
  }

  return matchDetail(details, targetId);
}

/**
 * Find the detail in a §7.3 array that matches a target id. The id may
 * appear as the integer `activityId` (early Garmin payloads) or the string
 * `summaryId` with a `-detail` suffix (newer ones). Match against both.
 *
 * Exposed for test reuse and for `api/garmin2-pull.js` to index a window's
 * worth of details against multiple ping rows at once.
 */
export function matchDetail(details, targetId) {
  if (!Array.isArray(details) || details.length === 0) return null;
  const t = String(targetId);
  for (const d of details) {
    if (d.activityId != null && String(d.activityId) === t) return d;
    if (d.summaryId && String(d.summaryId).replace(/-detail$/, '') === t) return d;
  }
  return null;
}
