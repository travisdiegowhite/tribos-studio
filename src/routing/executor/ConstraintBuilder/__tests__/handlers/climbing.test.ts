import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForChangeClimbCharacter } from '../../handlers/change_climb_character';
import { buildConstraintForIncreaseClimbing } from '../../handlers/increase_climbing';
import { buildConstraintForReduceClimbing } from '../../handlers/reduce_climbing';
import { eqGeometry, makeContext, makeRoute } from '../fixtures';

describe('increase_climbing', () => {
  it('bumps target_elevation_gain_m by the magnitude fraction', () => {
    const geom = eqGeometry(11);
    const route = makeRoute({
      geometry: geom,
      elevations_m: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300],
      distance_km: 10,
    });
    const constraint = buildConstraintForIncreaseClimbing(route, makeContext(), {
      type: 'increase_climbing',
      magnitude: 'moderate',
    });
    // Current gain = 300m, +30% → 390m
    expect(constraint.target_elevation_gain_m).toBe(390);
  });

  it('throws infeasible_constraint when region is too flat', () => {
    const route = makeRoute({
      distance_km: 10,
      elevation_gain_m: 10, // 30m per 30km — too flat
    });
    expect(() =>
      buildConstraintForIncreaseClimbing(route, makeContext(), {
        type: 'increase_climbing',
        magnitude: 'small',
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('adds familiar_segments to prefer_segments', () => {
    const route = makeRoute({
      distance_km: 10,
      elevation_gain_m: 500,
    });
    const ctx = makeContext({ familiar_segments: ['seg-1', 'seg-2'] });
    const constraint = buildConstraintForIncreaseClimbing(route, ctx, {
      type: 'increase_climbing',
      magnitude: 'small',
    });
    expect(constraint.prefer_segments).toEqual(['seg-1', 'seg-2']);
  });
});

describe('reduce_climbing', () => {
  it('reduces target_elevation_gain_m by the magnitude fraction', () => {
    const route = makeRoute({
      distance_km: 10,
      elevation_gain_m: 500,
    });
    const constraint = buildConstraintForReduceClimbing(route, makeContext(), {
      type: 'reduce_climbing',
      magnitude: 'large',
    });
    // 500 × 0.5 = 250
    expect(constraint.target_elevation_gain_m).toBe(250);
  });

  it('clamps target to >= 0', () => {
    const route = makeRoute({ distance_km: 10, elevation_gain_m: 0 });
    const constraint = buildConstraintForReduceClimbing(route, makeContext(), {
      type: 'reduce_climbing',
      magnitude: 'small',
    });
    expect(constraint.target_elevation_gain_m).toBe(0);
  });

  it('emits empty avoid_segments in v1', () => {
    const route = makeRoute({ distance_km: 10, elevation_gain_m: 500 });
    const constraint = buildConstraintForReduceClimbing(route, makeContext(), {
      type: 'reduce_climbing',
      magnitude: 'small',
    });
    expect(constraint.avoid_segments).toEqual([]);
  });
});

describe('change_climb_character (STUB)', () => {
  it('always throws unsupported_mutation', () => {
    const route = makeRoute();
    try {
      buildConstraintForChangeClimbCharacter(route, makeContext(), {
        type: 'change_climb_character',
        target: 'sustained',
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConstraintBuilderError);
      expect((e as ConstraintBuilderError).kind).toBe('unsupported_mutation');
      expect((e as ConstraintBuilderError).mutationType).toBe(
        'change_climb_character',
      );
    }
  });
});
