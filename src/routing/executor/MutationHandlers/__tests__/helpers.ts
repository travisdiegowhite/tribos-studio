/**
 * Shared test helpers for the MutationHandlers test suite.
 *
 * `applyMutation` / `applyMutations` use the real ConstraintBuilder and
 * resolve the RouterClient via `getRouterClient()`. Tests inject a
 * RouterClient through `setRouterClient()`:
 *
 * - `makeStubRouterClient` — a *real* `RouterClient` wired to stub
 *   providers. Exercises the genuine integration seam (registry,
 *   fallback chain, cache, dedup) with no network. This is the default
 *   for happy paths and `router_unavailable`.
 * - `makeFakeRouterClient` — a minimal fake whose `solve` returns a
 *   caller-supplied `ExecutorResult`. Needed only for passthrough tests
 *   of failure kinds the real RouterClient never emits on its own
 *   (`waypoint_unreachable`, `constraint_infeasible` from `solve`).
 */

import { vi } from 'vitest';

import { RouterClient } from '../../../RouterClient';
import type {
  ProviderName,
  ProviderResult,
  RouteProvider,
  RoutingProfile,
} from '../../../RouterClient';
import type {
  Coordinate,
  ExecutionMetadata,
  ExecutorResult,
  RouteContext,
  RouteSnapshot,
} from '../../types';

/**
 * Build a synthetic route. Geometry runs east along the equator so each
 * 0.01° step is ~1.11 km; 11 points clears RouterClient's
 * `coordinates.length > 10` validity gate.
 */
export function makeRoute(opts: {
  distance_km?: number;
  elevation_gain_m?: number;
  geometryStartLng?: number;
} = {}): RouteSnapshot {
  const startLng = opts.geometryStartLng ?? -105.1;
  const geometry: Coordinate[] = Array.from({ length: 11 }, (_, i) => [
    startLng + i * 0.01,
    40,
  ]);
  return {
    geometry,
    waypoints: [
      { coordinate: geometry[0] },
      { coordinate: geometry[geometry.length - 1] },
    ],
    stats: {
      distance_km: opts.distance_km ?? 10,
      elevation_gain_m: opts.elevation_gain_m ?? 100,
      elevation_loss_m: 100,
      duration_s: 1800,
    },
  };
}

export function makeContext(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    profile: 'road',
    shape: 'point_to_point',
    training_goal: 'endurance',
    mapbox_token: 'mock-token',
    ...overrides,
  };
}

/**
 * Stub `RouteProvider`. Defaults to supporting every profile; call
 * `succeedWith` / `failWith` to script its `solve`/`connect` behavior.
 */
export class StubProvider implements RouteProvider {
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

  succeedWith(route: RouteSnapshot, duration_ms = 100): this {
    const result: ProviderResult = { ok: true, route, duration_ms };
    this.solve.mockResolvedValue(result);
    this.connect.mockResolvedValue(result);
    return this;
  }

  failWith(
    kind: 'network_error' | 'http_error' | 'no_route_found' = 'network_error',
  ): this {
    const reason =
      kind === 'http_error'
        ? { kind: 'http_error' as const, status: 500, message: 'boom' }
        : kind === 'no_route_found'
          ? { kind: 'no_route_found' as const, message: 'no route' }
          : { kind: 'network_error' as const, message: 'network down' };
    const result: ProviderResult = { ok: false, reason, duration_ms: 50 };
    this.solve.mockResolvedValue(result);
    this.connect.mockResolvedValue(result);
    return this;
  }
}

/**
 * A real `RouterClient` wired to stub providers. `stadia` succeeds with
 * a default route unless overridden.
 */
export function makeStubRouterClient(
  configure?: (providers: {
    stadia: StubProvider;
    brouter: StubProvider;
    mapbox: StubProvider;
  }) => void,
): RouterClient {
  const providers = {
    stadia: new StubProvider('stadia'),
    brouter: new StubProvider('brouter'),
    mapbox: new StubProvider('mapbox'),
  };
  if (configure) {
    configure(providers);
  } else {
    providers.stadia.succeedWith(makeRoute({ distance_km: 12 }));
  }
  return new RouterClient({ providers });
}

/**
 * Minimal fake RouterClient. Only `solve` is meaningfully implemented;
 * it resolves to whatever `ExecutorResult` is supplied. Cast through
 * `unknown` because the fake intentionally does not implement the full
 * `RouterClient` surface.
 */
export function makeFakeRouterClient(result: ExecutorResult): RouterClient {
  return {
    solve: vi.fn().mockResolvedValue(result),
    connect: vi.fn(),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

/**
 * A fake RouterClient whose `solve` throws — used to prove
 * `applyMutation` never lets an exception escape.
 */
export function makeThrowingRouterClient(error: unknown = new Error('boom')): RouterClient {
  return {
    solve: vi.fn().mockRejectedValue(error),
    connect: vi.fn(),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

/**
 * A fake RouterClient that returns a scripted sequence of results — one
 * per `solve` call, in order. Used by the compositional tests, where
 * each mutation in the array needs its own controllable outcome.
 *
 * The returned `solve` is a `vi.fn()`, so tests can inspect
 * `client.solve.mock.calls` to assert which `constraint` each step
 * received (this is how route threading is verified).
 */
export function makeSequencedRouterClient(results: ExecutorResult[]): RouterClient {
  const solve = vi.fn();
  for (const result of results) {
    solve.mockResolvedValueOnce(result);
  }
  return {
    solve,
    connect: vi.fn(),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

/** Build a successful `ExecutorResult` wrapping `route`. */
export function okResult(
  route: RouteSnapshot,
  metadata: Partial<ExecutionMetadata> = {},
): ExecutorResult {
  return {
    ok: true,
    route,
    metadata: {
      provider_used: 'stadia',
      duration_ms: 100,
      cache_hit: false,
      attempts_tried: 1,
      ...metadata,
    },
  };
}
