/**
 * reverse_route — confidence: reliable.
 *
 * Reverses the waypoint ordering. The router may produce different
 * geometry than reversing the geometry directly (one-way streets, etc.);
 * that's handled downstream.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';

export function buildConstraintForReverseRoute(
  route: RouteSnapshot,
  context: RouteContext,
  _mutation: Extract<Mutation, { type: 'reverse_route' }>,
): RouteConstraint {
  const waypoints: Coordinate[] = route.waypoints
    .map((wp) => wp.coordinate)
    .reverse();
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
  };
}
