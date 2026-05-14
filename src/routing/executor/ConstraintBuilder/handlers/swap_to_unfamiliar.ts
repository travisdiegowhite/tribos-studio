/**
 * swap_to_unfamiliar — confidence: reliable.
 *
 * Adds the user's familiar segments to `exclude_segments` so the router
 * picks unexplored roads. If the entire region is familiar, RouterClient
 * may produce a normal route or fail; ConstraintBuilder doesn't predict
 * that.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';

export function buildConstraintForSwapToUnfamiliar(
  route: RouteSnapshot,
  context: RouteContext,
  _mutation: Extract<Mutation, { type: 'swap_to_unfamiliar' }>,
): RouteConstraint {
  const familiar = context.familiar_segments ?? [];
  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    exclude_segments: [...familiar],
  };
}
