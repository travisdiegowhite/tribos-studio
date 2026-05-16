/**
 * Tests for `Executor.generate()`.
 *
 * Covers:
 * - Single-route path (count: 1) — distance, duration, like_ride_id paths
 * - Alternatives path (count: 3) — three distinct constraints, parallel
 *   solve, partial-failure handling
 * - Failure shapes (`context_missing`, `router_unavailable`, defensive
 *   never-throws)
 * - Telemetry — `executor_*` events fire with correct properties
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../../utils/routeBuilderTelemetry';
import { setRouterClient } from '../../../RouterClient';
import type {
  GenerationConstraints,
  RideSummary,
  RouteConstraint,
} from '../../types';
import { Executor } from '../Executor';
import {
  makeContext,
  makeRoute,
  makeStubRouterClient,
  makeThrowingRouterClient,
  StubProvider,
} from './helpers';

const mockTrack = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

function executorEvents(): string[] {
  return mockTrack.mock.calls
    .map((c) => c[0] as string)
    .filter((name) => name.startsWith('executor_'));
}

function eventProps(name: string): Record<string, unknown> | undefined {
  const call = mockTrack.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, unknown> | undefined;
}

/**
 * Capture the constraint passed to `stadia.solve` so tests can assert
 * on the translation from GenerationConstraints to RouteConstraint.
 */
function lastSolveConstraint(stadia: StubProvider): RouteConstraint {
  const call = stadia.solve.mock.calls[stadia.solve.mock.calls.length - 1];
  return call[0] as RouteConstraint;
}

describe('Executor.generate (count: 1)', () => {
  beforeEach(() => {
    mockTrack.mockReset();
  });
  afterEach(() => {
    setRouterClient(null);
    vi.restoreAllMocks();
  });

  it('returns a single ExecutorResult (not an array) when count is omitted', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const result = await executor.generate(makeContext(), {
      goal: 'endurance',
      distance_km: 30,
    });
    expect(Array.isArray(result)).toBe(false);
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('explicit count: 1 also returns a single result', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const result = await executor.generate(makeContext(), {
      goal: 'endurance',
      distance_km: 30,
    }, 1);
    expect(Array.isArray(result)).toBe(false);
  });

  it('passes distance_km straight through to the RouteConstraint', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute({ distance_km: 30 }));
    }));

    const executor = new Executor();
    await executor.generate(makeContext(), {
      goal: 'endurance',
      distance_km: 30,
    });

    const constraint = lastSolveConstraint(stadia);
    expect(constraint.target_distance_km).toBe(30);
    expect(constraint.shape).toBe('loop');
    expect(constraint.profile).toBe('road');
  });

  it('converts duration_minutes to distance via speed_profile', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(
      makeContext({ speed_profile: { flat_kph: 25 } }),
      { duration_minutes: 60 },
    );

    const constraint = lastSolveConstraint(stadia);
    expect(constraint.target_distance_km).toBeCloseTo(25, 5);
  });

  it('falls back to default flat_kph when speed_profile is absent', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(
      makeContext({ speed_profile: undefined }),
      { duration_minutes: 120 },
    );

    const constraint = lastSolveConstraint(stadia);
    // 120 min / 60 * 25 kph = 50 km
    expect(constraint.target_distance_km).toBeCloseTo(50, 5);
  });

  it('distance_km takes precedence over duration_minutes', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(makeContext(), {
      distance_km: 42,
      duration_minutes: 60,
    });
    expect(lastSolveConstraint(stadia).target_distance_km).toBe(42);
  });

  it('uses recent_rides waypoints when like_ride_id matches', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const referenced: RideSummary = {
      id: 'ride-42',
      waypoints: [
        [-105.05, 40.05],
        [-105.10, 40.08],
        [-105.07, 40.12],
        [-105.05, 40.05],
      ],
    };
    const executor = new Executor();
    await executor.generate(
      makeContext({ recent_rides: [referenced] }),
      { like_ride_id: 'ride-42', distance_km: 25 },
    );

    expect(lastSolveConstraint(stadia).waypoints).toEqual(referenced.waypoints);
  });

  it('falls through to a radial loop seed when like_ride_id is missing from recent_rides', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(
      makeContext({ recent_rides: [{ id: 'other-id', waypoints: [[-105, 40], [-104, 41]] }] }),
      { like_ride_id: 'missing-id', distance_km: 25 },
    );

    const constraint = lastSolveConstraint(stadia);
    // Radial loop produces 5 points (start + 3 legs + return-to-start).
    expect(constraint.waypoints.length).toBe(5);
    expect(constraint.waypoints[0]).toEqual([-105.05, 40.05]);
    expect(constraint.waypoints[4]).toEqual([-105.05, 40.05]);
  });

  it('falls through to radial loop when recent_rides is undefined', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(makeContext(), {
      like_ride_id: 'ride-42',
      distance_km: 25,
    });

    const constraint = lastSolveConstraint(stadia);
    expect(constraint.waypoints.length).toBe(5);
  });

  it('returns context_missing when no start_coord is available', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const result = await executor.generate(
      makeContext({ start_coord: undefined }),
      { distance_km: 20 },
    );
    expect(result).toEqual({
      ok: false,
      reason: { kind: 'context_missing', required_field: 'start_coord' },
    });
  });

  it('uses constraints.start_coord even when context lacks one', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(
      makeContext({ start_coord: undefined }),
      { distance_km: 20, start_coord: [-122.4, 37.8] },
    );

    expect(lastSolveConstraint(stadia).waypoints[0]).toEqual([-122.4, 37.8]);
  });

  it('passes elevation_gain_m and surface_mix into the RouteConstraint', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWith(makeRoute());
    }));

    const constraints: GenerationConstraints = {
      distance_km: 30,
      elevation_gain_m: 400,
      surface_mix: { road: 0.5, gravel: 0.5 },
    };
    const executor = new Executor();
    await executor.generate(makeContext(), constraints);

    const constraint = lastSolveConstraint(stadia);
    expect(constraint.target_elevation_gain_m).toBe(400);
    expect(constraint.surface_preference).toEqual({ road: 0.5, gravel: 0.5 });
  });

  it('inherits profile from context (gravel)', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.brouter.succeedWith(makeRoute());
    }));

    const executor = new Executor();
    await executor.generate(
      makeContext({ profile: 'gravel' }),
      { distance_km: 20 },
    );
    // Gravel registry order is brouter-first; stadia isn't called.
    expect(stadia.solve).not.toHaveBeenCalled();
  });

  it('emits executor_generate_called and executor_generate_succeeded on success', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    await executor.generate(makeContext(), { distance_km: 30 });

    expect(executorEvents()).toEqual([
      'executor_generate_called',
      'executor_generate_succeeded',
    ]);
    expect(eventProps('executor_generate_called')).toMatchObject({
      count: 1,
      has_like_ride_id: false,
      target_distance_km: 30,
    });
    expect(eventProps('executor_generate_succeeded')).toMatchObject({
      count: 1,
      provider_used: 'stadia',
    });
  });

  it('emits executor_generate_failed on context_missing', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    await executor.generate(makeContext({ start_coord: undefined }), { distance_km: 20 });

    expect(executorEvents()).toContain('executor_generate_failed');
    expect(eventProps('executor_generate_failed')).toMatchObject({
      count: 1,
      failure_kind: 'context_missing',
    });
  });

  it('emits executor_generate_failed when all providers fail', async () => {
    setRouterClient(makeStubRouterClient((providers) => {
      providers.stadia.failWith();
      providers.brouter.failWith();
      providers.mapbox.failWith();
    }));
    const executor = new Executor();
    const result = await executor.generate(makeContext(), { distance_km: 30 });

    expect(result).toMatchObject({
      ok: false,
      reason: { kind: 'router_unavailable' },
    });
    expect(eventProps('executor_generate_failed')).toMatchObject({
      count: 1,
      failure_kind: 'router_unavailable',
    });
  });

  it('never throws even if RouterClient.solve throws', async () => {
    setRouterClient(makeThrowingRouterClient(new Error('kaboom')));
    const executor = new Executor();
    const result = await executor.generate(makeContext(), { distance_km: 20 });
    expect(result).toMatchObject({
      ok: false,
      reason: { kind: 'internal_error' },
    });
    if ('reason' in result && result.reason.kind === 'internal_error') {
      expect(result.reason.message).toContain('kaboom');
    }
  });

  it('reports has_like_ride_id correctly in telemetry', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    await executor.generate(
      makeContext({ recent_rides: [{ id: 'r', waypoints: [[-105, 40], [-104, 41]] }] }),
      { like_ride_id: 'r', distance_km: 20 },
    );
    expect(eventProps('executor_generate_called')).toMatchObject({
      has_like_ride_id: true,
    });
  });
});

describe('Executor.generate (count: 3)', () => {
  beforeEach(() => {
    mockTrack.mockReset();
  });
  afterEach(() => {
    setRouterClient(null);
    vi.restoreAllMocks();
  });

  it('returns an array of exactly three results', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const results = await executor.generate(makeContext(), { distance_km: 30 }, 3);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
  });

  it('issues three RouterClient.solve calls in parallel with distinct constraints', async () => {
    let stadia!: StubProvider;
    setRouterClient(makeStubRouterClient((providers) => {
      stadia = providers.stadia;
      providers.stadia.succeedWithSequence([
        makeRoute({ distance_km: 28 }),
        makeRoute({ distance_km: 30 }),
        makeRoute({ distance_km: 32 }),
      ]);
    }));

    const executor = new Executor();
    await executor.generate(makeContext(), { distance_km: 30 }, 3);

    expect(stadia.solve).toHaveBeenCalledTimes(3);
    const constraints = stadia.solve.mock.calls.map(
      (call) => call[0] as RouteConstraint,
    );
    const midpoints = constraints.map((c) => c.waypoints[1]);
    // All three midpoints should differ from one another.
    expect(midpoints[0]).not.toEqual(midpoints[1]);
    expect(midpoints[1]).not.toEqual(midpoints[2]);
    expect(midpoints[0]).not.toEqual(midpoints[2]);
  });

  it('all three results carry the success shape when every provider succeeds', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const results = await executor.generate(makeContext(), { distance_km: 30 }, 3);
    expect(Array.isArray(results)).toBe(true);
    for (const r of results as Awaited<ReturnType<typeof executor.generate>>[]) {
      expect((r as { ok: boolean }).ok).toBe(true);
    }
  });

  it('returns failure entries inline (does not throw) when some solve calls fail', async () => {
    setRouterClient(makeStubRouterClient((providers) => {
      // First two succeed, third fails: stadia is the only provider
      // exercised; brouter/mapbox fall through after stadia fails on
      // the third call.
      providers.stadia.solve
        .mockResolvedValueOnce({ ok: true, route: makeRoute({ distance_km: 28 }), duration_ms: 50 })
        .mockResolvedValueOnce({ ok: true, route: makeRoute({ distance_km: 30 }), duration_ms: 50 })
        .mockResolvedValueOnce({
          ok: false,
          reason: { kind: 'no_route_found', message: 'no route' },
          duration_ms: 50,
        });
      providers.brouter.failWith();
      providers.mapbox.failWith();
    }));

    const executor = new Executor();
    const results = (await executor.generate(makeContext(), { distance_km: 30 }, 3)) as Array<
      { ok: boolean }
    >;
    expect(results.length).toBe(3);
    expect(results.filter((r) => r.ok).length).toBe(2);
    expect(results.filter((r) => !r.ok).length).toBe(1);
  });

  it('emits executor_generate_partial when some succeed and some fail', async () => {
    setRouterClient(makeStubRouterClient((providers) => {
      providers.stadia.solve
        .mockResolvedValueOnce({ ok: true, route: makeRoute(), duration_ms: 50 })
        .mockResolvedValueOnce({ ok: true, route: makeRoute(), duration_ms: 50 })
        .mockResolvedValueOnce({
          ok: false,
          reason: { kind: 'no_route_found', message: 'no route' },
          duration_ms: 50,
        });
      providers.brouter.failWith();
      providers.mapbox.failWith();
    }));

    const executor = new Executor();
    await executor.generate(makeContext(), { distance_km: 30 }, 3);

    expect(executorEvents()).toContain('executor_generate_partial');
    expect(eventProps('executor_generate_partial')).toMatchObject({
      successful_count: 2,
      failed_count: 1,
    });
  });

  it('emits executor_generate_failed when every alternative fails', async () => {
    setRouterClient(makeStubRouterClient((providers) => {
      providers.stadia.failWith();
      providers.brouter.failWith();
      providers.mapbox.failWith();
    }));
    const executor = new Executor();
    const results = (await executor.generate(makeContext(), { distance_km: 30 }, 3)) as Array<
      { ok: boolean }
    >;
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
    expect(executorEvents()).toContain('executor_generate_failed');
    expect(eventProps('executor_generate_failed')).toMatchObject({
      count: 3,
      failure_kind: 'router_unavailable',
    });
  });

  it('returns three identical failures when constraint construction fails', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    const results = (await executor.generate(
      makeContext({ start_coord: undefined }),
      { distance_km: 20 },
      3,
    )) as Array<{ ok: boolean; reason?: { kind: string } }>;
    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.reason?.kind).toBe('context_missing');
    }
  });

  it('never throws even if one RouterClient.solve throws', async () => {
    let callCount = 0;
    setRouterClient(makeStubRouterClient((providers) => {
      providers.stadia.solve.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 2) throw new Error('boom');
        return { ok: true, route: makeRoute(), duration_ms: 50 };
      });
    }));

    const executor = new Executor();
    const results = (await executor.generate(makeContext(), { distance_km: 30 }, 3)) as Array<
      { ok: boolean; reason?: { kind: string; message?: string } }
    >;
    expect(results.length).toBe(3);
    const throwing = results.find((r) => !r.ok);
    expect(throwing?.reason?.kind).toBe('internal_error');
    expect(throwing?.reason?.message).toContain('boom');
  });

  it('reports the most-used provider in executor_generate_succeeded', async () => {
    setRouterClient(makeStubRouterClient());
    const executor = new Executor();
    await executor.generate(makeContext(), { distance_km: 30 }, 3);
    expect(eventProps('executor_generate_succeeded')).toMatchObject({
      count: 3,
      provider_used: 'stadia',
    });
  });
});
