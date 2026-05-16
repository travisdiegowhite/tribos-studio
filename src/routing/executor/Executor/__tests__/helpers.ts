/**
 * Shared test helpers for the Executor facade test suite.
 *
 * Mirrors the helper patterns in MutationHandlers / ManualHandlers
 * tests. A real `RouterClient` wired to stub providers exercises the
 * genuine seam without hitting the network; minimal fakes cover
 * passthrough failure kinds.
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
  ExecutorResult,
  RouteContext,
  RouteSnapshot,
} from '../../types';

const ERIE_LNG = -105.05;
const ERIE_LAT = 40.05;

/**
 * Build a synthetic route around Erie. 11 geometry points clears
 * RouterClient's `coordinates.length > 10` validity gate.
 */
export function makeRoute(opts: {
  distance_km?: number;
  elevation_gain_m?: number;
  startLng?: number;
  startLat?: number;
} = {}): RouteSnapshot {
  const startLng = opts.startLng ?? ERIE_LNG;
  const startLat = opts.startLat ?? ERIE_LAT;
  const geometry: Coordinate[] = Array.from({ length: 11 }, (_, i) => [
    startLng + i * 0.005,
    startLat + i * 0.002,
  ]);
  return {
    geometry,
    waypoints: [
      { coordinate: geometry[0] },
      { coordinate: geometry[geometry.length - 1] },
    ],
    stats: {
      distance_km: opts.distance_km ?? 12,
      elevation_gain_m: opts.elevation_gain_m ?? 150,
      elevation_loss_m: 150,
      duration_s: 2400,
    },
  };
}

export function makeContext(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    profile: 'road',
    shape: 'loop',
    training_goal: 'endurance',
    mapbox_token: 'mock-token',
    start_coord: [ERIE_LNG, ERIE_LAT],
    speed_profile: { flat_kph: 25 },
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

  /** Each successive `solve` returns a distinct route. */
  succeedWithSequence(routes: RouteSnapshot[], duration_ms = 100): this {
    for (const route of routes) {
      this.solve.mockResolvedValueOnce({ ok: true, route, duration_ms });
    }
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
 * A real `RouterClient` wired to stub providers. By default
 * `stadia.solve` succeeds with a 12 km route.
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
 * Minimal fake RouterClient. `solve` resolves to the supplied result.
 * `connect` resolves to the same; tests overriding `connect` should
 * stub it explicitly.
 */
export function makeFakeRouterClient(result: ExecutorResult): RouterClient {
  return {
    solve: vi.fn().mockResolvedValue(result),
    connect: vi.fn().mockResolvedValue(result),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}

export function makeThrowingRouterClient(
  error: unknown = new Error('boom'),
): RouterClient {
  return {
    solve: vi.fn().mockRejectedValue(error),
    connect: vi.fn().mockRejectedValue(error),
    clearCache: vi.fn(),
    cacheSize: vi.fn().mockReturnValue(0),
  } as unknown as RouterClient;
}
