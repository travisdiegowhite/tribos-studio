/**
 * Pure geometry helpers for the activity share card.
 *
 * All coordinates are canonical `[lng, lat]` pairs (GeoJSON convention,
 * see src/types/geo.ts). All distances are suffixed `_m` (meters).
 */
import { haversineMeters } from '../distanceUnits';

export { decodePolyline } from '../../views/today/shared/decodePolyline';

export type LngLat = [number, number];

/**
 * Privacy trim never reduces a route below this many meters — a card with a
 * misleading 2-point stub is worse than a slightly longer visible route.
 */
export const MIN_REMAINING_ROUTE_M = 500;

/**
 * Remove roughly `trim_m` meters from BOTH ends of a route (privacy trim for
 * shared images, so the card doesn't reveal exact start/end locations).
 *
 * The trim is clamped so at least MIN_REMAINING_ROUTE_M meters (and 2 points)
 * survive; routes shorter than that are returned unchanged.
 */
export function trimPolylineEnds(coords: LngLat[], trim_m: number): LngLat[] {
  if (!Array.isArray(coords) || coords.length < 2 || !(trim_m > 0)) {
    return coords;
  }

  // Cumulative distance from the start to each point, in meters.
  const cumulative_m: number[] = new Array(coords.length);
  cumulative_m[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    cumulative_m[i] = cumulative_m[i - 1] + haversineMeters(lat1, lng1, lat2, lng2);
  }
  const total_m = cumulative_m[coords.length - 1];

  const maxTotalTrim_m = Math.max(0, total_m - MIN_REMAINING_ROUTE_M);
  const effectiveTrim_m = Math.min(trim_m, maxTotalTrim_m / 2);
  if (effectiveTrim_m <= 0) return coords;

  let startIdx = 0;
  while (startIdx < coords.length && cumulative_m[startIdx] < effectiveTrim_m) {
    startIdx++;
  }
  let endIdx = coords.length - 1;
  while (endIdx >= 0 && total_m - cumulative_m[endIdx] < effectiveTrim_m) {
    endIdx--;
  }

  if (endIdx - startIdx < 1) return coords;
  return coords.slice(startIdx, endIdx + 1);
}

/**
 * Evenly sample coordinates down to a point budget, always preserving the
 * first and last points. Same algorithm as the server-side sampler in
 * api/utils/polylineEncode.js (encodeThumbPolyline).
 */
export function downsampleCoords(coords: LngLat[], maxPoints: number): LngLat[] {
  if (!Array.isArray(coords) || coords.length <= maxPoints || maxPoints < 2) {
    return coords;
  }
  const n = coords.length;
  const sampled: LngLat[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (n - 1)) / (maxPoints - 1));
    sampled.push(coords[idx]);
  }
  return sampled;
}

/**
 * Encode `[lng, lat]` coordinates as a Google/Mapbox polyline (precision 5).
 *
 * Client-side port of the encoder in api/utils/polylineEncode.js — api/ code
 * isn't importable from the Vite bundle, so keep the two in sync if the
 * algorithm ever changes. Round-trips with decodePolyline within 1e-5.
 */
export function encodePolyline(coords: LngLat[]): string | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const [lng, lat] of coords) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    output += encodeSigned(latE5 - prevLat) + encodeSigned(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }
  return output;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}
