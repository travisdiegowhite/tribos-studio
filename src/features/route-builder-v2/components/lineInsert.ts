/**
 * lineInsert — geometry helper for "drag the route line to reshape".
 *
 * When the user grabs the drawn route line between two control points and
 * drops a new one, we need the waypoint-list index to splice the new point
 * into. The route's dense (snapped) geometry doesn't carry a mapping back to
 * the sparse waypoint list, so we reconstruct it: find where along the dense
 * line the grab happened, find where each waypoint projects onto the dense
 * line, and insert after every waypoint that comes before the grab.
 *
 * Pure + dependency-free so it's unit-testable without a live map.
 */
import type { Coordinate } from '../../../types/geo';

/**
 * Squared planar distance from point P to segment AB. Longitude is scaled by
 * cos(lat) so a degree of lng ≈ a degree of lat near the working latitude —
 * good enough to pick the nearest segment at city/route scale.
 */
function distToSegmentSq(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate,
  cosLat: number,
): number {
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const px = p[0] * cosLat;
  const py = p[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/** Index of the dense vertex nearest to `point`. */
function nearestVertexIndex(dense: Coordinate[], point: Coordinate, cosLat: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < dense.length; i++) {
    const dx = (dense[i][0] - point[0]) * cosLat;
    const dy = dense[i][1] - point[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Waypoint-list index at which to insert a new control point for a grab at
 * `point` on the route line. Always returns a value in `[1, waypoints.length-1]`
 * — a line grab is, by definition, between two existing control points.
 */
export function nearestInsertIndex(
  denseCoords: Coordinate[],
  waypoints: Coordinate[],
  point: Coordinate,
): number {
  if (waypoints.length < 2 || denseCoords.length < 2) return waypoints.length;
  const cosLat = Math.cos((point[1] * Math.PI) / 180) || 1;

  // 1. Nearest dense segment to the grab — its start vertex index is the grab's
  //    position along the line.
  let grabIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < denseCoords.length - 1; i++) {
    const d = distToSegmentSq(point, denseCoords[i], denseCoords[i + 1], cosLat);
    if (d < bestD) {
      bestD = d;
      grabIdx = i;
    }
  }

  // 2. Count waypoints whose projection onto the line comes at or before the grab.
  let count = 0;
  for (const wp of waypoints) {
    if (nearestVertexIndex(denseCoords, wp, cosLat) <= grabIdx) count++;
  }

  // 3. Clamp so we always insert strictly between two existing waypoints.
  return Math.max(1, Math.min(waypoints.length - 1, count));
}

export default nearestInsertIndex;
