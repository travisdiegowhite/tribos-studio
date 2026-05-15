import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ConstraintBuilder and the metrics helper both call `trackRouteBuilder`;
// mock it so the suite can assert compositional telemetry in isolation.
vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../../utils/routeBuilderTelemetry';
import { setRouterClient } from '../../../RouterClient';
import type { ExecutorResult, Mutation } from '../../types';
import { applyMutation, applyMutations } from '../MutationHandlers';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  makeSequencedRouterClient,
  okResult,
} from './helpers';

const mockTrack = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

function eventProps(name: string): Record<string, unknown> | undefined {
  const call = mockTrack.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, unknown> | undefined;
}

function eventNames(): string[] {
  return mockTrack.mock.calls.map((c) => c[0] as string);
}

const ROUTER_FAILURE: ExecutorResult = {
  ok: false,
  reason: { kind: 'router_unavailable', providers_tried: ['stadia', 'brouter', 'mapbox'] },
};

const reduceClimbing: Mutation = { type: 'reduce_climbing', magnitude: 'small' };

describe('applyMutations', () => {
  beforeEach(() => {
    mockTrack.mockReset();
  });
  afterEach(() => {
    setRouterClient(null);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Empty / single
  // -------------------------------------------------------------------------

  it('returns the original route on an empty mutation array', async () => {
    const client = makeFakeRouterClient(okResult(makeRoute()));
    setRouterClient(client);
    const route = makeRoute({ distance_km: 10 });

    const result = await applyMutations(route, makeContext(), []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Same object reference — nothing was applied.
    expect(result.route).toBe(route);
    expect(result.metadata).toEqual({
      provider_used: null,
      duration_ms: 0,
      cache_hit: false,
      attempts_tried: 0,
      constraint_relaxations: [],
    });
    // RouterClient was never touched.
    expect((client.solve as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('applies a single mutation identically to applyMutation', async () => {
    const routerRoute = makeRoute({ distance_km: 18 });
    setRouterClient(makeFakeRouterClient(okResult(routerRoute)));
    const route = makeRoute({ distance_km: 10 });

    const composed = await applyMutations(route, makeContext(), [reduceClimbing]);
    const single = await applyMutation(route, makeContext(), reduceClimbing);

    expect(composed.ok).toBe(true);
    expect(single.ok).toBe(true);
    if (!composed.ok || !single.ok) return;
    expect(composed.route).toEqual(single.route);
  });

  // -------------------------------------------------------------------------
  // Sequential application
  // -------------------------------------------------------------------------

  it('applies two mutations sequentially: the final route is m2 output', async () => {
    const routeAfterM1 = makeRoute({ distance_km: 20, geometryStartLng: -110 });
    const routeAfterM2 = makeRoute({ distance_km: 30, geometryStartLng: -120 });
    setRouterClient(
      makeSequencedRouterClient([okResult(routeAfterM1), okResult(routeAfterM2)]),
    );

    const result = await applyMutations(makeRoute({ distance_km: 10 }), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route).toBe(routeAfterM2);
  });

  it('threads m1 output as m2 input', async () => {
    // reduce_climbing maps route.waypoints → constraint.waypoints, so the
    // waypoints in m2's constraint reveal which route m2 was built from.
    const routeAfterM1 = makeRoute({ distance_km: 20, geometryStartLng: -110 });
    const client = makeSequencedRouterClient([
      okResult(routeAfterM1),
      okResult(makeRoute({ distance_km: 30 })),
    ]);
    setRouterClient(client);

    await applyMutations(makeRoute({ distance_km: 10, geometryStartLng: -105 }), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);

    const solve = client.solve as ReturnType<typeof vi.fn>;
    expect(solve).toHaveBeenCalledTimes(2);
    // m2's constraint must carry routeAfterM1's waypoint coordinates.
    const secondConstraint = solve.mock.calls[1][0] as { waypoints: unknown };
    expect(secondConstraint.waypoints).toEqual(
      routeAfterM1.waypoints.map((wp) => wp.coordinate),
    );
  });

  it('succeeds and returns the unchanged route when a mutation does not change it', async () => {
    // A mutation whose router result echoes the input route still
    // succeeds — the unchanged route comes back as `route`, not `partial`.
    const route = makeRoute({ distance_km: 10 });
    setRouterClient(makeFakeRouterClient(okResult(route)));

    const result = await applyMutations(route, makeContext(), [reduceClimbing]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route).toBe(route);
  });

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  it('rolls back to the original route when m2 fails after m1 succeeds', async () => {
    const routeAfterM1 = makeRoute({ distance_km: 20, geometryStartLng: -110 });
    setRouterClient(
      makeSequencedRouterClient([okResult(routeAfterM1), ROUTER_FAILURE]),
    );
    const original = makeRoute({ distance_km: 10 });

    const result = await applyMutations(original, makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('router_unavailable');
    expect(result.partial).toBe(original);
  });

  it('returns partial as the original route, NOT the m1-output route', async () => {
    const routeAfterM1 = makeRoute({ distance_km: 20, geometryStartLng: -110 });
    setRouterClient(
      makeSequencedRouterClient([okResult(routeAfterM1), ROUTER_FAILURE]),
    );
    const original = makeRoute({ distance_km: 10, geometryStartLng: -105 });

    const result = await applyMutations(original, makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial).toBeDefined();
    expect(result.partial?.geometry).toEqual(original.geometry);
    expect(result.partial?.geometry).not.toEqual(routeAfterM1.geometry);
  });

  it('does not apply m3 when m2 fails', async () => {
    // Only two results scripted; if m3 were attempted, solve would be
    // called a third time and return undefined.
    const client = makeSequencedRouterClient([
      okResult(makeRoute({ distance_km: 20 })),
      ROUTER_FAILURE,
    ]);
    setRouterClient(client);

    const result = await applyMutations(makeRoute({ distance_km: 10 }), makeContext(), [
      reduceClimbing,
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(false);
    expect(client.solve as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it('rolls back when the first mutation fails at the ConstraintBuilder layer', async () => {
    setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
    const original = makeRoute({ distance_km: 10 });

    const result = await applyMutations(original, makeContext(), [
      { type: 'optimize_for', criterion: 'scenery' },
      reduceClimbing,
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('mutation_not_supported');
    expect(result.partial).toBe(original);
  });

  // -------------------------------------------------------------------------
  // Metadata aggregation
  // -------------------------------------------------------------------------

  it('aggregates duration_ms across all mutations', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { duration_ms: 100 }),
        okResult(makeRoute(), { duration_ms: 250 }),
        okResult(makeRoute(), { duration_ms: 75 }),
      ]),
    );

    const result = await applyMutations(makeRoute(), makeContext(), [
      reduceClimbing,
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.duration_ms).toBe(425);
  });

  it('sums attempts_tried and uses the last provider_used', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { provider_used: 'stadia', attempts_tried: 1 }),
        okResult(makeRoute(), { provider_used: 'brouter', attempts_tried: 2 }),
      ]),
    );

    const result = await applyMutations(makeRoute(), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.attempts_tried).toBe(3);
    expect(result.metadata.provider_used).toBe('brouter');
  });

  it('reports cache_hit true only when every mutation was cached', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { cache_hit: true }),
        okResult(makeRoute(), { cache_hit: true }),
      ]),
    );
    const allCached = await applyMutations(makeRoute(), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);
    expect(allCached.ok).toBe(true);
    if (allCached.ok) {
      expect(allCached.metadata.cache_hit).toBe(true);
    }
  });

  it('reports cache_hit false when any mutation was a cache miss', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { cache_hit: true }),
        okResult(makeRoute(), { cache_hit: false }),
      ]),
    );
    const mixed = await applyMutations(makeRoute(), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);
    expect(mixed.ok).toBe(true);
    if (mixed.ok) {
      expect(mixed.metadata.cache_hit).toBe(false);
    }
  });

  it('accumulates constraint_relaxations across mutations', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { constraint_relaxations: ['increased_search_radius'] }),
        okResult(makeRoute(), { constraint_relaxations: ['relaxed_traffic_pref'] }),
      ]),
    );
    const result = await applyMutations(makeRoute(), makeContext(), [
      reduceClimbing,
      reduceClimbing,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.constraint_relaxations).toEqual([
      'increased_search_radius',
      'relaxed_traffic_pref',
    ]);
  });

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  it('emits compositional_started with the mutation_count', async () => {
    setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
    await applyMutations(makeRoute(), makeContext(), [reduceClimbing, reduceClimbing]);
    expect(eventProps('mutation_handler_compositional_started')).toMatchObject({
      mutation_count: 2,
    });
  });

  it('emits compositional_succeeded on full success', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { duration_ms: 100 }),
        okResult(makeRoute(), { duration_ms: 200 }),
      ]),
    );
    await applyMutations(makeRoute(), makeContext(), [reduceClimbing, reduceClimbing]);
    expect(eventProps('mutation_handler_compositional_succeeded')).toMatchObject({
      mutation_count: 2,
      total_duration_ms: 300,
    });
    expect(eventNames()).not.toContain('mutation_handler_compositional_rolled_back');
  });

  it('emits compositional_rolled_back with failed_at_index on partial failure', async () => {
    setRouterClient(
      makeSequencedRouterClient([
        okResult(makeRoute(), { duration_ms: 100 }),
        ROUTER_FAILURE,
      ]),
    );
    await applyMutations(makeRoute(), makeContext(), [reduceClimbing, reduceClimbing]);
    expect(eventProps('mutation_handler_compositional_rolled_back')).toMatchObject({
      mutation_count: 2,
      failed_at_index: 1,
      failure_kind: 'router_unavailable',
      partial_progress_ms: 100,
    });
    expect(eventNames()).not.toContain('mutation_handler_compositional_succeeded');
  });

  it('marks inner applyMutation calls as compositional', async () => {
    setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
    await applyMutations(makeRoute(), makeContext(), [reduceClimbing]);
    const startedCall = mockTrack.mock.calls.find(
      (c) => c[0] === 'mutation_handler_started',
    );
    expect(startedCall?.[1]).toMatchObject({ is_compositional: true });
  });
});
