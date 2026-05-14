/**
 * Scope helpers — apply a `{start_km, end_km}` window to a RouteSnapshot.
 *
 * Distances are computed from the canonical geometry array via the
 * haversine helper in `src/utils/distanceUnits.ts` (T1.1 canonical).
 * Waypoints are mapped to km offsets by snapping each waypoint to the
 * nearest geometry point.
 */

import type { Coordinate } from '../../../../types/geo';
import { haversineMeters, M_TO_KM } from '../../../../utils/distanceUnits';
import type { RouteSnapshot, RouteWaypoint, Scope } from '../../types';

/**
 * Cumulative km offset for each point in the route geometry.
 * Returns an array `[0, d_01, d_01+d_12, ...]` of length `geometry.length`.
 */
export function cumulativeKmAlongGeometry(geometry: readonly Coordinate[]): number[] {
  const out: number[] = new Array(geometry.length);
  if (geometry.length === 0) return out;
  out[0] = 0;
  let acc = 0;
  for (let i = 1; i < geometry.length; i++) {
    const [lng1, lat1] = geometry[i - 1];
    const [lng2, lat2] = geometry[i];
    acc += M_TO_KM(haversineMeters(lat1, lng1, lat2, lng2));
    out[i] = acc;
  }
  return out;
}

/**
 * Total route distance in km, computed from geometry.
 */
export function totalDistanceKm(route: RouteSnapshot): number {
  if (route.geometry.length < 2) {
    return route.stats?.distance_km ?? 0;
  }
  const cum = cumulativeKmAlongGeometry(route.geometry);
  return cum[cum.length - 1];
}

/**
 * Squared planar distance between two coordinates. Cheap and monotonic
 * for "nearest point" lookups over small windows where geographic
 * distortion doesn't flip the comparison.
 */
function planarDistSq(a: Coordinate, b: Coordinate): number {
  const dlng = a[0] - b[0];
  const dlat = a[1] - b[1];
  return dlng * dlng + dlat * dlat;
}

/**
 * For each waypoint, return its km offset from the start of the route by
 * snapping the waypoint coordinate to the nearest geometry point.
 *
 * Note: precision is bounded by geometry density. Good enough for
 * scope-window membership tests; insufficient for sub-segment surgery.
 */
export function waypointKmOffsets(route: RouteSnapshot): number[] {
  const { geometry, waypoints } = route;
  if (geometry.length === 0 || waypoints.length === 0) return [];
  const cum = cumulativeKmAlongGeometry(geometry);

  return waypoints.map((wp) => {
    let bestIdx = 0;
    let bestDistSq = planarDistSq(wp.coordinate, geometry[0]);
    for (let i = 1; i < geometry.length; i++) {
      const d = planarDistSq(wp.coordinate, geometry[i]);
      if (d < bestDistSq) {
        bestDistSq = d;
        bestIdx = i;
      }
    }
    return cum[bestIdx];
  });
}

/**
 * Return the waypoints whose km offset falls within [scope.start_km, scope.end_km].
 */
export function waypointsInScope(route: RouteSnapshot, scope: Scope): RouteWaypoint[] {
  const offsets = waypointKmOffsets(route);
  const out: RouteWaypoint[] = [];
  for (let i = 0; i < route.waypoints.length; i++) {
    const km = offsets[i];
    if (km >= scope.start_km && km <= scope.end_km) {
      out.push(route.waypoints[i]);
    }
  }
  return out;
}

/**
 * Split a route's geometry into three slices by km scope. Geometry
 * points are partitioned by their cumulative-km position relative to
 * the scope window.
 *
 * Boundary handling: a point exactly at `start_km` or `end_km` is
 * included in the `within` slice. The slices share no points (one
 * geometry point sits in exactly one slice), but consumers usually
 * want to glue the boundary point onto adjacent slices to maintain
 * geometric continuity — do that at the call site if you need it.
 */
export function splitByScope(
  route: RouteSnapshot,
  scope: Scope,
): { before: Coordinate[]; within: Coordinate[]; after: Coordinate[] } {
  const { geometry } = route;
  const cum = cumulativeKmAlongGeometry(geometry);
  const before: Coordinate[] = [];
  const within: Coordinate[] = [];
  const after: Coordinate[] = [];
  for (let i = 0; i < geometry.length; i++) {
    const km = cum[i];
    if (km < scope.start_km) before.push(geometry[i]);
    else if (km <= scope.end_km) within.push(geometry[i]);
    else after.push(geometry[i]);
  }
  return { before, within, after };
}

/**
 * Find the geometry index whose cumulative km position is closest to a
 * target. Returns -1 for an empty geometry array.
 */
export function geometryIndexAtKm(route: RouteSnapshot, targetKm: number): number {
  const { geometry } = route;
  if (geometry.length === 0) return -1;
  const cum = cumulativeKmAlongGeometry(geometry);
  let bestIdx = 0;
  let bestDiff = Math.abs(cum[0] - targetKm);
  for (let i = 1; i < cum.length; i++) {
    const d = Math.abs(cum[i] - targetKm);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
