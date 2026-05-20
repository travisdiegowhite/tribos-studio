/**
 * Canonical coordinate format for tribos.studio.
 *
 * After T1.2, all internal code uses `Coordinate` = `[longitude, latitude]`
 * tuples (GeoJSON convention, same as Mapbox GL). Conversion to/from
 * other shapes happens at named module boundaries — see
 * `src/utils/coordConverters.ts`.
 *
 * Out of scope: react-map-gl viewport state (which uses
 * `{latitude, longitude, zoom}` natively and stays unchanged), BBox
 * objects, and activity-import per-point shapes (`{latitude, longitude}`
 * in fitParser/gpxParser/Strava streams) — those are preserved at the
 * import seam and converted to `Coordinate` at consumer boundaries.
 */

/**
 * Canonical coordinate: `[longitude, latitude]`.
 *
 * - longitude: −180..180 (negative = western hemisphere)
 * - latitude:  −90..90  (negative = southern hemisphere)
 *
 * Marked `readonly` so the compiler flags accidental in-place axis swaps
 * via index assignment.
 */
export type Coordinate = readonly [longitude: number, latitude: number];

/**
 * Builder for an explicit-ordered `Coordinate`. Use at sites where you
 * have `lng` and `lat` as separate scalars and want to remove all doubt.
 */
export const coord = (lng: number, lat: number): Coordinate => [lng, lat];

/**
 * Structural validation of a Coordinate. Checks shape (length-2 tuple of
 * finite numbers) and range. Use at trust boundaries — not in hot loops.
 */
export function isValidCoordinate(value: unknown): value is Coordinate {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [lng, lat] = value;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -90 || lat > 90) return false;
  return true;
}

/**
 * Dev-only assertion that warns when a value isn't a plausible Coordinate
 * or looks reversed for tribos's primary region (US, lng negative + lat
 * positive). No-op in production.
 *
 * Call at any boundary where a coordinate enters internal code or before
 * it gets persisted/rendered. Heuristic detection — not a guarantee.
 */
export function assertCoordinate(value: unknown, fieldName: string): void {
  // `import.meta.env.PROD` is replaced at build time by Vite; in test
  // (vitest) and dev it's falsy. Use a defensive check in case this file
  // is loaded outside Vite (e.g. a future node script).
  const inProd =
    typeof import.meta !== 'undefined' &&
    import.meta?.env?.PROD === true;
  if (inProd) return;

  if (!isValidCoordinate(value)) {
    console.warn(
      `[coord-contract] ${fieldName} is not a valid [lng, lat]:`,
      value,
    );
    return;
  }

  const [lng, lat] = value;
  // Suspicious: positive lng + negative lat in mid-range. In the US,
  // lng is negative; a `[lat, lng]` swap would look like
  // `[40, -105]` instead of `[-105, 40]`. The heuristic catches the
  // Colorado/most-of-US case; it can't catch swaps in Asia/Australia.
  if (lng > 0 && lat < 0 && Math.abs(lng) < 90 && Math.abs(lat) < 90) {
    console.warn(
      `[coord-contract] ${fieldName}=${JSON.stringify(value)} looks reversed (got [lat, lng] instead of [lng, lat]?)`,
    );
  }
}

/** Convenience predicate: array of Coordinates. */
export function isCoordinateArray(value: unknown): value is Coordinate[] {
  return Array.isArray(value) && value.every(isValidCoordinate);
}
