/**
 * reduce_climbing — confidence: reliable.
 *
 * Lowers target elevation gain by the magnitude fraction. ConstraintBuilder
 * cannot map current-route segment IDs without a segment-classification
 * layer, so v1 emits an empty avoid_segments list; T2.3 / analysis may
 * later attach concrete IDs.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
  SegmentId,
} from '../../types';
import {
  elevationGainInScope_m,
  totalElevationGain_m,
} from '../shared/elevationUtils';
import { fractionForMagnitude } from '../shared/magnitudes';

export function buildConstraintForReduceClimbing(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'reduce_climbing' }>,
): RouteConstraint {
  const currentGain = mutation.scope
    ? elevationGainInScope_m(route, mutation.scope)
    : totalElevationGain_m(route);
  const fraction = fractionForMagnitude(mutation.magnitude);
  const target_elevation_gain_m = Math.max(0, Math.round(currentGain * (1 - fraction)));

  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  const avoid_segments: SegmentId[] = [];

  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    target_elevation_gain_m,
    avoid_segments,
  };
}
