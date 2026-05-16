/**
 * swap_to_familiar — confidence: reliable.
 *
 * Promotes user-familiar segments to `prefer_segments`. Throws
 * infeasible_constraint when the user has no familiar segments at all
 * — the request "give me familiar roads" cannot be satisfied if the
 * user has never logged a ride.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForSwapToFamiliar(
  route: RouteSnapshot,
  context: RouteContext,
  _mutation: Extract<Mutation, { type: 'swap_to_familiar' }>,
): RouteConstraint {
  const familiar = context.familiar_segments ?? [];
  if (familiar.length === 0) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'swap_to_familiar',
      'No familiar segments available — user has no logged rides in this area.',
    );
  }
  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    prefer_segments: [...familiar],
  };
}
