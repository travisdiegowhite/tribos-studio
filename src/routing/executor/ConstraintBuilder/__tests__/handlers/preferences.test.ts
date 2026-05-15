import { describe, expect, it } from 'vitest';
import { ConstraintBuilderError } from '../../ConstraintBuilderError';
import { buildConstraintForAvoidExposure } from '../../handlers/avoid_exposure';
import { buildConstraintForChangeSurfaceMix } from '../../handlers/change_surface_mix';
import { buildConstraintForChangeTrafficPreference } from '../../handlers/change_traffic_preference';
import { makeContext, makeRoute } from '../fixtures';

describe('change_surface_mix', () => {
  it('passes through a valid mix as surface_preference', () => {
    const route = makeRoute();
    const target = { road: 0.5, gravel: 0.5 };
    const constraint = buildConstraintForChangeSurfaceMix(route, makeContext(), {
      type: 'change_surface_mix',
      target,
    });
    expect(constraint.surface_preference).toEqual(target);
  });

  it('throws infeasible_constraint when mix does not sum to ~1.0', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForChangeSurfaceMix(route, makeContext(), {
        type: 'change_surface_mix',
        target: { road: 0.5, gravel: 0.2 },
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('accepts mixes within tolerance', () => {
    const route = makeRoute();
    const target = { road: 0.5, gravel: 0.47 }; // 0.97 — within 0.05 tolerance
    expect(() =>
      buildConstraintForChangeSurfaceMix(route, makeContext(), {
        type: 'change_surface_mix',
        target,
      }),
    ).not.toThrow();
  });
});

describe('change_traffic_preference', () => {
  it('passes through the target traffic preference', () => {
    const route = makeRoute();
    const constraint = buildConstraintForChangeTrafficPreference(
      route,
      makeContext(),
      { type: 'change_traffic_preference', target: 'minimal' },
    );
    expect(constraint.traffic_preference).toBe('minimal');
  });

  it('handles "low" target', () => {
    const route = makeRoute();
    const constraint = buildConstraintForChangeTrafficPreference(
      route,
      makeContext(),
      { type: 'change_traffic_preference', target: 'low' },
    );
    expect(constraint.traffic_preference).toBe('low');
  });
});

describe('avoid_exposure', () => {
  it('throws context_missing for wind without weather', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForAvoidExposure(route, makeContext(), {
        type: 'avoid_exposure',
        exposure_type: 'wind',
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('accepts wind when condition supplies wind_direction_deg', () => {
    const route = makeRoute();
    const constraint = buildConstraintForAvoidExposure(route, makeContext(), {
      type: 'avoid_exposure',
      exposure_type: 'wind',
      condition: { wind_direction_deg: 270 },
    });
    expect(constraint.avoid_segments).toEqual([]);
  });

  it('accepts wind when context provides weather', () => {
    const route = makeRoute();
    const ctx = makeContext({ weather: { wind_direction_deg: 90 } });
    const constraint = buildConstraintForAvoidExposure(route, ctx, {
      type: 'avoid_exposure',
      exposure_type: 'wind',
    });
    expect(constraint.avoid_segments).toEqual([]);
  });

  it('throws context_missing for sun without time_of_day', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraintForAvoidExposure(route, makeContext(), {
        type: 'avoid_exposure',
        exposure_type: 'sun',
      }),
    ).toThrow(ConstraintBuilderError);
  });

  it('accepts sun when time_of_day is set', () => {
    const route = makeRoute();
    const ctx = makeContext({ time_of_day: '2026-05-14T14:00:00Z' });
    const constraint = buildConstraintForAvoidExposure(route, ctx, {
      type: 'avoid_exposure',
      exposure_type: 'sun',
    });
    expect(constraint.avoid_segments).toEqual([]);
  });
});
