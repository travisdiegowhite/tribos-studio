/**
 * shorten_distance — confidence: reliable.
 *
 * Reduces the route to `current - delta_km`. Scoped variant strips
 * waypoints from within the scope; unscoped trims from the end (the
 * implicit "shorter route" behavior — explicit trims use trim_route).
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';
import { totalDistanceKm, waypointKmOffsets } from '../shared/scopeUtils';

const MIN_USEFUL_KM = 2.0;

export function buildConstraintForShortenDistance(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'shorten_distance' }>,
): RouteConstraint {
  if (mutation.delta_km <= 0) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'shorten_distance',
      `delta_km must be positive (got ${mutation.delta_km}).`,
    );
  }
  const currentKm = totalDistanceKm(route);
  const target_distance_km = currentKm - mutation.delta_km;
  if (target_distance_km < MIN_USEFUL_KM) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'shorten_distance',
      `Target distance ${target_distance_km.toFixed(2)}km is below minimum (${MIN_USEFUL_KM}km).`,
    );
  }

  const baseWaypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  let waypoints: Coordinate[] = baseWaypoints;

  if (mutation.scope) {
    const offsets = waypointKmOffsets(route);
    waypoints = baseWaypoints.filter((_, i) => {
      const km = offsets[i];
      return km < mutation.scope!.start_km || km > mutation.scope!.end_km;
    });
    if (waypoints.length < 2 && baseWaypoints.length >= 2) {
      // Don't strip everything; preserve endpoints if the scope swallowed them.
      waypoints = [baseWaypoints[0], baseWaypoints[baseWaypoints.length - 1]];
    }
  }
  // Unscoped: leave waypoints as-is; target_distance_km signals the router to shorten.

  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    target_distance_km,
  };
}
