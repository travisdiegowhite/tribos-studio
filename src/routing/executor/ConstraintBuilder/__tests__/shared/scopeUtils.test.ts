import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../../../types/geo';
import type { RouteSnapshot } from '../../../types';
import {
  cumulativeKmAlongGeometry,
  geometryIndexAtKm,
  splitByScope,
  totalDistanceKm,
  waypointKmOffsets,
  waypointsInScope,
} from '../../shared/scopeUtils';

/**
 * Build a synthetic geometry along the equator at 1 km steps. At the
 * equator, 1° of longitude ≈ 111.319 km. We use a 0.009° step ≈ 1.002 km
 * per segment — close enough for unit-test assertions with ~1% tolerance.
 */
function eqGeometry(nPoints: number): Coordinate[] {
  // Use latitude 0 (the equator) so 0.009° of longitude ≈ 1.002 km.
  // At higher latitudes, cos(lat) shrinks the east-west distance.
  const stepDeg = 0.009;
  const out: Coordinate[] = [];
  for (let i = 0; i < nPoints; i++) {
    out.push([i * stepDeg, 0]);
  }
  return out;
}

function snapshot(geom: Coordinate[], waypoints: Coordinate[] = []): RouteSnapshot {
  return {
    geometry: geom,
    waypoints: waypoints.map((c) => ({ coordinate: c })),
    stats: { distance_km: 0, elevation_gain_m: 0, elevation_loss_m: 0, duration_s: 0 },
  };
}

describe('cumulativeKmAlongGeometry', () => {
  it('returns [] for empty geometry', () => {
    expect(cumulativeKmAlongGeometry([])).toEqual([]);
  });

  it('returns [0] for single point', () => {
    expect(cumulativeKmAlongGeometry([[0, 0]])).toEqual([0]);
  });

  it('accumulates distance monotonically', () => {
    const cum = cumulativeKmAlongGeometry(eqGeometry(5));
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    for (let i = 1; i < cum.length; i++) {
      expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
    }
  });
});

describe('totalDistanceKm', () => {
  it('matches the cumulative distance of the last point', () => {
    const geom = eqGeometry(11); // 10 segments × ~1 km
    const route = snapshot(geom);
    const total = totalDistanceKm(route);
    expect(total).toBeGreaterThan(9.5);
    expect(total).toBeLessThan(10.5);
  });

  it('falls back to stats.distance_km when geometry is too short', () => {
    const route: RouteSnapshot = {
      geometry: [[0, 0]],
      waypoints: [],
      stats: { distance_km: 7, elevation_gain_m: 0, elevation_loss_m: 0, duration_s: 0 },
    };
    expect(totalDistanceKm(route)).toBe(7);
  });
});

describe('waypointKmOffsets', () => {
  it('returns [] for empty geometry or waypoints', () => {
    expect(waypointKmOffsets(snapshot([]))).toEqual([]);
    expect(waypointKmOffsets(snapshot(eqGeometry(5)))).toEqual([]);
  });

  it('snaps waypoints to nearest geometry index and returns cumulative km', () => {
    const geom = eqGeometry(11); // ~10km route
    const route = snapshot(geom, [geom[0], geom[5], geom[10]]);
    const offsets = waypointKmOffsets(route);
    expect(offsets[0]).toBeCloseTo(0, 5);
    expect(offsets[1]).toBeGreaterThan(4.5);
    expect(offsets[1]).toBeLessThan(5.5);
    expect(offsets[2]).toBeGreaterThan(9.5);
  });
});

describe('waypointsInScope', () => {
  it('includes waypoints at scope boundaries', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom, [geom[0], geom[5], geom[10]]);
    const inScope = waypointsInScope(route, { start_km: 0, end_km: 11 });
    expect(inScope.length).toBe(3);
  });

  it('excludes waypoints outside scope', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom, [geom[0], geom[5], geom[10]]);
    const inScope = waypointsInScope(route, { start_km: 4, end_km: 6 });
    expect(inScope.length).toBe(1);
    expect(inScope[0].coordinate).toEqual(geom[5]);
  });

  it('returns empty for a scope that excludes all waypoints', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom, [geom[0], geom[10]]);
    const inScope = waypointsInScope(route, { start_km: 3, end_km: 7 });
    expect(inScope).toEqual([]);
  });
});

describe('splitByScope', () => {
  it('partitions geometry into before/within/after', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom);
    const { before, within, after } = splitByScope(route, { start_km: 3, end_km: 7 });
    expect(before.length + within.length + after.length).toBe(geom.length);
    expect(before.length).toBeGreaterThan(0);
    expect(within.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
  });

  it('empty slices for an out-of-range scope', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom);
    const { before, within, after } = splitByScope(route, { start_km: 100, end_km: 200 });
    expect(before.length).toBe(geom.length);
    expect(within).toEqual([]);
    expect(after).toEqual([]);
  });
});

describe('geometryIndexAtKm', () => {
  it('returns -1 for empty geometry', () => {
    const route = snapshot([]);
    expect(geometryIndexAtKm(route, 5)).toBe(-1);
  });

  it('returns the index closest to the target km', () => {
    const geom = eqGeometry(11);
    const route = snapshot(geom);
    const idx = geometryIndexAtKm(route, 5);
    // 5km along a 10km route ≈ index 5 of 11 points
    expect(idx).toBeGreaterThanOrEqual(4);
    expect(idx).toBeLessThanOrEqual(6);
  });

  it('returns 0 for negative target', () => {
    const geom = eqGeometry(5);
    const route = snapshot(geom);
    expect(geometryIndexAtKm(route, -100)).toBe(0);
  });

  it('returns last index for target past the end', () => {
    const geom = eqGeometry(5);
    const route = snapshot(geom);
    expect(geometryIndexAtKm(route, 999)).toBe(geom.length - 1);
  });
});
