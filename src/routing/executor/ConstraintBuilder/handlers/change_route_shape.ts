/**
 * change_route_shape — confidence: best-effort.
 *
 * loop: append start_coord (or first waypoint) as the final waypoint.
 * out_and_back: keep start → midpoint; router handles the mirror.
 * point_to_point: drop the closing waypoint if the route is a loop.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';
import { geometryIndexAtKm, totalDistanceKm } from '../shared/scopeUtils';

const MIN_LEG_KM = 2;

export function buildConstraintForChangeRouteShape(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'change_route_shape' }>,
): RouteConstraint {
  const wps: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);

  if (mutation.target === 'loop') {
    const start = context.start_coord ?? wps[0];
    if (!start) {
      throw new ConstraintBuilderError(
        'context_missing',
        'change_route_shape',
        'change_route_shape(loop) requires start_coord or at least one waypoint.',
        { required_field: 'start_coord' },
      );
    }
    const last = wps[wps.length - 1];
    const alreadyClosed =
      last && last[0] === start[0] && last[1] === start[1];
    const newWaypoints: Coordinate[] = alreadyClosed ? wps : [...wps, start];
    return {
      waypoints: newWaypoints,
      profile: context.profile ?? 'road',
      shape: 'loop',
    };
  }

  if (mutation.target === 'out_and_back') {
    const totalKm = totalDistanceKm(route);
    if (totalKm < MIN_LEG_KM * 2) {
      throw new ConstraintBuilderError(
        'infeasible_constraint',
        'change_route_shape',
        `Cannot make out_and_back from a ${totalKm.toFixed(2)}km route (need >= ${MIN_LEG_KM * 2}km).`,
      );
    }
    const midIdx = geometryIndexAtKm(route, totalKm / 2);
    const midpoint = route.geometry[midIdx];
    if (!midpoint) {
      throw new ConstraintBuilderError(
        'infeasible_constraint',
        'change_route_shape',
        'Route geometry is empty; cannot compute midpoint.',
      );
    }
    const start = context.start_coord ?? wps[0] ?? midpoint;
    return {
      waypoints: [start, midpoint],
      profile: context.profile ?? 'road',
      shape: 'out_and_back',
    };
  }

  // target === 'point_to_point'
  let newWaypoints: Coordinate[] = wps;
  if (wps.length >= 2) {
    const first = wps[0];
    const last = wps[wps.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      newWaypoints = wps.slice(0, -1);
    }
  }
  return {
    waypoints: newWaypoints,
    profile: context.profile ?? 'road',
    shape: 'point_to_point',
  };
}
