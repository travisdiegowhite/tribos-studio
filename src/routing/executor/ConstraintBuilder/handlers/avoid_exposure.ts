/**
 * avoid_exposure — confidence: experimental.
 *
 * Requires weather/time-of-day context. v1 builds the schema-conformant
 * constraint when context is present; exposed-segment identification is
 * a placeholder until the weather integration ships in v1.5.
 *
 * The mutation may also supply weather inline via `condition`; we
 * prefer the mutation-level data when present and fall back to
 * RouteContext.
 */

import type { Coordinate } from '../../../../types/geo';
import type {
  Mutation,
  RouteConstraint,
  RouteContext,
  RouteSnapshot,
  SegmentId,
  WeatherContext,
} from '../../types';
import { ConstraintBuilderError } from '../ConstraintBuilderError';

export function buildConstraintForAvoidExposure(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Extract<Mutation, { type: 'avoid_exposure' }>,
): RouteConstraint {
  if (mutation.exposure_type === 'wind') {
    const weather: WeatherContext | undefined =
      mutation.condition ?? context.weather;
    if (!weather || typeof weather.wind_direction_deg !== 'number') {
      throw new ConstraintBuilderError(
        'context_missing',
        'avoid_exposure',
        'avoid_exposure(wind) requires weather.wind_direction_deg in mutation.condition or context.weather.',
        { required_field: 'weather.wind_direction_deg' },
      );
    }
  } else if (mutation.exposure_type === 'sun') {
    if (!context.time_of_day) {
      throw new ConstraintBuilderError(
        'context_missing',
        'avoid_exposure',
        'avoid_exposure(sun) requires context.time_of_day.',
        { required_field: 'time_of_day' },
      );
    }
  }

  const waypoints: Coordinate[] = route.waypoints.map((wp) => wp.coordinate);
  // v1: empty avoid list — exposure analysis is a v1.5 deliverable.
  const avoid_segments: SegmentId[] = [];

  return {
    waypoints,
    profile: context.profile ?? 'road',
    shape: context.shape ?? 'point_to_point',
    avoid_segments,
  };
}
