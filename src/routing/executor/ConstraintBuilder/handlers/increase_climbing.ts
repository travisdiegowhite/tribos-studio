/**
 * increase_climbing — confidence: reliable.
 *
 * Bumps the target elevation gain by the magnitude fraction. Adds any
 * known climbing-classified familiar segments to prefer_segments as a
 * hint for the router.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';
import {
  elevationGainInScope_m,
  totalElevationGain_m,
} from '../shared/elevationUtils';
import { fractionForMagnitude } from '../shared/magnitudes';
import { totalDistanceKm } from '../shared/scopeUtils';

const MIN_REGION_GAIN_M_PER_30KM = 100;

export function buildConstraintForIncreaseClimbing(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'increase_climbing' }>,
): RouteConstraint {
  const totalKm = totalDistanceKm(route);
  const totalGain = totalElevationGain_m(route);

  // Crude feasibility: if the region appears nearly flat (per-30km gain
  // below threshold), the router has nothing to find. Use the current
  // route as a proxy for region terrain when it spans >= 5km.
  if (totalKm >= 5) {
    const per30km = (totalGain / Math.max(1, totalKm)) * 30;
    if (per30km < MIN_REGION_GAIN_M_PER_30KM) {
      throw new ConstraintBuilderError(
        'infeasible_constraint',
        'increase_climbing',
        `Region has insufficient elevation (${per30km.toFixed(0)}m per 30km) to honor increase_climbing.`,
      );
    }
  }

  const currentGain = mutation.scope
    ? elevationGainInScope_m(route, mutation.scope)
    : totalGain;
  const fraction = fractionForMagnitude(mutation.magnitude);
  const target_elevation_gain_m = Math.round(currentGain * (1 + fraction));

  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  const prefer_segments = context.familiar_segments?.length
    ? [...context.familiar_segments]
    : undefined;

  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    target_elevation_gain_m,
    ...(prefer_segments ? { prefer_segments } : {}),
  };
}
