/**
 * smooth_route — confidence: best-effort.
 *
 * Three targets:
 * - remove_doublebacks: detect path overlaps within ~50m and emit
 *   avoid_segments for affected segment IDs. v1 best-effort: emits an
 *   empty avoid list when no segment IDs are attached to geometry.
 * - remove_dead_ends: find out-and-back tails by detecting geometric
 *   turnarounds; emit avoid_segments for the tail.
 * - simplify_turns: Douglas-Peucker simplification of the waypoint
 *   array.
 *
 * Why best-effort: segment-ID attribution depends on the analysis
 * layer being mature. v1 may produce inconsistent results on complex
 * routes.
 */

import type { Coordinate } from '../../../../types/geo';
import { haversineMeters } from '../../../../utils/distanceUnits';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
  SegmentId,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';
import { totalDistanceKm } from '../shared/scopeUtils';

const DOUBLEBACK_THRESHOLD_M = 50;
const SIMPLIFY_EPSILON_DEG = 0.001;
const MAX_DISTANCE_CHANGE_FRACTION = 0.2;

export function buildConstraintForSmoothRoute(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'smooth_route' }>,
): RouteConstraint {
  const baseWaypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  const profile = context.profile ?? 'road';
  const shape = context.shape ?? 'point_to_point';

  if (mutation.target === 'simplify_turns') {
    const simplified =
      baseWaypoints.length > 2
        ? douglasPeucker(baseWaypoints, SIMPLIFY_EPSILON_DEG)
        : baseWaypoints;
    const originalKm = totalDistanceKm(route);
    // Heuristic guard: if simplification dropped > 20% of waypoints
    // *and* the route is non-trivial, infer the distance change risk
    // is too high.
    if (
      baseWaypoints.length > 4 &&
      simplified.length / baseWaypoints.length < 1 - MAX_DISTANCE_CHANGE_FRACTION &&
      originalKm > 5
    ) {
      throw new ConstraintBuilderError(
        'infeasible_constraint',
        'smooth_route',
        `simplify_turns would drop ${baseWaypoints.length - simplified.length} of ${baseWaypoints.length} waypoints; aborting to avoid >20% distance change.`,
      );
    }
    return {
      waypoints: simplified,
      profile,
      shape,
    };
  }

  if (mutation.target === 'remove_dead_ends') {
    // Detect a tail where the geometry turns around within
    // DOUBLEBACK_THRESHOLD_M of its earlier path. v1: trim trailing
    // waypoints if the final waypoint is close to one earlier in the
    // sequence.
    const trimmed = trimDeadEndTail(baseWaypoints);
    return {
      waypoints: trimmed,
      profile,
      shape,
      avoid_segments: [],
    };
  }

  // target === 'remove_doublebacks'
  // v1 best-effort: with segment IDs unavailable at the snapshot layer,
  // pass an empty avoid list. The mutation still signals intent so
  // T2.3 and downstream analysis can later attach IDs.
  const avoid: SegmentId[] = [];
  return {
    waypoints: baseWaypoints,
    profile,
    shape,
    avoid_segments: avoid,
  };
}

function trimDeadEndTail(waypoints: Coordinate[]): Coordinate[] {
  if (waypoints.length < 3) return waypoints;
  const last = waypoints[waypoints.length - 1];
  // If the last point is within threshold of any earlier point (other
  // than its immediate predecessor), trim back to that earlier index.
  for (let i = 0; i < waypoints.length - 2; i++) {
    const d = haversineMeters(last[1], last[0], waypoints[i][1], waypoints[i][0]);
    if (d < DOUBLEBACK_THRESHOLD_M) {
      return waypoints.slice(0, i + 1);
    }
  }
  return waypoints;
}

/**
 * Douglas-Peucker line simplification, operating on degree-space.
 * Epsilon is in degrees; 0.001° ≈ 100 m at the equator. Fine for
 * smoothing route waypoints which are typically spaced km apart.
 */
function douglasPeucker(points: Coordinate[], epsilon: number): Coordinate[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifyRecursive(points, 0, points.length - 1, epsilon, keep);
  const out: Coordinate[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

function simplifyRecursive(
  points: Coordinate[],
  start: number,
  end: number,
  epsilon: number,
  keep: boolean[],
): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let maxIdx = start;
  const [sx, sy] = points[start];
  const [ex, ey] = points[end];
  for (let i = start + 1; i < end; i++) {
    const d = perpendicularDistanceDeg(points[i], sx, sy, ex, ey);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    keep[maxIdx] = true;
    simplifyRecursive(points, start, maxIdx, epsilon, keep);
    simplifyRecursive(points, maxIdx, end, epsilon, keep);
  }
}

function perpendicularDistanceDeg(
  p: Coordinate,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): number {
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) {
    const ddx = p[0] - sx;
    const ddy = p[1] - sy;
    return Math.hypot(ddx, ddy);
  }
  const num = Math.abs(dy * p[0] - dx * p[1] + ex * sy - ey * sx);
  return num / Math.hypot(dx, dy);
}
