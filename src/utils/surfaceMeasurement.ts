/**
 * surfaceMeasurement — measure the actual gravel/unpaved share of a route.
 *
 * The routing providers (BRouter/Stadia/Mapbox via smartCyclingRouter) do
 * NOT return surface composition, so the only way to report a real "~X%
 * gravel" figure is to query OSM surface tags via Overpass. That's a heavy
 * call, so callers run it sequentially across candidates and this module
 * caches results by quantized geometry (mirroring elevationEnrichment.ts).
 *
 * Always fail-soft: any error or empty result returns null, and the caller
 * falls back to a "gravel-biased" label.
 */

import {
  fetchRouteSurfaceData,
  computeSurfaceDistribution,
} from './surfaceOverlay.js';
import { fnv1a32, stableJson } from './stableHash';
import type { Coordinate } from '../types/geo';

export interface GravelMeasurement {
  /** Rounded percent of the route on gravel + unpaved surfaces. */
  gravelPct: number;
  /** Full rounded distribution keyed paved/gravel/unpaved/mixed. */
  distribution: Record<string, number>;
}

const CACHE_MAX_SIZE = 30;
const cache = new Map<string, GravelMeasurement | null>();

function cacheGet(key: string): GravelMeasurement | null | undefined {
  if (!cache.has(key)) return undefined;
  const entry = cache.get(key)!;
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, value: GravelMeasurement | null): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function cacheKeyForGeometry(geometry: ReadonlyArray<ReadonlyArray<number>>): string {
  const quantized = geometry.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(quantized));
}

/**
 * Measure the gravel/unpaved share of a route geometry. Cached by geometry;
 * never throws — returns null when surface data can't be fetched.
 */
export async function measureGravelPct(
  geometry: ReadonlyArray<Coordinate>,
): Promise<GravelMeasurement | null> {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;

  const key = cacheKeyForGeometry(geometry);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const segments = (await fetchRouteSurfaceData(
      geometry as Array<[number, number]>,
    )) as string[] | null;
    if (!segments || segments.length === 0) {
      cacheSet(key, null);
      return null;
    }
    const distribution = computeSurfaceDistribution(segments) as Record<string, number>;
    const gravelPct = Math.round((distribution.gravel ?? 0) + (distribution.unpaved ?? 0));
    const result: GravelMeasurement = { gravelPct, distribution };
    cacheSet(key, result);
    return result;
  } catch {
    cacheSet(key, null);
    return null;
  }
}

export function clearSurfaceCache(): void {
  cache.clear();
}
