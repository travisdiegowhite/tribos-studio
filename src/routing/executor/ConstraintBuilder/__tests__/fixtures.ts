/**
 * Test fixtures shared across ConstraintBuilder handler tests.
 *
 * Synthetic routes are built along the equator so that 0.009° of
 * longitude ≈ 1.002 km — close enough for tests with ~1% tolerance.
 */

import type { Coordinate } from '../../../../types/geo';
import type { RouteContext, RouteSnapshot } from '../../types';

export function eqGeometry(nPoints: number, startLng = 0): Coordinate[] {
  const stepDeg = 0.009;
  const out: Coordinate[] = [];
  for (let i = 0; i < nPoints; i++) {
    out.push([startLng + i * stepDeg, 0]);
  }
  return out;
}

export function makeRoute(opts: {
  geometry?: Coordinate[];
  waypoints?: Coordinate[];
  elevations_m?: number[];
  distance_km?: number;
  elevation_gain_m?: number;
  elevation_loss_m?: number;
  duration_s?: number;
} = {}): RouteSnapshot {
  const geometry = opts.geometry ?? eqGeometry(11);
  const waypoints = (opts.waypoints ?? [geometry[0], geometry[geometry.length - 1]]).map(
    (c) => ({ coordinate: c }),
  );
  return {
    geometry,
    waypoints,
    elevations_m: opts.elevations_m,
    stats: {
      distance_km: opts.distance_km ?? 10,
      elevation_gain_m: opts.elevation_gain_m ?? 0,
      elevation_loss_m: opts.elevation_loss_m ?? 0,
      duration_s: opts.duration_s ?? 0,
    },
  };
}

export function makeContext(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    profile: 'road',
    shape: 'point_to_point',
    ...overrides,
  };
}
