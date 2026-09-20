/**
 * roadAttributes — the OSM ways a route actually rides, with their tags.
 *
 * Two sources, cheapest first:
 *   1. BRouter `taggedWays` (wayTags.ts) when the router already told us the
 *      way tags for this geometry — free, no network.
 *   2. Overpass, corridor query: every `highway` way within CORRIDOR_M of a
 *      sampled polyline of the route (`around:` with a lat,lon list). Far
 *      smaller than a bounding-box fetch on a long loop, and it returns
 *      untagged roads too, which is what traffic stress needs.
 *
 * Results are cached by quantized geometry (LRU, fail-soft null), mirroring
 * surfaceMeasurement.ts. Matching a geometry against the ways reuses
 * surfaceOverlay's spatial grid + edge-distance snap (`matchRouteWays`).
 */

import { fetchOverpassElements, type OverpassElement } from './overpassClient';
import { matchRouteWays, groupSegmentsToFeatures } from './surfaceOverlay.js';
import { fnv1a32, stableJson } from './stableHash';
import { haversineMeters } from './distanceUnits';
import { taggedWaysCoverage, type TaggedWay } from './wayTags';
import {
  ltsForTags,
  summarizeStress,
  LTS_COLORS,
  LTS_LABELS,
  type Lts,
  type StressSummary,
} from './trafficStress';
import type { Coordinate } from '../types/geo';

/** Ways within this many metres of the route are fetched. */
export const CORRIDOR_M = 25;
/** Sample the route at roughly this spacing for the Overpass `around` list. */
const SAMPLE_SPACING_M = 75;
/** Hard cap on sampled points so the query body stays small (~10 KB). */
const MAX_SAMPLE_POINTS = 400;
/** BRouter tags are used alone when they cover at least this share of the route. */
const TAGGED_WAYS_MIN_COVERAGE = 0.9;
const CACHE_MAX_SIZE = 30;

const EXCLUDED_HIGHWAYS = '^(proposed|construction|abandoned|razed|corridor|elevator|platform|bus_stop)$';

export type RoadAttributeSource = 'brouter' | 'overpass';

export interface CorridorWays {
  ways: TaggedWay[];
  source: RoadAttributeSource;
}

export interface RouteStressResult {
  /** One LTS (0–4) per coordinate segment (`coordinates.length - 1`). */
  ltsSegments: Lts[];
  summary: StressSummary;
  source: RoadAttributeSource;
}

export interface FetchCorridorOptions {
  taggedWays?: ReadonlyArray<TaggedWay> | null;
}

const cache = new Map<string, CorridorWays | null>();

function cacheGet(key: string): CorridorWays | null | undefined {
  if (!cache.has(key)) return undefined;
  const entry = cache.get(key)!;
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, value: CorridorWays | null): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export function clearRoadAttributesCache(): void {
  cache.clear();
}

function cacheKey(geometry: ReadonlyArray<ReadonlyArray<number>>): string {
  const quantized = geometry.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(['corridor', quantized]));
}

/** Route length in metres. */
export function polylineLengthM(coordinates: ReadonlyArray<ReadonlyArray<number>>): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    total += haversineMeters(a[1], a[0], b[1], b[0]);
  }
  return total;
}

/**
 * Thin the route to points ~SAMPLE_SPACING_M apart (always keeping the first
 * and last), capped at MAX_SAMPLE_POINTS. Exported for tests.
 */
export function sampleCorridorPoints(
  coordinates: ReadonlyArray<ReadonlyArray<number>>,
): Array<[number, number]> {
  if (coordinates.length === 0) return [];
  const totalM = polylineLengthM(coordinates);
  const spacing = Math.max(SAMPLE_SPACING_M, totalM / MAX_SAMPLE_POINTS);
  const out: Array<[number, number]> = [[coordinates[0][0], coordinates[0][1]]];
  let sinceLast = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    sinceLast += haversineMeters(a[1], a[0], b[1], b[0]);
    if (sinceLast >= spacing || i === coordinates.length - 1) {
      out.push([b[0], b[1]]);
      sinceLast = 0;
    }
  }
  return out;
}

/** Overpass QL for every highway way within CORRIDOR_M of the sampled route. */
export function buildCorridorQuery(coordinates: ReadonlyArray<ReadonlyArray<number>>): string {
  const pts = sampleCorridorPoints(coordinates);
  const list = pts.map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(',');
  return `[out:json][timeout:20];way["highway"]["highway"!~"${EXCLUDED_HIGHWAYS}"](around:${CORRIDOR_M},${list});out geom;`;
}

/** The one Overpass `{lat, lon}` → canonical `[lng, lat]` conversion. */
export function elementsToTaggedWays(elements: ReadonlyArray<OverpassElement>): TaggedWay[] {
  const ways: TaggedWay[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const tags = el.tags ?? {};
    if (!tags.highway) continue;
    ways.push({
      id: el.id,
      geometry: el.geometry.map((n) => [n.lon, n.lat] as Coordinate),
      tags,
    });
  }
  return ways;
}

/**
 * Ways along the route. BRouter tags win when they cover the geometry;
 * otherwise a cached Overpass corridor fetch. Never throws; null when
 * nothing is available.
 */
export async function fetchCorridorWays(
  coordinates: ReadonlyArray<Coordinate>,
  options: FetchCorridorOptions = {},
): Promise<CorridorWays | null> {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const tagged = options.taggedWays;
  if (tagged && tagged.length > 0) {
    const routeM = polylineLengthM(coordinates);
    if (routeM > 0 && taggedWaysCoverage(tagged) / routeM >= TAGGED_WAYS_MIN_COVERAGE) {
      return { ways: [...tagged], source: 'brouter' };
    }
  }

  const key = cacheKey(coordinates);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const elements = await fetchOverpassElements(buildCorridorQuery(coordinates), {
      timeoutMs: 20000,
    });
    const ways = elementsToTaggedWays(elements);
    const result: CorridorWays | null = ways.length > 0 ? { ways, source: 'overpass' } : null;
    cacheSet(key, result);
    return result;
  } catch (err) {
    console.warn('Corridor way fetch failed:', (err as Error)?.message ?? err);
    cacheSet(key, null);
    return null;
  }
}

/**
 * Per-segment LTS for a geometry given its corridor ways. Pure.
 */
export function analyzeRouteStress(
  coordinates: ReadonlyArray<Coordinate>,
  corridor: CorridorWays,
): RouteStressResult | null {
  const matched = matchRouteWays(coordinates, corridor.ways) as Array<TaggedWay | null> | null;
  if (!matched) return null;
  const ltsSegments = matched.map((way) => (way ? ltsForTags(way.tags) : 0)) as Lts[];
  return {
    ltsSegments,
    summary: summarizeStress(ltsSegments, coordinates),
    source: corridor.source,
  };
}

/** Fetch + analyze in one call. Null when no way data could be had. */
export async function measureRouteStress(
  coordinates: ReadonlyArray<Coordinate>,
  options: FetchCorridorOptions = {},
): Promise<RouteStressResult | null> {
  const corridor = await fetchCorridorWays(coordinates, options);
  if (!corridor) return null;
  return analyzeRouteStress(coordinates, corridor);
}

/** GeoJSON for the traffic-stress line overlay. */
export function createStressRoute(
  coordinates: ReadonlyArray<Coordinate>,
  ltsSegments: ReadonlyArray<Lts>,
): GeoJSON.FeatureCollection | null {
  return groupSegmentsToFeatures(coordinates, ltsSegments, (lts: Lts) => ({
    color: LTS_COLORS[lts] ?? LTS_COLORS[0],
    lts,
    label: LTS_LABELS[lts] ?? LTS_LABELS[0],
  })) as GeoJSON.FeatureCollection | null;
}
