/**
 * Shared test helpers for the ManualHandlers test suite.
 *
 * Mirrors the pattern in MutationHandlers tests:
 * - `makeStubRouterClient` — a *real* `RouterClient` wired to stub
 *   providers. Exercises the genuine seam (registry, fallback chain,
 *   cache, dedup) with no network.
 * - `makeFakeRouterClient` — a minimal fake whose `connect` returns a
 *   caller-supplied `ExecutorResult`. Used for passthrough tests of
 *   failure kinds the real RouterClient doesn't emit on its own.
 * - `makeThrowingRouterClient` — proves the handler's never-throws
 *   contract holds even if RouterClient.connect throws.
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
  waypointCount?: number;
} = {}): RouteSnapshot {
  const startLng = opts.geometryStartLng ?? -105.1;
  const geometry: Coordinate[] = Array.from({ length: 11 }, (_, i) => [
    startLng + i * 0.01,
    40,
  ]);
  const waypointCount = opts.waypointCount ?? 2;
  const waypoints =
    waypointCount === 2
      ? [
          { coordinate: geometry[0] },
          { coordinate: geometry[geometry.length - 1] },
        ]
      : Array.from({ length: waypointCount }, (_, i) => ({
          coordinate: geometry[
            Math.floor((i * (geometry.length - 1)) / (waypointCount - 1))
          ] as Coordinate,
        }));
  return {
    geometry,
    waypoints,
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

export function makeFakeRouterClient(result: ExecutorResult): RouterClient {
  return {
    solve: vi.fn(),
    connect: vi.fn().mockResolvedValue(result),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

export function makeThrowingRouterClient(error: unknown = new Error('boom')): RouterClient {
  return {
    solve: vi.fn(),
    connect: vi.fn().mockRejectedValue(error),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

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
