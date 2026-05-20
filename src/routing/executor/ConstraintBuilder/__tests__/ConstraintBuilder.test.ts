import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIDENCE_RATINGS,
  ConstraintBuilderError,
  buildConstraint,
} from '../ConstraintBuilder';
import { makeContext, makeRoute } from './fixtures';
import type { Mutation, MutationType } from '../../types';

vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../../utils/routeBuilderTelemetry';

const trackMock = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

const ALL_MUTATION_TYPES: MutationType[] = [
  'extend_distance',
  'shorten_distance',
  'trim_route',
  'reverse_route',
  'smooth_route',
  'change_route_shape',
  'increase_climbing',
  'reduce_climbing',
  'change_climb_character',
  'change_surface_mix',
  'change_traffic_preference',
  'avoid_exposure',
  'anchor_through',
  'anchor_at_poi',
  'avoid_segment',
  'avoid_segment_by_property',
  'swap_to_familiar',
  'swap_to_unfamiliar',
  'optimize_for',
];

const STUB_TYPES = new Set<MutationType>([
  'change_climb_character',
  'anchor_at_poi',
  'avoid_segment_by_property',
]);

describe('CONFIDENCE_RATINGS', () => {
  it('has an entry for all 19 mutation types', () => {
    for (const t of ALL_MUTATION_TYPES) {
      expect(CONFIDENCE_RATINGS[t]).toBeDefined();
    }
  });

  it('marks the three stubs as experimental or best-effort', () => {
    expect(CONFIDENCE_RATINGS.change_climb_character).toBe('experimental');
    expect(CONFIDENCE_RATINGS.anchor_at_poi).toBe('best-effort');
    expect(CONFIDENCE_RATINGS.avoid_segment_by_property).toBe('best-effort');
  });

  it('marks optimize_for as safety-net', () => {
    expect(CONFIDENCE_RATINGS.optimize_for).toBe('safety-net');
  });
});

describe('buildConstraint dispatcher', () => {
  beforeEach(() => {
    trackMock.mockClear();
  });

  afterEach(() => {
    trackMock.mockClear();
  });

  it('dispatches reverse_route to its handler', () => {
    const route = makeRoute();
    const constraint = buildConstraint(route, makeContext(), {
      type: 'reverse_route',
    });
    expect(constraint.waypoints.length).toBe(route.waypoints.length);
  });

  it('dispatches avoid_segment correctly', () => {
    const route = makeRoute();
    const constraint = buildConstraint(route, makeContext(), {
      type: 'avoid_segment',
      segment_id: 'abc',
    });
    expect(constraint.avoid_segments).toEqual(['abc']);
  });

  it('the three stubs all throw unsupported_mutation', () => {
    const route = makeRoute();
    const stubs: Mutation[] = [
      { type: 'change_climb_character', target: 'sustained' },
      { type: 'anchor_at_poi', poi_query: 'coffee' },
      { type: 'avoid_segment_by_property', property: 'steep_climb' },
    ];
    for (const m of stubs) {
      expect(() => buildConstraint(route, makeContext(), m)).toThrow(
        ConstraintBuilderError,
      );
    }
  });

  it('optimize_for throws unsupported_mutation', () => {
    const route = makeRoute();
    expect(() =>
      buildConstraint(route, makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      }),
    ).toThrow(ConstraintBuilderError);
  });
});

describe('telemetry', () => {
  beforeEach(() => {
    trackMock.mockClear();
  });

  it('emits constraint_built on success', () => {
    buildConstraint(makeRoute(), makeContext(), { type: 'reverse_route' });
    const calls = trackMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('constraint_built');
  });

  it('constraint_built includes mutation_type, scoped, confidence', () => {
    buildConstraint(makeRoute(), makeContext(), { type: 'reverse_route' });
    const builtCall = trackMock.mock.calls.find((c) => c[0] === 'constraint_built');
    expect(builtCall).toBeDefined();
    const props = builtCall?.[1] as Record<string, unknown>;
    expect(props?.mutation_type).toBe('reverse_route');
    expect(props?.scoped).toBe(false);
    expect(props?.confidence).toBe('reliable');
  });

  it('reports scoped=true for scoped mutations', () => {
    const route = makeRoute({ distance_km: 10, elevation_gain_m: 500 });
    buildConstraint(route, makeContext(), {
      type: 'reduce_climbing',
      magnitude: 'small',
      scope: { start_km: 0, end_km: 5 },
    });
    const builtCall = trackMock.mock.calls.find((c) => c[0] === 'constraint_built');
    expect((builtCall?.[1] as Record<string, unknown>)?.scoped).toBe(true);
  });

  it('emits constraint_failed when a handler throws ConstraintBuilderError', () => {
    expect(() =>
      buildConstraint(makeRoute(), makeContext(), {
        type: 'shorten_distance',
        delta_km: -1,
      }),
    ).toThrow();
    const calls = trackMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('constraint_failed');
  });

  it('emits constraint_stub_called when a stub fires', () => {
    expect(() =>
      buildConstraint(makeRoute(), makeContext(), {
        type: 'change_climb_character',
        target: 'sustained',
      }),
    ).toThrow();
    const calls = trackMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('constraint_stub_called');
  });

  it('does NOT emit constraint_stub_called for non-stub failures', () => {
    expect(() =>
      buildConstraint(makeRoute(), makeContext(), {
        type: 'shorten_distance',
        delta_km: -1,
      }),
    ).toThrow();
    const calls = trackMock.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('constraint_stub_called');
  });

  it('constraint_failed includes error_kind and truncated error_message', () => {
    expect(() =>
      buildConstraint(makeRoute(), makeContext(), {
        type: 'shorten_distance',
        delta_km: -1,
      }),
    ).toThrow();
    const failed = trackMock.mock.calls.find((c) => c[0] === 'constraint_failed');
    const props = failed?.[1] as Record<string, unknown>;
    expect(props?.error_kind).toBe('infeasible_constraint');
    expect(typeof props?.error_message).toBe('string');
    expect((props?.error_message as string).length).toBeLessThanOrEqual(200);
  });
});

describe('ConstraintBuilderError', () => {
  it('exposes kind and mutationType', () => {
    const err = new ConstraintBuilderError(
      'context_missing',
      'avoid_exposure',
      'missing field',
      { required_field: 'weather' },
    );
    expect(err.kind).toBe('context_missing');
    expect(err.mutationType).toBe('avoid_exposure');
    expect(err.details).toEqual({ required_field: 'weather' });
    expect(err.message).toBe('missing field');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('stub coverage', () => {
  it('every stub type is wired to a handler that throws', () => {
    const route = makeRoute();
    for (const t of STUB_TYPES) {
      let threw = false;
      try {
        // Each stub mutation has a minimal payload that satisfies its
        // type narrowing.
        let m: Mutation;
        if (t === 'change_climb_character') m = { type: t, target: 'sustained' };
        else if (t === 'anchor_at_poi') m = { type: t, poi_query: 'x' };
        else if (t === 'avoid_segment_by_property') m = { type: t, property: 'steep_climb' };
        else throw new Error(`unhandled stub type: ${t}`);
        buildConstraint(route, makeContext(), m);
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(ConstraintBuilderError);
        expect((e as ConstraintBuilderError).kind).toBe('unsupported_mutation');
      }
      expect(threw).toBe(true);
    }
  });
});
