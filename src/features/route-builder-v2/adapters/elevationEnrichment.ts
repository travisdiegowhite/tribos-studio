/**
 * Elevation enrichment for executor results.
 *
 * Fixes the T2.6.1 audit finding: routes produced via Stadia (road,
 * commute) and Mapbox (any profile as fallback) come back with
 * `elevation_gain_m: 0` because neither provider's wrapper extracts
 * elevation from its response. The legacy pipeline solved this with a
 * separate `getElevationData()` pass in `aiRouteGenerator.js`; the new
 * RB2 pipeline lacks that hook. This module is that hook, at the
 * executor-adapter seam, so all four executor call paths
 * (`generate`/`applyMutation`/`applyManualAction`/`generateAlternatives`)
 * benefit from one wrapper.
 *
 * Cache:
 *   - module-level LRU `Map<key, EnrichedFields>`, capacity 50, no TTL
 *     (elevation for a fixed geometry is immutable).
 *   - key is `fnv1a32(stableJson(quantizedGeometry))`, 5-decimal
 *     quantization (~1m) — finer than provider drift, eliminates
 *     spurious misses on identical routes.
 *   - reuses the hash helpers from `RouterClient/cache.ts` to avoid
 *     duplicating them.
 *
 * Behavior:
 *   - failed results pass through unchanged (no fetch).
 *   - already-enriched routes (BRouter: positive gain + per-point
 *     elevations populated) pass through unchanged.
 *   - geometry < 2 points: skip.
 *   - on success: overwrite `stats.elevation_gain_m`/`elevation_loss_m`
 *     and populate `route.elevations_m[]`.
 *   - on API failure (null return or throw): pass through unchanged,
 *     emit `elevation_enrich_failed`, never throw.
 */

import { getElevationData, calculateElevationStats } from '../../../utils/elevation';
import { fnv1a32, stableJson } from '../../../routing/RouterClient/cache';
import { trackRb2 } from '../telemetry/trackRb2';
import type { Coordinate } from '../../../types/geo';
import type {
  ExecutorResult,
  RouteSnapshot,
} from '../../../routing/executor';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnrichElevationOptions {
  /** Bypass the per-geometry cache (tests). */
  skipCache?: boolean;
  /** Override `Date.now()` for deterministic telemetry (tests). */
  now?: number;
}

/**
 * Enrich a single executor result with API-derived elevation. Pure
 * pass-through for failed results, already-enriched results, and
 * degenerate-geometry results.
 *
 * Never throws. On API failure, returns the original result unchanged
 * with stats.elevation_gain_m at whatever the provider supplied
 * (which is 0 for Stadia/Mapbox; this is the existing P1.4 symptom).
 */
export async function enrichElevation(
  result: ExecutorResult,
  options: EnrichElevationOptions = {},
): Promise<ExecutorResult> {
  if (!result.ok) return result;

  const route = result.route;
  const geometry = route.geometry;

  if (!Array.isArray(geometry) || geometry.length < 2) {
    trackRb2('elevation_enrich_skipped', { reason: 'no_geometry' });
    return result;
  }

  if (isAlreadyEnriched(route)) {
    trackRb2('elevation_enrich_skipped', { reason: 'already_enriched' });
    return result;
  }

  const key = cacheKeyForGeometry(geometry);
  if (!options.skipCache) {
    const cached = cacheGet(key);
    if (cached) {
      trackRb2('elevation_cache_hit', {
        key,
        point_count: geometry.length,
      });
      trackRb2('elevation_enrich_completed', {
        point_count: geometry.length,
        duration_ms: 0,
        gain_m: cached.elevation_gain_m,
        loss_m: cached.elevation_loss_m,
        source: 'cache',
      });
      return withEnrichedRoute(result, route, cached);
    }
  }

  const startedAt = options.now ?? Date.now();
  trackRb2('elevation_enrich_started', {
    point_count: geometry.length,
    cache_lookup: !options.skipCache,
  });

  try {
    const profile = await getElevationData(geometry as Array<[number, number]>);
    if (!profile || !Array.isArray(profile) || profile.length === 0) {
      trackRb2('elevation_enrich_failed', {
        point_count: geometry.length,
        duration_ms: (options.now ?? Date.now()) - startedAt,
        error_message: 'null_profile',
      });
      return result;
    }

    if (profile.length !== geometry.length) {
      // `getElevationData` interpolates back to original length on
      // downsampling; a mismatch implies the helper short-circuited.
      // Safer to drop than to write a misaligned per-point array.
      trackRb2('elevation_enrich_failed', {
        point_count: geometry.length,
        duration_ms: (options.now ?? Date.now()) - startedAt,
        error_message: 'length_mismatch',
      });
      return result;
    }

    const stats = calculateElevationStats(profile);
    const enriched: EnrichedFields = {
      elevations_m: profile.map((p) => p.elevation),
      elevation_gain_m: stats.gain,
      elevation_loss_m: stats.loss,
    };
    cacheSet(key, enriched);

    trackRb2('elevation_enrich_completed', {
      point_count: geometry.length,
      duration_ms: (options.now ?? Date.now()) - startedAt,
      gain_m: enriched.elevation_gain_m,
      loss_m: enriched.elevation_loss_m,
      source: 'api',
    });

    return withEnrichedRoute(result, route, enriched);
  } catch (err) {
    trackRb2('elevation_enrich_failed', {
      point_count: geometry.length,
      duration_ms: (options.now ?? Date.now()) - startedAt,
      error_message: truncate(err instanceof Error ? err.message : String(err), 200),
    });
    return result;
  }
}

/**
 * Batch variant for `count: 3` alternatives. Runs enrichment for each
 * result concurrently; identical geometries within the batch share a
 * single fetch via the cache.
 */
export async function enrichElevationBatch(
  results: ExecutorResult[],
  options: EnrichElevationOptions = {},
): Promise<ExecutorResult[]> {
  return Promise.all(results.map((r) => enrichElevation(r, options)));
}

/** Test helper — empties the cache between cases. */
export function clearElevationCache(): void {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

/** Test helper — exposes counters for assertion. */
export function __elevationCacheStats(): {
  size: number;
  hits: number;
  misses: number;
} {
  return { size: cache.size, hits: cacheHits, misses: cacheMisses };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface EnrichedFields {
  elevations_m: number[];
  elevation_gain_m: number;
  elevation_loss_m: number;
}

const CACHE_MAX_SIZE = 50;
const cache = new Map<string, EnrichedFields>();
let cacheHits = 0;
let cacheMisses = 0;

function cacheGet(key: string): EnrichedFields | null {
  const entry = cache.get(key);
  if (!entry) {
    cacheMisses += 1;
    return null;
  }
  // LRU bump: re-insert to move to end of iteration order.
  cache.delete(key);
  cache.set(key, entry);
  cacheHits += 1;
  return entry;
}

function cacheSet(key: string, value: EnrichedFields): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
      trackRb2('elevation_cache_evicted', { key: oldest });
    }
  }
  cache.set(key, value);
}

function cacheKeyForGeometry(geometry: ReadonlyArray<Coordinate>): string {
  const quantized = geometry.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(quantized));
}

function isAlreadyEnriched(route: RouteSnapshot): boolean {
  const hasPositiveGain = (route.stats?.elevation_gain_m ?? 0) > 0;
  const hasPerPoint =
    Array.isArray(route.elevations_m) &&
    route.elevations_m.length === route.geometry.length;
  return hasPositiveGain && hasPerPoint;
}

function withEnrichedRoute(
  result: Extract<ExecutorResult, { ok: true }>,
  route: RouteSnapshot,
  enriched: EnrichedFields,
): ExecutorResult {
  return {
    ...result,
    route: {
      ...route,
      stats: {
        ...route.stats,
        elevation_gain_m: enriched.elevation_gain_m,
        elevation_loss_m: enriched.elevation_loss_m,
      },
      elevations_m: enriched.elevations_m,
    },
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
