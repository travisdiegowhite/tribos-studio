/**
 * Slice a route line by distance along it — "show me miles 11–12" for the
 * comfort strip and heads-up cards. Canonical [lng, lat] in and out;
 * distances in meters (CLAUDE.md unit and coordinate conventions).
 */
import type { Coordinate } from '../types/geo';
import { haversineMeters } from './distanceUnits';

function lerp(a: Coordinate, b: Coordinate, t: number): Coordinate {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * The part of `coords` between `start_m` and `end_m` from the start,
 * interpolating the cut points. Returns [] for an empty or degenerate input,
 * and at least two points otherwise.
 */
export function sliceLineByDistance(
  coords: ReadonlyArray<Coordinate | readonly number[]>,
  start_m: number,
  end_m: number,
): Coordinate[] {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const lo_m = Math.max(0, Math.min(start_m, end_m));
  const hi_m = Math.max(start_m, end_m);
  const out: Coordinate[] = [];
  let at_m = 0;
  for (let i = 1; i < coords.length; i++) {
    const a: Coordinate = [coords[i - 1][0], coords[i - 1][1]];
    const b: Coordinate = [coords[i][0], coords[i][1]];
    const seg_m = haversineMeters(a[1], a[0], b[1], b[0]);
    const next_m = at_m + seg_m;
    if (next_m >= lo_m && at_m <= hi_m && seg_m > 0) {
      const tStart = Math.max(0, (lo_m - at_m) / seg_m);
      const tEnd = Math.min(1, (hi_m - at_m) / seg_m);
      if (out.length === 0) out.push(lerp(a, b, tStart));
      out.push(lerp(a, b, tEnd));
    }
    at_m = next_m;
    if (at_m > hi_m) break;
  }
  if (out.length === 1) out.push(out[0]);
  return out;
}
