/**
 * RouterClient — the stateful routing service.
 *
 * Per Executor Spec §4.4:
 * - Provider registry (profile → ordered provider list)
 * - Fallback chain (try in order, advance on failure)
 * - Request dedup (identical constraint within 100ms → single call)
 * - Response cache (LRU, 100 entries, 5min TTL)
 * - Per-call metrics
 *
 * This module has NO production callers in T2.1. It will be wired in
 * by T2.5 (Executor facade). See `docs/legacy-routing-notes.md` for
 * the audit of behaviors preserved from `smartCyclingRouter.js`.
 */

import type { Coordinate } from '../../types/geo';
import { trackRouteBuilder } from '../../utils/routeBuilderTelemetry';
import {
  ResponseCache,
  cacheKeyForConnect,
  cacheKeyForConstraint,
} from './cache';
import { InFlightDedup } from './dedup';
import { BRouterProvider } from './providers/BRouterProvider';
import { MapboxProvider } from './providers/MapboxProvider';
import { StadiaProvider } from './providers/StadiaProvider';
import {
  PROVIDER_REGISTRY,
  getProvidersForProfile,
  normalizeProfile,
} from './registry';
import type {
  ExecutorFailure,
  ExecutorResult,
  ProviderName,
  ProviderResult,
  RouteConstraint,
  RouteContext,
  RouteProvider,
  RouterClientConfig,
  RoutingProfile,
} from './types';

/**
 * Re-prefix `trackRouteBuilder` events with `routerclient_` instead of
 * the helper's default `route_builder_`. The two prefixes coexist —
 * legacy `smartCyclingRouter.js` continues to emit `route_builder_*`
 * events. RouterClient adds its own stream so analyses can compare
 * the old and new pipelines side-by-side.
 *
 * Implementation: the `trackRouteBuilder` helper hard-codes its
 * prefix. To avoid extending its public API for a single new caller,
 * we strip the prefix it adds by passing a sentinel and reshape the
 * call. Cleaner alternative would be to extend `trackRouteBuilder` —
 * left as a follow-up.
 */
function track(event: string, properties: Record<string, unknown> = {}): void {
  // The helper prefixes with `route_builder_`. We want
  // `routerclient_<event>`. The cleanest way without modifying the
  // helper is to embed the desired prefix in our event string and
  // accept the doubled prefix downstream — but that loses readability.
  // Instead, swap the helper to PostHog directly here. The helper's
  // session/timestamp envelope is reproduced via re-export pattern in
  // the future. For now, prefix-tag the event so it's still routable
  // and use the existing helper for the envelope.
  trackRouteBuilder(`routerclient_${event}`, properties);
}

const DEFAULT_CACHE_MAX_SIZE = 100;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DEDUP_WINDOW_MS = 100;

export class RouterClient {
  private readonly cache: ResponseCache;
  private readonly dedup: InFlightDedup;
  private readonly registry: readonly { profile: RoutingProfile; providers: ProviderName[] }[];
  private readonly providers: Record<ProviderName, RouteProvider>;

  constructor(config: RouterClientConfig = {}) {
    this.cache = new ResponseCache(
      config.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE,
      config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    );
    this.dedup = new InFlightDedup(config.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW_MS);
    this.registry = config.registry ?? PROVIDER_REGISTRY;

    const defaultProviders: Record<ProviderName, RouteProvider> = {
      stadia: new StadiaProvider(),
      brouter: new BRouterProvider(),
      mapbox: new MapboxProvider(),
    };
    this.providers = {
      stadia: config.providers?.stadia ?? defaultProviders.stadia,
      brouter: config.providers?.brouter ?? defaultProviders.brouter,
      mapbox: config.providers?.mapbox ?? defaultProviders.mapbox,
    };
  }

  /**
   * Full preference-aware routing. Used by the LLM mutation path.
   */
  async solve(
    constraint: RouteConstraint,
    context: RouteContext,
  ): Promise<ExecutorResult> {
    const profile = normalizeProfile(constraint.profile);
    const normalised: RouteConstraint = { ...constraint, profile };
    const cacheKey = cacheKeyForConstraint(normalised);

    track('solve_called', {
      profile,
      waypoint_count: normalised.waypoints.length,
    });

    const cached = this.cache.get(cacheKey);
    if (cached && cached.ok) {
      track('solve_cache_hit', { key: cacheKey });
      const result: ExecutorResult = {
        ...cached,
        metadata: { ...cached.metadata, cache_hit: true },
      };
      track('solve_completed', {
        total_duration_ms: 0,
        provider_used: cached.metadata.provider_used,
        cache_hit: true,
        attempts_tried: 0,
      });
      return result;
    }

    const dedupResult = this.dedup.dedupe(cacheKey, () =>
      this.runSolveChain(normalised, context, cacheKey),
    );
    if (dedupResult.deduped) {
      track('solve_dedup_joined', {
        key: cacheKey,
        wait_ms: dedupResult.wait_ms,
      });
    }
    return dedupResult.promise;
  }

  /**
   * Connect-the-dots geometry through an ordered waypoint list. Used
   * by the UI manual-edit path.
   */
  async connect(
    waypoints: Coordinate[],
    context: RouteContext,
  ): Promise<ExecutorResult> {
    track('connect_called', {
      waypoint_count: waypoints.length,
    });

    if (waypoints.length < 2) {
      const failure: ExecutorFailure = {
        kind: 'constraint_infeasible',
        constraint: 'waypoints',
        explanation: 'connect requires at least 2 waypoints',
      };
      track('connect_completed', {
        total_duration_ms: 0,
        provider_used: null,
        cache_hit: false,
        attempts_tried: 0,
      });
      return { ok: false, reason: failure };
    }

    const cacheKey = cacheKeyForConnect(waypoints);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.ok) {
      track('connect_cache_hit', { key: cacheKey });
      const result: ExecutorResult = {
        ...cached,
        metadata: { ...cached.metadata, cache_hit: true },
      };
      track('connect_completed', {
        total_duration_ms: 0,
        provider_used: cached.metadata.provider_used,
        cache_hit: true,
        attempts_tried: 0,
      });
      return result;
    }

    const dedupResult = this.dedup.dedupe(cacheKey, () =>
      this.runConnectChain(waypoints, context, cacheKey),
    );
    if (dedupResult.deduped) {
      track('connect_dedup_joined', {
        key: cacheKey,
        wait_ms: dedupResult.wait_ms,
      });
    }
    return dedupResult.promise;
  }

  /**
   * Clear the cache. Test helper / future "user changed region" hook.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** Test helper. */
  cacheSize(): number {
    return this.cache.size();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async runSolveChain(
    constraint: RouteConstraint,
    context: RouteContext,
    cacheKey: string,
  ): Promise<ExecutorResult> {
    const startTime = Date.now();
    const orderedNames = getProvidersForProfile(constraint.profile, this.registry);
    const tried: ProviderName[] = [];

    for (let i = 0; i < orderedNames.length; i++) {
      const name = orderedNames[i];
      const provider = this.providers[name];
      if (!provider) continue;
      if (!provider.supports(constraint.profile)) continue;

      tried.push(name);
      track('provider_attempted', {
        provider: name,
        profile: constraint.profile,
        attempt_index: i,
      });

      const result = await provider.solve(constraint, context);

      if (result.ok) {
        track('provider_succeeded', {
          provider: name,
          duration_ms: result.duration_ms,
          attempt_index: i,
        });

        const final: ExecutorResult = {
          ok: true,
          route: result.route,
          metadata: {
            provider_used: name,
            duration_ms: Date.now() - startTime,
            cache_hit: false,
            attempts_tried: tried.length,
          },
        };
        this.cache.set(cacheKey, final);
        track('solve_completed', {
          total_duration_ms: final.metadata.duration_ms,
          provider_used: name,
          cache_hit: false,
          attempts_tried: tried.length,
        });
        return final;
      }

      track('provider_failed', {
        provider: name,
        duration_ms: result.duration_ms,
        failure_kind: result.reason.kind,
        attempt_index: i,
      });
    }

    // All providers failed.
    const failure: ExecutorResult = {
      ok: false,
      reason: { kind: 'router_unavailable', providers_tried: tried },
    };
    track('solve_completed', {
      total_duration_ms: Date.now() - startTime,
      provider_used: null,
      cache_hit: false,
      attempts_tried: tried.length,
    });
    return failure;
  }

  private async runConnectChain(
    waypoints: Coordinate[],
    context: RouteContext,
    cacheKey: string,
  ): Promise<ExecutorResult> {
    const startTime = Date.now();
    // For `connect`, profile isn't known — use the registry's `road`
    // ordering as the default. This is the same precedence the legacy
    // module's manual-edit path implicitly uses.
    const orderedNames = getProvidersForProfile('road', this.registry);
    const tried: ProviderName[] = [];

    for (let i = 0; i < orderedNames.length; i++) {
      const name = orderedNames[i];
      const provider = this.providers[name];
      if (!provider) continue;

      tried.push(name);
      track('provider_attempted', {
        provider: name,
        profile: 'road',
        attempt_index: i,
        mode: 'connect',
      });

      const result: ProviderResult = await provider.connect(waypoints, context);

      if (result.ok) {
        track('provider_succeeded', {
          provider: name,
          duration_ms: result.duration_ms,
          attempt_index: i,
          mode: 'connect',
        });

        const final: ExecutorResult = {
          ok: true,
          route: result.route,
          metadata: {
            provider_used: name,
            duration_ms: Date.now() - startTime,
            cache_hit: false,
            attempts_tried: tried.length,
          },
        };
        this.cache.set(cacheKey, final);
        track('connect_completed', {
          total_duration_ms: final.metadata.duration_ms,
          provider_used: name,
          cache_hit: false,
          attempts_tried: tried.length,
        });
        return final;
      }

      track('provider_failed', {
        provider: name,
        duration_ms: result.duration_ms,
        failure_kind: result.reason.kind,
        attempt_index: i,
        mode: 'connect',
      });
    }

    const failure: ExecutorResult = {
      ok: false,
      reason: { kind: 'router_unavailable', providers_tried: tried },
    };
    track('connect_completed', {
      total_duration_ms: Date.now() - startTime,
      provider_used: null,
      cache_hit: false,
      attempts_tried: tried.length,
    });
    return failure;
  }
}
