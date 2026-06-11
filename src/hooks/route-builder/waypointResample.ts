/**
 * waypointResample — helpers for reconstructing routable control points.
 *
 * When a route's stored waypoints collapse to a single point — a generated
 * loop keeps only its two coincident endpoints — a profile/snap re-route has
 * no corridor to follow and every engine returns a zero-length route. These
 * pure helpers detect that case and resample the dense geometry into a handful
 * of distinct control points (closing the loop), stripping any elevation 3rd
 * element so the result honours the [lng, lat] coordinate contract.
 */
import type { Coordinate } from '../../types/geo';

const COORD_EPSILON = 1e-5;

export function approxEqual(a: Coordinate, b: Coordinate, eps = COORD_EPSILON): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

/** Count geographically-distinct positions. */
export function distinctPositionCount(positions: ReadonlyArray<Coordinate>): number {
  const seen: Coordinate[] = [];
  for (const p of positions) {
    const q: Coordinate = [p[0], p[1]];
    if (!seen.some((s) => approxEqual(s, q))) seen.push(q);
  }
  return seen.length;
}

/**
 * Sample up to `count` evenly-spaced, distinct `[lng, lat]` positions along a
 * (possibly 3-element) geometry. If the geometry is a loop (first ≈ last) the
 * returned list is closed so a re-route reproduces the loop. Returns `[]` when
 * fewer than two distinct points can be produced.
 */
export function resamplePositionsFromGeometry(
  coords: ReadonlyArray<ReadonlyArray<number>>,
  count = 8,
): Coordinate[] {
  const n = coords.length;
  if (n < 2) return [];
  const first: Coordinate = [coords[0][0], coords[0][1]];
  const last: Coordinate = [coords[n - 1][0], coords[n - 1][1]];
  const isLoop = approxEqual(first, last);
  const k = Math.min(Math.max(count, 2), n);

  const deduped: Coordinate[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (n - 1)) / (k - 1));
    const p: Coordinate = [coords[idx][0], coords[idx][1]];
    if (deduped.length === 0 || !approxEqual(p, deduped[deduped.length - 1])) {
      deduped.push(p);
    }
  }
  if (isLoop && deduped.length >= 2 && !approxEqual(deduped[0], deduped[deduped.length - 1])) {
    deduped.push([deduped[0][0], deduped[0][1]]);
  }
  return deduped.length >= 2 ? deduped : [];
}
