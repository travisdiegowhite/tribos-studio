/**
 * avoid_segment — confidence: reliable.
 *
 * Adds an opaque segment_id to the constraint's avoid_segments list.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';

export function buildConstraintForAvoidSegment(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'avoid_segment' }>,
): RouteConstraint {
  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    avoid_segments: [mutation.segment_id],
  };
}
