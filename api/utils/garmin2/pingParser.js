/**
 * pingParser — pure functions that detect and shape Garmin Ping payloads.
 *
 * Phase 2 of the Garmin ping/pull rebuild. Garmin Activity API §4 Ping
 * Service delivers a notification of new data; the body shape per spec is:
 *
 *   { "activityDetails": [
 *       { userId, summaryId, uploadStartTimeInSeconds,
 *         uploadEndTimeInSeconds, callbackURL }
 *     ] }
 *
 * Health pings follow the same shape under their type-named key (e.g.
 * `dailies`, `sleeps`, `bodyComps`, `stressDetails`, `hrv`).
 *
 * This module is pure (no I/O, no Supabase). The Vercel fallback receiver
 * (`api/garmin2-ping.js`) and the Cloudflare worker (which inlines the
 * same logic verbatim — see DUPLICATION NOTE in
 * `cloudflare-workers/garmin-webhook/src/index.js`) both use the same
 * decisions so the row shape that lands in `garmin_webhook_events` is
 * identical regardless of which receiver handled the ping.
 */

import { ACTIVITY_PING, HEALTH_PING_PREFIX, HEALTH_PING_SUFFIX } from './pingQueue.js';

/**
 * Health summary types the puller (and `processHealthPushData`) knows how to
 * handle. Other health types Garmin may send (epochs, allDayRespiration,
 * userMetrics, etc.) are intentionally dropped at the door — storing them
 * floods the queue with rows the downstream processor would no-op on.
 *
 * Mirrors the `HANDLED_HEALTH_TYPES` set in the Cloudflare worker and the
 * legacy `api/garmin-webhook.js`.
 */
export const HANDLED_HEALTH_TYPES = Object.freeze(
  new Set(['dailies', 'sleeps', 'bodyComps', 'stressDetails', 'hrv'])
);

/**
 * Identify the kind of webhook this body is, and return the item array.
 *
 * Spec-defined keys (in priority order):
 *   - activityDetails[]   → §4 ping for activity detail
 *   - activityFiles[]     → §7.4 FIT file pings (legacy push path)
 *   - activities[]        → §5 push: CONNECT_ACTIVITY summary
 *   - dailies / sleeps / bodyComps / stressDetails / hrv → health
 *
 * @param {object} body  Parsed webhook JSON envelope.
 * @returns {{
 *   kind: 'PING_ACTIVITY_DETAIL'
 *       | 'PING_HEALTH'
 *       | 'PUSH_ACTIVITY_FILE'
 *       | 'PUSH_CONNECT_ACTIVITY'
 *       | 'PUSH_HEALTH'
 *       | 'UNKNOWN',
 *   healthType: string|null,
 *   items: Array,
 * }}
 */
export function classifyPayload(body) {
  if (!body || typeof body !== 'object') return { kind: 'UNKNOWN', healthType: null, items: [] };

  // Activity detail PING (the rebuild's primary input).
  if (Array.isArray(body.activityDetails) && body.activityDetails.length > 0) {
    // Detail items that carry a `callbackURL` are the ping shape. Items
    // without callbackURL are the legacy PUSH ACTIVITY_DETAIL payload (where
    // Garmin inlined the full data). Distinguish so each path uses the right
    // row shape and event_type.
    const sample = body.activityDetails[0];
    const isPing = sample && typeof sample === 'object' && typeof sample.callbackURL === 'string';
    return {
      kind: isPing ? 'PING_ACTIVITY_DETAIL' : 'PUSH_CONNECT_ACTIVITY',
      healthType: null,
      items: body.activityDetails,
    };
  }

  // Legacy push: FIT file pings (these are also "pings" in Garmin's spec but
  // carry FIT file URLs; the rebuild does NOT use this path for new data,
  // only honors it during cutover for accounts still configured PUSH).
  if (Array.isArray(body.activityFiles) && body.activityFiles.length > 0) {
    return { kind: 'PUSH_ACTIVITY_FILE', healthType: null, items: body.activityFiles };
  }

  // Legacy push: CONNECT_ACTIVITY summary.
  if (Array.isArray(body.activities) && body.activities.length > 0) {
    return { kind: 'PUSH_CONNECT_ACTIVITY', healthType: null, items: body.activities };
  }

  // Health payloads — ping if the items carry callbackURL, push otherwise.
  for (const ht of HANDLED_HEALTH_TYPES) {
    if (Array.isArray(body[ht]) && body[ht].length > 0) {
      const sample = body[ht][0];
      const isPing = sample && typeof sample === 'object' && typeof sample.callbackURL === 'string';
      return {
        kind: isPing ? 'PING_HEALTH' : 'PUSH_HEALTH',
        healthType: ht,
        items: body[ht],
      };
    }
  }

  // Unhandled health types or unrecognized envelopes.
  return { kind: 'UNKNOWN', healthType: null, items: [] };
}

/**
 * Validate that a single ping item has the fields the puller will require.
 *
 * @param {object} item  One element of an `activityDetails[]` or health
 *                       ping array.
 * @returns {string[]}   Empty array if valid; otherwise list of missing
 *                       field names. Receivers should drop invalid items
 *                       at the door — storing them would only fail the
 *                       puller later.
 */
export function validatePingItem(item) {
  const missing = [];
  if (!item || typeof item !== 'object') return ['<not-an-object>'];
  if (!item.userId) missing.push('userId');
  if (!item.summaryId) missing.push('summaryId');
  if (!item.callbackURL) missing.push('callbackURL');
  if (typeof item.uploadStartTimeInSeconds !== 'number') missing.push('uploadStartTimeInSeconds');
  if (typeof item.uploadEndTimeInSeconds !== 'number') missing.push('uploadEndTimeInSeconds');
  return missing;
}

/**
 * Compose the event_type column value for a classification result.
 *
 *   PING_ACTIVITY_DETAIL → 'ACTIVITY_DETAIL_PING'        (matches pingQueue's claimer)
 *   PING_HEALTH          → 'HEALTH_<type>_PING'          (e.g. 'HEALTH_DAILIES_PING')
 *
 * Legacy PUSH classifications fall back to the names the old processor
 * understands ('CONNECT_ACTIVITY', 'ACTIVITY_FILE_DATA', 'HEALTH_<type>')
 * — they're not the rebuild's primary path but the receivers still tag
 * them correctly during cutover.
 */
export function eventTypeFor({ kind, healthType }) {
  switch (kind) {
    case 'PING_ACTIVITY_DETAIL': return ACTIVITY_PING;
    case 'PING_HEALTH':           return `${HEALTH_PING_PREFIX}${(healthType || '').toUpperCase()}${HEALTH_PING_SUFFIX}`;
    case 'PUSH_ACTIVITY_FILE':    return 'ACTIVITY_FILE_DATA';
    case 'PUSH_CONNECT_ACTIVITY': return 'CONNECT_ACTIVITY';
    case 'PUSH_HEALTH':           return `${HEALTH_PING_PREFIX}${healthType || ''}`;
    default:                      return 'UNKNOWN';
  }
}
