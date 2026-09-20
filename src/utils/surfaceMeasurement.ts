/**
 * surfaceMeasurement — measure the actual gravel/unpaved share of a route.
 *
 * Stadia and Mapbox do NOT return surface composition, so a real "~X% gravel"
 * figure has to come from the OSM tags of the ways the route rides. Those
 * come from `measureRouteSurface` (roadAttributes.ts): BRouter tags when the
 * route came from BRouter, else a BRouter re-ride of the line, else an
 * Overpass corridor query; every way counts, with `surface=*` missing ones
 * inferred from `tracktype` / `highway` (surfaceInference.ts). Its corridor
 * cache is shared with the traffic-stress measurement, so a candidate that
 * measured one gets the other for free.
 *
 * Always fail-soft: any error or empty result returns null, and the caller
 * falls back to a "gravel-biased" label.
 */

import { measureRouteSurface } from './roadAttributes';
import { geometryKey } from './wayTags';
import type { Coordinate } from '../types/geo';
import type { TaggedWay } from './wayTags';

export interface MeasureGravelOptions {
  /**
   * Tagged ways the router already returned for this geometry (BRouter
   * `taggedWays`). When present and covering the route, no network call.
   */
  ways?: ReadonlyArray<TaggedWay> | null;
}

export interface GravelMeasurement {
  /** Rounded percent of the route on gravel + unpaved surfaces. */
  gravelPct: number;
  /** Full rounded distribution keyed paved/gravel/unpaved. */
  distribution: Record<string, number>;
  /** Percent of the route whose surface was inferred rather than tagged. */
  inferredPct: number;
  /** Percent of the route with no surface verdict at all. */
  unknownPct: number;
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

/**
 * Measure the gravel/unpaved share of a route geometry. Cached by geometry;
 * never throws — returns null when surface data can't be had.
 */
export async function measureGravelPct(
  geometry: ReadonlyArray<Coordinate>,
  options: MeasureGravelOptions = {},
): Promise<GravelMeasurement | null> {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;

  const ways = options.ways && options.ways.length > 0 ? options.ways : null;
  const key = geometryKey(geometry);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const measured = await measureRouteSurface(geometry, { taggedWays: ways });
    if (!measured) {
      // Not cached: a transient fetch failure must not pin a geometry to null.
      return null;
    }
    const { summary } = measured;
    const result: GravelMeasurement = {
      gravelPct: summary.gravelPct,
      distribution: summary.distribution,
      inferredPct: summary.inferredPct,
      unknownPct: summary.unknownPct,
    };
    cacheSet(key, result);
    return result;
  } catch {
    return null;
  }
}

export function clearSurfaceCache(): void {
  cache.clear();
}
