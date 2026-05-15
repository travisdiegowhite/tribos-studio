/**
 * trim_route — confidence: reliable.
 *
 * Remove `amount_km` from the start or end of the route. Produces a
 * constraint whose waypoints are a subset of the original. T2.3 may
 * decide to skip the router for a pure geometric truncation.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { totalDistanceKm, waypointKmOffsets } from '../shared/scopeUtils';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForTrimRoute(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'trim_route' }>,
): RouteConstraint {
  const totalKm = totalDistanceKm(route);
  if (mutation.amount_km >= totalKm) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'trim_route',
      `Cannot trim ${mutation.amount_km}km from a ${totalKm.toFixed(2)}km route.`,
    );
  }

  const offsets = waypointKmOffsets(route);
  const wps = route.waypoints;
  let kept: Coordinate[];

  if (mutation.from === 'end') {
    const cutoff = totalKm - mutation.amount_km;
    kept = wps.filter((_, i) => offsets[i] <= cutoff).map((w) => w.coordinate);
    if (kept.length === 0 && wps.length > 0) kept = [wps[0].coordinate];
  } else {
    const cutoff = mutation.amount_km;
    kept = wps.filter((_, i) => offsets[i] >= cutoff).map((w) => w.coordinate);
    if (kept.length === 0 && wps.length > 0) kept = [wps[wps.length - 1].coordinate];
  }

  // Loop becomes point_to_point when trimmed from the start (start vertex changes).
  const previousShape = context.shape ?? 'point_to_point';
  const newShape =
    mutation.from === 'start' && previousShape === 'loop'
      ? 'point_to_point'
      : previousShape;

  return {
    waypoints: kept,
    profile: context.profile ?? 'road',
    shape: newShape,
    target_distance_km: totalKm - mutation.amount_km,
  };
}
