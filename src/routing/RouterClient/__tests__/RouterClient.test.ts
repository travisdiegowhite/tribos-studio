import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouterClient } from '../RouterClient';
import type {
  ProviderName,
  ProviderResult,
  RouteConstraint,
  RouteContext,
  RouteProvider,
  RouteSnapshot,
  RoutingProfile,
} from '../types';

// Mock the telemetry helper so tests can assert event emission without
// hitting PostHog.
vi.mock('../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../utils/routeBuilderTelemetry';

const mockTrack = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRoute(distance_km: number): RouteSnapshot {
  const coords: [number, number][] = Array.from({ length: 11 }, (_, i) => [
    -105.1 + i * 0.01,
    40 + i * 0.01,
  ]);
  return {
    geometry: coords,
    waypoints: [
      { coordinate: [-105.1, 40] },
      { coordinate: [-105.0, 40.1] },
    ],
    stats: {
      distance_km,
      elevation_gain_m: 100,
      elevation_loss_m: 100,
      duration_s: 1800,
    },
  };
}

class StubProvider implements RouteProvider {
  readonly solve = vi.fn();
  readonly connect = vi.fn();
  private readonly supportSet: Set<RoutingProfile>;

  constructor(
    public readonly name: ProviderName,
    supports: RoutingProfile[] = ['road', 'gravel', 'mtb', 'commute'],
  ) {
    this.supportSet = new Set(supports);
  }

  supports(profile: RoutingProfile): boolean {
    return this.supportSet.has(profile);
  }

  succeedWith(route: RouteSnapshot, duration_ms = 100): void {
    this.solve.mockResolvedValue({
      ok: true,
      route,
      duration_ms,
    } satisfies ProviderResult);
    this.connect.mockResolvedValue({
      ok: true,
      route,
      duration_ms,
    } satisfies ProviderResult);
  }

  failWith(kind: 'network_error' | 'http_error' | 'no_route_found' = 'network_error'): void {
    let reason: ProviderResult extends infer P
      ? P extends { ok: false; reason: infer R }
        ? R
        : never
      : never;
    if (kind === 'http_error') {
      reason = { kind: 'http_error', status: 500, message: 'boom' } as never;
    } else if (kind === 'no_route_found') {
      reason = { kind: 'no_route_found', message: 'no route' } as never;
    } else {
      reason = { kind: 'network_error', message: 'network down' } as never;
    }
    this.solve.mockResolvedValue({ ok: false, reason, duration_ms: 50 });
    this.connect.mockResolvedValue({ ok: false, reason, duration_ms: 50 });
  }
}

const baseConstraint: RouteConstraint = {
  waypoints: [
    [-105.1, 40.0],
    [-105.0, 40.1],
  ],
  profile: 'road',
  shape: 'point_to_point',
};

const baseContext: RouteContext = {
  training_goal: 'endurance',
  mapbox_token: 'mock-token',
};

function eventNames(): string[] {
  return mockTrack.mock.calls.map((c) => c[0]);
}

describe('RouterClient', () => {
  let stadia: StubProvider;
  let brouter: StubProvider;
  let mapbox: StubProvider;
  let client: RouterClient;

  beforeEach(() => {
    mockTrack.mockReset();
    stadia = new StubProvider('stadia');
    brouter = new StubProvider('brouter');
    mapbox = new StubProvider('mapbox');
    client = new RouterClient({
      providers: { stadia, brouter, mapbox },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Provider selection by profile
  // -----------------------------------------------------------------------

  describe('provider selection by profile', () => {
    it('road profile tries stadia first', async () => {
      stadia.succeedWith(makeRoute(10));
      brouter.succeedWith(makeRoute(11));
      const result = await client.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('stadia');
      expect(stadia.solve).toHaveBeenCalledTimes(1);
      expect(brouter.solve).not.toHaveBeenCalled();
    });

    it('gravel profile tries brouter first', async () => {
      stadia.succeedWith(makeRoute(10));
      brouter.succeedWith(makeRoute(11));
      const result = await client.solve(
        { ...baseConstraint, profile: 'gravel' },
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('brouter');
    });

    it('mtb profile tries brouter first', async () => {
      stadia.succeedWith(makeRoute(10));
      brouter.succeedWith(makeRoute(11));
      const result = await client.solve(
        { ...baseConstraint, profile: 'mtb' },
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('brouter');
    });

    it('commute profile tries stadia first', async () => {
      stadia.succeedWith(makeRoute(10));
      brouter.succeedWith(makeRoute(11));
      const result = await client.solve(
        { ...baseConstraint, profile: 'commute' },
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('stadia');
    });

    it('normalises legacy "mountain" to mtb (gravel ordering)', async () => {
      stadia.succeedWith(makeRoute(10));
      brouter.succeedWith(makeRoute(11));
      const result = await client.solve(
        { ...baseConstraint, profile: 'mountain' as 'mtb' },
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('brouter');
    });
  });

  // -----------------------------------------------------------------------
  // Fallback chain
  // -----------------------------------------------------------------------

  describe('fallback chain', () => {
    it('falls through to the next provider on failure', async () => {
      stadia.failWith('http_error');
      brouter.succeedWith(makeRoute(10));
      const result = await client.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('brouter');
      expect(result.metadata.attempts_tried).toBe(2);
    });

    it('returns router_unavailable when all providers fail', async () => {
      stadia.failWith('network_error');
      brouter.failWith('network_error');
      mapbox.failWith('network_error');
      const result = await client.solve(baseConstraint, baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('router_unavailable');
      if (result.reason.kind !== 'router_unavailable') return;
      expect(result.reason.providers_tried).toEqual(['stadia', 'brouter', 'mapbox']);
    });

    it('skips providers that do not support the profile', async () => {
      // Make stadia not support gravel.
      const limitedStadia = new StubProvider('stadia', ['road', 'commute']);
      brouter.succeedWith(makeRoute(10));
      const limited = new RouterClient({
        providers: { stadia: limitedStadia, brouter, mapbox },
      });
      const result = await limited.solve(
        { ...baseConstraint, profile: 'gravel' },
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Gravel ordering is [brouter, stadia, mapbox]. brouter succeeds first.
      expect(result.metadata.provider_used).toBe('brouter');
      expect(limitedStadia.solve).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cache
  // -----------------------------------------------------------------------

  describe('cache', () => {
    it('returns a cached result for the same constraint', async () => {
      stadia.succeedWith(makeRoute(10));
      const r1 = await client.solve(baseConstraint, baseContext);
      const r2 = await client.solve(baseConstraint, baseContext);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(stadia.solve).toHaveBeenCalledTimes(1);
      if (!r2.ok) return;
      expect(r2.metadata.cache_hit).toBe(true);
    });

    it('cache hit emits the cache_hit telemetry event', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, baseContext);
      mockTrack.mockClear();
      await client.solve(baseConstraint, baseContext);
      expect(eventNames()).toContain('routerclient_solve_cache_hit');
    });

    it('a different constraint misses the cache', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, baseContext);
      await client.solve(
        { ...baseConstraint, target_distance_km: 50 },
        baseContext,
      );
      expect(stadia.solve).toHaveBeenCalledTimes(2);
    });

    it('clearCache() forces re-fetch', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, baseContext);
      client.clearCache();
      await client.solve(baseConstraint, baseContext);
      expect(stadia.solve).toHaveBeenCalledTimes(2);
    });

    it('same constraint + different training_goal misses the cache (T2.6.3)', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, { ...baseContext, training_goal: 'endurance' });
      await client.solve(baseConstraint, { ...baseContext, training_goal: 'intervals' });
      expect(stadia.solve).toHaveBeenCalledTimes(2);
    });

    it('same constraint + different user_speed_kph misses the cache (T2.6.3)', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, { ...baseContext, user_speed_kph: 22 });
      await client.solve(baseConstraint, { ...baseContext, user_speed_kph: 28 });
      expect(stadia.solve).toHaveBeenCalledTimes(2);
    });

    it('same constraint + different preferences misses the cache (T2.6.3)', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, {
        ...baseContext,
        preferences: { avoidHills: true },
      });
      await client.solve(baseConstraint, {
        ...baseContext,
        preferences: { avoidHills: false },
      });
      expect(stadia.solve).toHaveBeenCalledTimes(2);
    });

    it('same constraint + identical context still hits cache', async () => {
      stadia.succeedWith(makeRoute(10));
      const ctx = { ...baseContext, training_goal: 'tempo', user_speed_kph: 25 };
      await client.solve(baseConstraint, ctx);
      const r2 = await client.solve(baseConstraint, ctx);
      expect(stadia.solve).toHaveBeenCalledTimes(1);
      if (!r2.ok) throw new Error('expected ok');
      expect(r2.metadata.cache_hit).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Dedup
  // -----------------------------------------------------------------------

  describe('dedup', () => {
    it('two simultaneous identical solves invoke the provider once', async () => {
      let resolve: (v: ProviderResult) => void = () => {};
      stadia.solve.mockImplementation(
        () => new Promise<ProviderResult>((r) => (resolve = r)),
      );

      const p1 = client.solve(baseConstraint, baseContext);
      const p2 = client.solve(baseConstraint, baseContext);

      // Provider was invoked exactly once.
      expect(stadia.solve).toHaveBeenCalledTimes(1);

      // Resolve the in-flight provider call.
      resolve({ ok: true, route: makeRoute(10), duration_ms: 100 });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      // Same underlying result.
      if (r1.ok && r2.ok) {
        expect(r1.route).toBe(r2.route);
      }
    });

    it('emits dedup_joined event on the joined call', async () => {
      let resolve: (v: ProviderResult) => void = () => {};
      stadia.solve.mockImplementation(
        () => new Promise<ProviderResult>((r) => (resolve = r)),
      );

      const p1 = client.solve(baseConstraint, baseContext);
      const p2 = client.solve(baseConstraint, baseContext);

      resolve({ ok: true, route: makeRoute(10), duration_ms: 100 });
      await Promise.all([p1, p2]);

      expect(eventNames()).toContain('routerclient_solve_dedup_joined');
    });
  });

  // -----------------------------------------------------------------------
  // Telemetry
  // -----------------------------------------------------------------------

  describe('telemetry', () => {
    it('emits solve_called, provider_attempted, provider_succeeded, solve_completed on the happy path', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, baseContext);
      const names = eventNames();
      expect(names).toContain('routerclient_solve_called');
      expect(names).toContain('routerclient_provider_attempted');
      expect(names).toContain('routerclient_provider_succeeded');
      expect(names).toContain('routerclient_solve_completed');
    });

    it('emits provider_failed for each failed provider', async () => {
      stadia.failWith('network_error');
      brouter.succeedWith(makeRoute(10));
      await client.solve(baseConstraint, baseContext);

      const failedCount = eventNames().filter(
        (n) => n === 'routerclient_provider_failed',
      ).length;
      expect(failedCount).toBe(1);
    });

    it('solve_completed reports provider_used: null when all fail', async () => {
      stadia.failWith('network_error');
      brouter.failWith('network_error');
      mapbox.failWith('network_error');
      await client.solve(baseConstraint, baseContext);

      const completedCall = mockTrack.mock.calls.find(
        (c) => c[0] === 'routerclient_solve_completed',
      );
      expect(completedCall).toBeDefined();
      if (!completedCall) return;
      const props = completedCall[1] as Record<string, unknown>;
      expect(props.provider_used).toBeNull();
      expect(props.attempts_tried).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // connect()
  // -----------------------------------------------------------------------

  describe('connect', () => {
    it('rejects with constraint_infeasible for <2 waypoints', async () => {
      const result = await client.connect([[-105, 40]], baseContext);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('constraint_infeasible');
    });

    it('tries providers in road ordering by default', async () => {
      stadia.succeedWith(makeRoute(10));
      const result = await client.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('stadia');
    });

    it('caches connect results separately from solve', async () => {
      stadia.succeedWith(makeRoute(10));
      await client.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      // A solve with the same waypoints does NOT collide with the
      // connect cache — different cache keys.
      const constraint: RouteConstraint = {
        waypoints: [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        profile: 'road',
        shape: 'point_to_point',
      };
      await client.solve(constraint, baseContext);
      expect(stadia.solve).toHaveBeenCalledTimes(1);
      expect(stadia.connect).toHaveBeenCalledTimes(1);
    });

    it('falls back through providers on connect failure', async () => {
      stadia.failWith('no_route_found');
      brouter.succeedWith(makeRoute(10));
      const result = await client.connect(
        [
          [-105.1, 40.0],
          [-105.0, 40.1],
        ],
        baseContext,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.provider_used).toBe('brouter');
    });
  });
});
