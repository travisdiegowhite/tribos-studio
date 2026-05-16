import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../../../types/geo';
import type { RouteSnapshot } from '../../../types';
import {
  elevationGainInScope_m,
  maxSustainedGrade,
  totalElevationGain_m,
} from '../../shared/elevationUtils';

function eqGeometry(nPoints: number): Coordinate[] {
  const stepDeg = 0.009;
  const out: Coordinate[] = [];
  for (let i = 0; i < nPoints; i++) {
    out.push([i * stepDeg, 0]);
  }
  return out;
}

function snapshot(
  geom: Coordinate[],
  elevs: number[] | undefined,
  statsGain = 0,
  statsDistanceKm = 10,
): RouteSnapshot {
  return {
    geometry: geom,
    elevations_m: elevs,
    waypoints: [],
    stats: {
      distance_km: statsDistanceKm,
      elevation_gain_m: statsGain,
      elevation_loss_m: 0,
      duration_s: 0,
    },
  };
}

describe('totalElevationGain_m', () => {
  it('sums positive deltas across elevations', () => {
    const route = snapshot(eqGeometry(5), [100, 110, 105, 115, 120]);
    // 10 + 10 + 5 = 25
    expect(totalElevationGain_m(route)).toBe(25);
  });

  it('falls back to stats.elevation_gain_m when elevations missing', () => {
    const route = snapshot(eqGeometry(5), undefined, 42);
    expect(totalElevationGain_m(route)).toBe(42);
  });

  it('returns 0 when both elevations and stats are missing', () => {
    const route: RouteSnapshot = {
      geometry: eqGeometry(5),
      waypoints: [],
      stats: { distance_km: 5, elevation_gain_m: 0, elevation_loss_m: 0, duration_s: 0 },
    };
    expect(totalElevationGain_m(route)).toBe(0);
  });
});

describe('elevationGainInScope_m', () => {
  it('sums only deltas within the scope when per-point elevations exist', () => {
    // 11-point ~10km route, all rising
    const route = snapshot(eqGeometry(11), [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]);
    const total = totalElevationGain_m(route); // 100
    expect(total).toBe(100);

    const inScope = elevationGainInScope_m(route, { start_km: 4, end_km: 6 });
    // Within ~4-6km we capture a chunk of the climb
    expect(inScope).toBeGreaterThan(0);
    expect(inScope).toBeLessThan(total);
  });

  it('pro-rates by distance fraction when per-point elevations missing', () => {
    const route = snapshot(eqGeometry(11), undefined, 100, 10);
    const half = elevationGainInScope_m(route, { start_km: 0, end_km: 5 });
    expect(half).toBeCloseTo(50, 5);
  });

  it('returns 0 when distance is zero', () => {
    const route = snapshot(eqGeometry(2), undefined, 50, 0);
    expect(elevationGainInScope_m(route, { start_km: 0, end_km: 5 })).toBe(0);
  });
});

describe('maxSustainedGrade', () => {
  it('returns 0 when elevations are absent', () => {
    const route = snapshot(eqGeometry(10), undefined);
    expect(maxSustainedGrade(route)).toBe(0);
  });

  it('detects a steady positive grade', () => {
    // ~10km geometry rising 500m → 5% average grade
    const elevs: number[] = [];
    for (let i = 0; i < 11; i++) elevs.push(i * 50);
    const route = snapshot(eqGeometry(11), elevs);
    const grade = maxSustainedGrade(route);
    expect(grade).toBeGreaterThan(0.04);
    expect(grade).toBeLessThan(0.07);
  });

  it('returns 0 for a flat route', () => {
    const route = snapshot(eqGeometry(11), new Array(11).fill(100));
    expect(maxSustainedGrade(route)).toBe(0);
  });
});
