/**
 * extend_distance — confidence: reliable.
 *
 * Lengthens the route by `delta_km`. The constraint primarily expresses
 * the target distance; the router decides how to actually add length.
 *
 * For scoped extensions, we insert a small detour-anchor waypoint
 * roughly perpendicular to the route midpoint within the scope. The
 * router uses it as a hint; the actual detour shape is its problem.
 */

import { isValidCoordinate } from '../../../../types/geo';
import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';
import { geometryIndexAtKm, totalDistanceKm } from '../shared/scopeUtils';

const MAX_SERVICEABLE_EXTENSION_KM = 50;

export function buildConstraintForExtendDistance(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'extend_distance' }>,
): RouteConstraint {
  if (mutation.delta_km > MAX_SERVICEABLE_EXTENSION_KM) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'extend_distance',
      `Extension of ${mutation.delta_km}km exceeds serviceable region (${MAX_SERVICEABLE_EXTENSION_KM}km).`,
    );
  }
  if (mutation.delta_km <= 0) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'extend_distance',
      `delta_km must be positive (got ${mutation.delta_km}).`,
    );
  }

  const currentKm = totalDistanceKm(route);
  const target_distance_km = currentKm + mutation.delta_km;

  const baseWaypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  let waypoints: Coordinate[] = baseWaypoints;

  if (mutation.scope) {
    const midKm = (mutation.scope.start_km + mutation.scope.end_km) / 2;
    const detour = detourCoordinate(route, midKm, mutation.delta_km);
    if (detour) {
      const idx = nearestWaypointIndex(baseWaypoints, midKm, route);
      waypoints = [
        ...baseWaypoints.slice(0, idx + 1),
        detour,
        ...baseWaypoints.slice(idx + 1),
      ];
    }
  }

  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    target_distance_km,
  };
}

/**
 * Pick a coordinate perpendicular-ish to the route at the given km
 * offset, displaced by ~half the desired delta. Returns null if route
 * is too short for the math to make sense.
 */
function detourCoordinate(
  route: RouteSnapshot,
  atKm: number,
  deltaKm: number,
): Coordinate | null {
  const geom = route.geometry;
  if (geom.length < 2) return null;
  const idx = geometryIndexAtKm(route, atKm);
  if (idx <= 0 || idx >= geom.length) return null;

  const prev = geom[idx - 1];
  const next = geom[Math.min(idx + 1, geom.length - 1)];
  // Tangent along route at idx (in degree-space; good enough as a hint).
  const dLng = next[0] - prev[0];
  const dLat = next[1] - prev[1];
  // Perpendicular vector (rotate 90°): (-dLat, dLng) in (lng, lat) frame.
  const perpLng = -dLat;
  const perpLat = dLng;
  const norm = Math.hypot(perpLng, perpLat);
  if (norm === 0) return null;

  // Approximate degrees per km: 1° lat ≈ 111 km.
  const offsetDeg = Math.min(deltaKm / 2, 10) / 111;
  const base = geom[idx];
  const detour: Coordinate = [
    base[0] + (perpLng / norm) * offsetDeg,
    base[1] + (perpLat / norm) * offsetDeg,
  ];
  return isValidCoordinate(detour) ? detour : null;
}

function nearestWaypointIndex(
  waypoints: Coordinate[],
  atKm: number,
  route: RouteSnapshot,
): number {
  // Pick the waypoint whose km offset is just below atKm.
  // Approximation: distribute waypoints evenly across totalKm.
  const totalKm = totalDistanceKm(route);
  if (totalKm <= 0 || waypoints.length === 0) return 0;
  const fraction = Math.max(0, Math.min(1, atKm / totalKm));
  return Math.floor(fraction * Math.max(0, waypoints.length - 1));
}
