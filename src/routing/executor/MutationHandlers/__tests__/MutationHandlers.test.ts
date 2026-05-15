import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the telemetry helper so tests can assert event emission without
// hitting PostHog. ConstraintBuilder and RouterClient also call
// `trackRouteBuilder`; the suite filters for `mutation_handler_*` events.
vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../../utils/routeBuilderTelemetry';
import { setRouterClient } from '../../../RouterClient';
import type { Mutation } from '../../types';
import { applyMutation } from '../MutationHandlers';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  makeStubRouterClient,
  makeThrowingRouterClient,
} from './helpers';

const mockTrack = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

/** Names of the `mutation_handler_*` events emitted so far, in order. */
function handlerEvents(): string[] {
  return mockTrack.mock.calls
    .map((c) => c[0] as string)
    .filter((name) => name.startsWith('mutation_handler_'));
}

/** Properties of the first emitted event with the given name. */
function eventProps(name: string): Record<string, unknown> | undefined {
  const call = mockTrack.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, unknown> | undefined;
}

describe('applyMutation', () => {
  beforeEach(() => {
    mockTrack.mockReset();
  });
  afterEach(() => {
    setRouterClient(null);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  describe('happy paths', () => {
    it('returns success with a new route for a valid reverse_route', async () => {
      setRouterClient(
        makeStubRouterClient((p) => {
          p.stadia.succeedWith(makeRoute({ distance_km: 12 }));
        }),
      );
      const result = await applyMutation(
        makeRoute({ distance_km: 10 }),
        makeContext(),
        { type: 'reverse_route' },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBe(12);
      expect(result.metadata.provider_used).toBe('stadia');
    });

    it('returns success with a new route for a valid reduce_climbing', async () => {
      setRouterClient(
        makeStubRouterClient((p) => {
          p.stadia.succeedWith(makeRoute({ distance_km: 10, elevation_gain_m: 60 }));
        }),
      );
      const result = await applyMutation(
        makeRoute({ distance_km: 10, elevation_gain_m: 100 }),
        makeContext(),
        { type: 'reduce_climbing', magnitude: 'moderate' },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.elevation_gain_m).toBe(60);
    });

    it('passes the metadata from RouterClient straight through', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata).toMatchObject({
        provider_used: 'stadia',
        cache_hit: false,
      });
      expect(typeof result.metadata.duration_ms).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // ConstraintBuilder failures
  // -------------------------------------------------------------------------

  describe('ConstraintBuilder failures', () => {
    it('returns mutation_not_supported for change_climb_character (stub)', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'change_climb_character',
        target: 'punchy',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('mutation_not_supported');
      if (result.reason.kind !== 'mutation_not_supported') return;
      expect(result.reason.mutation_type).toBe('change_climb_character');
    });

    it('returns mutation_not_supported for anchor_at_poi (stub)', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'anchor_at_poi',
        poi_query: 'coffee shop',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('mutation_not_supported');
    });

    it('returns mutation_not_supported for avoid_segment_by_property (stub)', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'avoid_segment_by_property',
        property: 'steep_climb',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('mutation_not_supported');
    });

    it('returns mutation_not_supported for raw optimize_for (safety net)', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('mutation_not_supported');
      if (result.reason.kind !== 'mutation_not_supported') return;
      expect(result.reason.mutation_type).toBe('optimize_for');
    });

    it('returns context_missing when required context is absent', async () => {
      setRouterClient(makeStubRouterClient());
      // avoid_exposure(wind) needs weather.wind_direction_deg.
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'avoid_exposure',
        exposure_type: 'wind',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('context_missing');
      if (result.reason.kind !== 'context_missing') return;
      expect(result.reason.required_field).toBe('weather.wind_direction_deg');
    });

    it('returns constraint_infeasible when a mutation produces an impossible target', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute({ distance_km: 10 }), makeContext(), {
        type: 'extend_distance',
        delta_km: 999,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('constraint_infeasible');
      if (result.reason.kind !== 'constraint_infeasible') return;
      expect(result.reason.constraint).toBe('extend_distance');
      expect(result.reason.explanation).toBeTruthy();
    });

    it('does not call RouterClient when ConstraintBuilder rejects the mutation', async () => {
      const client = makeStubRouterClient();
      setRouterClient(client);
      await applyMutation(makeRoute(), makeContext(), {
        type: 'optimize_for',
        criterion: 'speed',
      });
      // The stub's stadia.solve must never have been reached.
      expect(client.cacheSize()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // RouterClient failures
  // -------------------------------------------------------------------------

  describe('RouterClient failures', () => {
    it('passes through router_unavailable when every provider fails', async () => {
      setRouterClient(
        makeStubRouterClient((p) => {
          p.stadia.failWith('network_error');
          p.brouter.failWith('network_error');
          p.mapbox.failWith('network_error');
        }),
      );
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('router_unavailable');
    });

    it('passes through waypoint_unreachable from RouterClient unchanged', async () => {
      // RouterClient's own fallback chain only ever emits
      // `router_unavailable`; a fake client is the only way to drive
      // the `waypoint_unreachable` passthrough path.
      setRouterClient(
        makeFakeRouterClient({
          ok: false,
          reason: { kind: 'waypoint_unreachable', waypoint_index: 1 },
        }),
      );
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'anchor_through',
        coordinate: [-105.05, 40],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('waypoint_unreachable');
      if (result.reason.kind !== 'waypoint_unreachable') return;
      expect(result.reason.waypoint_index).toBe(1);
    });

    it('passes through constraint_infeasible originating in RouterClient', async () => {
      setRouterClient(
        makeFakeRouterClient({
          ok: false,
          reason: {
            kind: 'constraint_infeasible',
            constraint: 'waypoints',
            explanation: 'router could not satisfy the constraint',
          },
        }),
      );
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('constraint_infeasible');
    });

    it('never throws — a RouterClient that throws becomes internal_error', async () => {
      setRouterClient(makeThrowingRouterClient(new Error('socket exploded')));
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
      if (result.reason.kind !== 'internal_error') return;
      expect(result.reason.message).toContain('socket exploded');
    });

    it('never throws — a non-Error rejection is still mapped to internal_error', async () => {
      setRouterClient(makeThrowingRouterClient('plain string failure'));
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
      if (result.reason.kind !== 'internal_error') return;
      expect(result.reason.message).toContain('plain string failure');
    });
  });

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  describe('telemetry', () => {
    it('emits mutation_handler_started before processing', async () => {
      setRouterClient(makeStubRouterClient());
      await applyMutation(makeRoute(), makeContext(), { type: 'reverse_route' });
      expect(handlerEvents()[0]).toBe('mutation_handler_started');
    });

    it('records is_compositional: false for a direct applyMutation call', async () => {
      setRouterClient(makeStubRouterClient());
      await applyMutation(makeRoute(), makeContext(), { type: 'reverse_route' });
      expect(eventProps('mutation_handler_started')).toMatchObject({
        mutation_type: 'reverse_route',
        is_compositional: false,
      });
    });

    it('emits mutation_handler_succeeded on success', async () => {
      setRouterClient(makeStubRouterClient());
      await applyMutation(makeRoute(), makeContext(), { type: 'reverse_route' });
      expect(handlerEvents()).toContain('mutation_handler_succeeded');
      expect(eventProps('mutation_handler_succeeded')).toMatchObject({
        mutation_type: 'reverse_route',
        provider_used: 'stadia',
        cache_hit: false,
      });
    });

    it('emits mutation_handler_failed with failure_origin: constraint_builder', async () => {
      setRouterClient(makeStubRouterClient());
      await applyMutation(makeRoute(), makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      });
      expect(handlerEvents()).toContain('mutation_handler_failed');
      expect(eventProps('mutation_handler_failed')).toMatchObject({
        mutation_type: 'optimize_for',
        failure_kind: 'mutation_not_supported',
        failure_origin: 'constraint_builder',
      });
    });

    it('emits mutation_handler_failed with failure_origin: router', async () => {
      setRouterClient(
        makeStubRouterClient((p) => {
          p.stadia.failWith('network_error');
          p.brouter.failWith('network_error');
          p.mapbox.failWith('network_error');
        }),
      );
      await applyMutation(makeRoute(), makeContext(), { type: 'reverse_route' });
      expect(eventProps('mutation_handler_failed')).toMatchObject({
        mutation_type: 'reverse_route',
        failure_kind: 'router_unavailable',
        failure_origin: 'router',
      });
    });

    it('does not emit mutation_handler_succeeded on a failed mutation', async () => {
      setRouterClient(makeStubRouterClient());
      await applyMutation(makeRoute(), makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      });
      expect(handlerEvents()).not.toContain('mutation_handler_succeeded');
    });
  });

  // -------------------------------------------------------------------------
  // Contract
  // -------------------------------------------------------------------------

  describe('contract', () => {
    it('returns a structurally valid ExecutorResult on success', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'reverse_route',
      });
      expect(result).toHaveProperty('ok', true);
      if (!result.ok) return;
      expect(result.route).toHaveProperty('geometry');
      expect(result.route).toHaveProperty('stats');
      expect(result.metadata).toHaveProperty('duration_ms');
    });

    it('returns a structurally valid ExecutorResult on failure', async () => {
      setRouterClient(makeStubRouterClient());
      const result = await applyMutation(makeRoute(), makeContext(), {
        type: 'optimize_for',
        criterion: 'scenery',
      });
      expect(result).toHaveProperty('ok', false);
      if (result.ok) return;
      expect(result.reason).toHaveProperty('kind');
    });

    it('never throws — every mutation type resolves to an ExecutorResult', async () => {
      setRouterClient(makeStubRouterClient());
      const mutations: Mutation[] = [
        { type: 'reverse_route' },
        { type: 'reduce_climbing', magnitude: 'small' },
        { type: 'extend_distance', delta_km: 5 },
        { type: 'change_climb_character', target: 'flat' },
        { type: 'anchor_at_poi', poi_query: 'water' },
        { type: 'avoid_segment_by_property', property: 'busy_road' },
        { type: 'optimize_for', criterion: 'training_value' },
      ];
      for (const mutation of mutations) {
        const result = await applyMutation(makeRoute(), makeContext(), mutation);
        expect(typeof result.ok).toBe('boolean');
      }
    });
  });
});
