/**
 * Tests for the variety perturbation strategy.
 *
 * Pure function — no router calls. Coverage goal is 100%.
 */

import { describe, expect, it } from 'vitest';

import type { Coordinate } from '../../../../types/geo';
import type { RouteConstraint } from '../../types';
import {
  PERTURBATION_STRATEGIES,
  type PerturbationStrategy,
  varietyPerturbation,
} from '../variety';

function makeBaseConstraint(overrides: Partial<RouteConstraint> = {}): RouteConstraint {
  const start: Coordinate = [-105.05, 40.05];
  return {
    waypoints: [start, [-105.0, 40.1], start],
    profile: 'road',
    shape: 'loop',
    target_distance_km: 40,
    target_elevation_gain_m: 300,
    surface_preference: { road: 1 },
    ...overrides,
  };
}

describe('varietyPerturbation', () => {
  it('exposes exactly three strategies (north, east, south — west deliberately omitted)', () => {
    expect(PERTURBATION_STRATEGIES).toEqual([
      'cardinal_north',
      'cardinal_east',
      'cardinal_south',
    ]);
  });

  it('cardinal_north places the seed midpoint north of the start', () => {
    const base = makeBaseConstraint();
    const out = varietyPerturbation(base, 'cardinal_north');
    const [start, mid] = out.waypoints;
    expect(mid[1]).toBeGreaterThan(start[1]);
    expect(Math.abs(mid[0] - start[0])).toBeLessThan(1e-6);
  });

  it('cardinal_east places the seed midpoint east of the start', () => {
    const base = makeBaseConstraint();
    const out = varietyPerturbation(base, 'cardinal_east');
    const [start, mid] = out.waypoints;
    expect(mid[0]).toBeGreaterThan(start[0]);
    expect(Math.abs(mid[1] - start[1])).toBeLessThan(1e-6);
  });

  it('cardinal_south places the seed midpoint south of the start', () => {
    const base = makeBaseConstraint();
    const out = varietyPerturbation(base, 'cardinal_south');
    const [start, mid] = out.waypoints;
    expect(mid[1]).toBeLessThan(start[1]);
    expect(Math.abs(mid[0] - start[0])).toBeLessThan(1e-6);
  });

  it('returns a loop shape (first and last waypoints match the start)', () => {
    const base = makeBaseConstraint();
    for (const strategy of PERTURBATION_STRATEGIES) {
      const out = varietyPerturbation(base, strategy);
      const start = base.waypoints[0];
      expect(out.waypoints.length).toBe(3);
      expect(out.waypoints[0]).toEqual(start);
      expect(out.waypoints[2]).toEqual(start);
    }
  });

  it('scales offset by target_distance', () => {
    const small = makeBaseConstraint({ target_distance_km: 20 });
    const large = makeBaseConstraint({ target_distance_km: 80 });
    const smallOut = varietyPerturbation(small, 'cardinal_north');
    const largeOut = varietyPerturbation(large, 'cardinal_north');
    const smallOffset = Math.abs(smallOut.waypoints[1][1] - smallOut.waypoints[0][1]);
    const largeOffset = Math.abs(largeOut.waypoints[1][1] - largeOut.waypoints[0][1]);
    expect(largeOffset).toBeGreaterThan(smallOffset);
    // Offset scales linearly with target distance (legKm = target / 4).
    expect(largeOffset / smallOffset).toBeCloseTo(4, 4);
  });

  it('falls back to a sensible default when target_distance_km is missing', () => {
    const base = makeBaseConstraint({ target_distance_km: undefined });
    const out = varietyPerturbation(base, 'cardinal_north');
    const offset = Math.abs(out.waypoints[1][1] - out.waypoints[0][1]);
    expect(offset).toBeGreaterThan(0);
  });

  it('preserves other base constraint fields', () => {
    const base = makeBaseConstraint();
    const out = varietyPerturbation(base, 'cardinal_north');
    expect(out.profile).toBe(base.profile);
    expect(out.target_distance_km).toBe(base.target_distance_km);
    expect(out.target_elevation_gain_m).toBe(base.target_elevation_gain_m);
    expect(out.surface_preference).toEqual(base.surface_preference);
  });

  it('forces shape to loop regardless of base shape', () => {
    const base = makeBaseConstraint({ shape: 'point_to_point' });
    const out = varietyPerturbation(base, 'cardinal_north');
    expect(out.shape).toBe('loop');
  });

  it('throws when base has no waypoints', () => {
    const base = makeBaseConstraint({ waypoints: [] });
    expect(() => varietyPerturbation(base, 'cardinal_north')).toThrow(
      /no waypoints/,
    );
  });

  it('produces three geometrically distinct seeds for the same base', () => {
    const base = makeBaseConstraint();
    const strategies: PerturbationStrategy[] = [
      'cardinal_north',
      'cardinal_east',
      'cardinal_south',
    ];
    const midpoints = strategies.map(
      (s) => varietyPerturbation(base, s).waypoints[1],
    );
    // No two midpoints should be equal.
    for (let i = 0; i < midpoints.length; i++) {
      for (let j = i + 1; j < midpoints.length; j++) {
        expect(midpoints[i]).not.toEqual(midpoints[j]);
      }
    }
  });
});
