/**
 * Ferry guard — ferries are forbidden in generated routes, 100%.
 *
 * Cyclists should never be routed onto a ferry. Soft costing avoidance
 * (Valhalla `use_ferry = 0`, BRouter ferry penalties) reduces but does not
 * eliminate ferries — both engines will still cross water by ferry when it's
 * the only way through. These pure detectors let the routing providers reject
 * any candidate that contains a ferry segment so the fallback chain advances
 * (and, if no land route exists, the build fails rather than silently handing
 * the rider a ferry crossing).
 *
 * Detection is per-provider because each engine exposes way metadata
 * differently:
 *   - Valhalla (Stadia): turn-by-turn maneuvers carry a `type`; 28 = ferry
 *     enter, 29 = ferry exit.
 *   - BRouter: the GeoJSON `properties.messages` table carries per-segment
 *     OSM `WayTags`; a ferry segment is tagged `route=ferry`.
 *   - Mapbox: no per-segment way tags are returned, so ferries are excluded at
 *     request time via `exclude=ferry` rather than detected post-hoc.
 */

/**
 * Valhalla maneuver `type` codes for ferry segments.
 * 28 = kFerryEnter, 29 = kFerryExit.
 */
export const VALHALLA_FERRY_MANEUVER_TYPES = new Set([28, 29]);

/**
 * Does a Valhalla `trip` object route over a ferry?
 *
 * @param {Object|null|undefined} trip - Valhalla trip (`data.trip`) with
 *   `legs[].maneuvers[]`. Requires the request to have been made with
 *   `directions_type: 'maneuvers'`.
 * @returns {boolean} true if any maneuver is a ferry enter/exit.
 */
export function valhallaTripUsesFerry(trip) {
  const legs = trip?.legs;
  if (!Array.isArray(legs)) return false;
  return legs.some((leg) =>
    Array.isArray(leg?.maneuvers) &&
    leg.maneuvers.some((m) => VALHALLA_FERRY_MANEUVER_TYPES.has(m?.type)),
  );
}

/**
 * Does a BRouter GeoJSON feature's `properties` route over a ferry?
 *
 * BRouter's `properties.messages` is a table: row 0 is the column header, rows
 * 1+ are per-segment data. The `WayTags` column holds a space-separated list
 * of OSM `key=value` tags (e.g. `highway=residential surface=asphalt`). A ferry
 * segment carries `route=ferry` (and some are also tagged `ferry=*`).
 *
 * Best-effort: if `messages` is absent (some BRouter responses omit it), this
 * returns false. BRouter's stock profiles already penalize ferries heavily, so
 * this is a backstop rather than the sole defense.
 *
 * @param {Object|null|undefined} properties - BRouter feature `properties`.
 * @returns {boolean} true if any segment is a ferry way.
 */
export function brouterUsesFerry(properties) {
  const messages = properties?.messages;
  if (!Array.isArray(messages) || messages.length < 2) return false;

  const header = messages[0];
  if (!Array.isArray(header)) return false;
  const wayTagsIdx = header.findIndex(
    (col) => typeof col === 'string' && col.toLowerCase() === 'waytags',
  );
  if (wayTagsIdx === -1) return false;

  return messages.slice(1).some((row) => {
    const tags = Array.isArray(row) ? row[wayTagsIdx] : null;
    return typeof tags === 'string' && wayTagsContainFerry(tags);
  });
}

/**
 * Is a single OSM `WayTags` string a ferry way?
 * Matches `route=ferry` or any `ferry=*` tag (e.g. `ferry=yes`, `ferry=primary`).
 *
 * @param {string} tags - space-separated `key=value` tags.
 * @returns {boolean}
 */
export function wayTagsContainFerry(tags) {
  return /(^|\s)route=ferry(\s|$)/.test(tags) || /(^|\s)ferry=/.test(tags);
}

/** Human-readable rejection reason, reused for errors + telemetry. */
export const FERRY_REJECTED_REASON = 'route_requires_ferry';
