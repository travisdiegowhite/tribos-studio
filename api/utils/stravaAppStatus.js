// Detects Strava APP-LEVEL failures in API error responses.
//
// When Strava deactivates the API application itself, every athlete-data call
// returns 403 with body:
//   {"message":"Forbidden","errors":[{"resource":"Application","field":"Status","code":"Inactive"}]}
// while token refresh keeps succeeding — so every integration row looks
// healthy and the outage is invisible in the UI. This happened 2026-06-30 →
// 2026-08-11: zero Strava activities ingested fleet-wide for six weeks, with
// every webhook event marked processed under a generic "Failed to fetch
// activity from Strava". These helpers make that failure mode loud and
// distinguishable.
//
// Sentry alert rules should match tag `strava.app_inactive` (same pattern as
// the garmin.* tags emitted by api/garmin-health-monitor.js).

import { captureServerError } from './serverSentry.js';

// Exact process_error written to strava_webhook_events for app-inactive
// failures. api/strava-health-monitor.js matches on this string — keep in sync.
export const STRAVA_APP_INACTIVE_PROCESS_ERROR = 'Strava application inactive (403)';

// Prefix of the generic fetch-failure process_error (an HTTP status or error
// detail is appended). The health monitor matches on this prefix too.
export const STRAVA_FETCH_FAILED_PREFIX = 'Failed to fetch activity from Strava';

/**
 * Returns true when a Strava API error response indicates the application
 * itself has been deactivated by Strava (403 + Application/Status/Inactive).
 *
 * @param {number} status - HTTP status of the failed Strava API response.
 * @param {string} bodyText - Raw response body text.
 */
export function isStravaAppInactive(status, bodyText) {
  if (status !== 403 || !bodyText) return false;
  try {
    const body = JSON.parse(bodyText);
    return Array.isArray(body?.errors) &&
      body.errors.some((e) => e?.resource === 'Application' && e?.code === 'Inactive');
  } catch {
    return false; // non-JSON body — a plain 403 is not proof of app deactivation
  }
}

/**
 * Classify a failed Strava API response and, when it's an app-level
 * deactivation, emit a Sentry-tagged error so the outage pages immediately.
 *
 * @param {object} params
 * @param {number} params.status - HTTP status of the failed response.
 * @param {string} params.bodyText - Raw response body text.
 * @param {string} params.endpoint - Which Strava endpoint failed (for the alert).
 * @param {string} [params.userId] - Affected user, when known.
 * @returns {{ appInactive: boolean }}
 */
export function reportStravaApiFailure({ status, bodyText, endpoint, userId }) {
  const appInactive = isStravaAppInactive(status, bodyText);
  if (appInactive) {
    captureServerError(`Strava application inactive (403) on ${endpoint} — Strava has deactivated this API application; all athlete-data calls are failing`, {
      tag: 'strava.app_inactive',
      extra: { endpoint, user_id: userId || null, status },
    });
  }
  return { appInactive };
}
