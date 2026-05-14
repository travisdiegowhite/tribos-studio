/**
 * Elevation analysis helpers.
 *
 * Routes carry per-point elevations on the optional `elevations_m` field
 * of `RouteSnapshot`. When that's missing, we fall back to
 * `stats.elevation_gain_m`. Scope-restricted gain requires per-point
 * data — when absent we approximate by pro-rating the total by
 * scope-distance fraction.
 */

import type { Coordinate } from '../../../../types/geo';
import { haversineMeters } from '../../../../utils/distanceUnits';
import type { RouteSnapshot, Scope } from '../../types';
import { cumulativeKmAlongGeometry } from './scopeUtils';

/**
 * Sum of positive elevation deltas across the route. Falls back to
 * `route.stats.elevation_gain_m` if per-point elevations are not
 * present.
 */
export function totalElevationGain_m(route: RouteSnapshot): number {
  const elevs = route.elevations_m;
  if (!elevs || elevs.length < 2) {
    return route.stats?.elevation_gain_m ?? 0;
  }
  let gain = 0;
  for (let i = 1; i < elevs.length; i++) {
    const delta = elevs[i] - elevs[i - 1];
    if (delta > 0) gain += delta;
  }
  return gain;
}

/**
 * Elevation gain within a km-scope window. If per-point elevations are
 * absent, returns a pro-rated estimate based on scope distance fraction.
 */
export function elevationGainInScope_m(route: RouteSnapshot, scope: Scope): number {
  const elevs = route.elevations_m;
  if (!elevs || elevs.length !== route.geometry.length || elevs.length < 2) {
    const total = route.stats?.elevation_gain_m ?? 0;
    const distance = route.stats?.distance_km ?? 0;
    if (distance <= 0) return 0;
    const scopeLength = Math.max(0, scope.end_km - scope.start_km);
    return total * Math.min(1, scopeLength / distance);
  }

  const cum = cumulativeKmAlongGeometry(route.geometry);
  let gain = 0;
  for (let i = 1; i < elevs.length; i++) {
    const km = cum[i];
    if (km < scope.start_km || km > scope.end_km) continue;
    const delta = elevs[i] - elevs[i - 1];
    if (delta > 0) gain += delta;
  }
  return gain;
}

/**
 * The maximum sustained grade (rise / run) across the route, measured
 * over sliding windows of at least `windowMinLengthM` meters. Returns
 * 0 when per-point elevations are unavailable.
 */
export function maxSustainedGrade(route: RouteSnapshot, windowMinLengthM = 500): number {
  const elevs = route.elevations_m;
  const geom = route.geometry;
  if (!elevs || elevs.length !== geom.length || elevs.length < 2) return 0;

  let maxGrade = 0;
  let i = 0;
  while (i < geom.length - 1) {
    let j = i + 1;
    let runM = segmentMeters(geom[i], geom[j]);
    while (runM < windowMinLengthM && j < geom.length - 1) {
      j++;
      runM += segmentMeters(geom[j - 1], geom[j]);
    }
    if (runM <= 0) {
      i++;
      continue;
    }
    const rise = elevs[j] - elevs[i];
    if (rise > 0) {
      const grade = rise / runM;
      if (grade > maxGrade) maxGrade = grade;
    }
    i++;
  }
  return maxGrade;
}

function segmentMeters(a: Coordinate, b: Coordinate): number {
  return haversineMeters(a[1], a[0], b[1], b[0]);
}
