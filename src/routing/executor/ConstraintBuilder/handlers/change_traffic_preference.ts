/**
 * change_traffic_preference — confidence: reliable.
 *
 * Pass-through of the target traffic preference. RouterClient/providers
 * translate to provider-specific costing.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';

export function buildConstraintForChangeTrafficPreference(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'change_traffic_preference' }>,
): RouteConstraint {
  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    traffic_preference: mutation.target,
  };
}
