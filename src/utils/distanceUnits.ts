/**
 * Distance unit contract — single source of truth.
 *
 * House rule (CLAUDE.md): all distance values in src/ are named with a
 * `_km` or `_m` (or `_meters`) suffix. Conversions happen at module
 * boundaries via the helpers in this file. Routing API responses are
 * meters; the converter is the seam.
 */

export const METERS_PER_KM = 1000;

export const M_TO_KM = (m: number): number => m / METERS_PER_KM;
export const KM_TO_M = (km: number): number => km * METERS_PER_KM;

const isDev = (): boolean => {
  try {
    // import.meta.env is populated by Vite. The typed shape varies between
    // configs — cast through `unknown` and read defensively.
    const meta = import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } };
    if (meta && meta.env) {
      if (meta.env.DEV !== undefined) return meta.env.DEV;
      if (meta.env.MODE !== undefined) return meta.env.MODE !== 'production';
    }
  } catch {
    // import.meta unavailable (e.g. Node/Jest); fall through
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
};

/**
 * Warn if `value` looks like meters but is labelled as km.
 *
 * Cycling routes top out around 1000 km; >10,000 in a km-named field
 * is almost certainly raw meters that escaped a boundary conversion.
 */
export function assertKm(value: number | null | undefined, fieldName: string): void {
  if (!isDev()) return;
  if (value === null || value === undefined || Number.isNaN(value)) return;
  if (value > 10_000) {
    console.warn(
      `[unit-contract] ${fieldName}=${value} looks like meters, expected km. ` +
      `Check for a missing M_TO_KM at the boundary.`
    );
  }
}

/**
 * Warn if `value` looks like km but is labelled as meters.
 *
 * Distances below 1 in a meters-named field are usually km that lost a
 * KM_TO_M conversion (a sub-1m segment is implausible in route context).
 */
export function assertMeters(value: number | null | undefined, fieldName: string): void {
  if (!isDev()) return;
  if (value === null || value === undefined || Number.isNaN(value)) return;
  if (value > 0 && value < 1) {
    console.warn(
      `[unit-contract] ${fieldName}=${value} looks like km, expected m. ` +
      `Check for a missing KM_TO_M at the boundary.`
    );
  }
}

const EARTH_RADIUS_M = 6_371_000;
const EARTH_RADIUS_KM = 6_371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

function haversineCore(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Great-circle distance between two lat/lng points in METERS.
 *
 * Canonical helper. Replaces the duplicate copies that previously lived
 * in gpxParser.js, routeOptimizer.js, and api/garmin-auth.js.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return EARTH_RADIUS_M * haversineCore(lat1, lng1, lat2, lng2);
}

/**
 * Great-circle distance between two lat/lng points in KILOMETERS.
 *
 * Canonical helper. Replaces the duplicate copies that previously lived
 * in directions.js, activityRouteAnalyzer.ts, and elevation.js's
 * calculateCumulativeDistances.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return EARTH_RADIUS_KM * haversineCore(lat1, lng1, lat2, lng2);
}
