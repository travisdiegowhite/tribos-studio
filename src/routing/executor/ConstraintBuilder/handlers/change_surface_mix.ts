/**
 * change_surface_mix — confidence: reliable.
 *
 * Passes the surface mix through as `surface_preference`. Validates the
 * mix sums to ~1.0 (tolerance ±0.05 to allow for floating-point and
 * user rounding).
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
  SurfaceMix,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

const MIX_SUM_TOLERANCE = 0.05;

export function buildConstraintForChangeSurfaceMix(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'change_surface_mix' }>,
): RouteConstraint {
  const target = mutation.target;
  if (!isValidMix(target)) {
    throw new ConstraintBuilderError(
      'infeasible_constraint',
      'change_surface_mix',
      `surface mix must sum to ~1.0 (got ${sumMix(target).toFixed(3)}): ${JSON.stringify(target)}`,
    );
  }
  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    surface_preference: target,
  };
}

function sumMix(mix: SurfaceMix): number {
  return (mix.road ?? 0) + (mix.gravel ?? 0) + (mix.path ?? 0) + (mix.trail ?? 0);
}

function isValidMix(mix: SurfaceMix): boolean {
  const total = sumMix(mix);
  return Math.abs(total - 1) <= MIX_SUM_TOLERANCE;
}
