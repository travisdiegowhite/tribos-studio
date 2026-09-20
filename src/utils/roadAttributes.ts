/**
 * roadAttributes — the OSM ways a route actually rides, with their tags.
 *
 * Two sources, cheapest first:
 *   1. BRouter `taggedWays` (wayTags.ts) when the router already told us the
 *      way tags for this geometry — free, no network.
 *   2. Overpass, corridor query: the route is cut into ~1.5 km chunks and
 *      each chunk's bounding box (padded by CORRIDOR_M) becomes one term of
 *      a single union query. Bounding-box filters are index-backed and fast
 *      on every public mirror. The obvious alternative, `way(around:…)`
 *      with the route as a polyline, is NOT usable: overpass-api.de answers
 *      it with 406 Not Acceptable (even for a single point) and the other
 *      mirrors time out computing it over the global way set. It returns
 *      untagged roads too, which is what traffic stress needs.
 *
 * Successful results are cached by quantized geometry (LRU; failures are
 * not cached so a mirror hiccup can be retried), mirroring
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

/** Each chunk's bounding box is padded by this many metres. */
export const CORRIDOR_M = 40;
/** Route length per bounding box; longer routes scale this up to stay under MAX_BOXES. */
export const CHUNK_M = 1500;
/** Hard cap on boxes per query so the request stays small and fast. */
export const MAX_BOXES = 80;
/** BRouter tags are used alone when they cover at least this share of the route. */
const TAGGED_WAYS_MIN_COVERAGE = 0.9;
const CACHE_MAX_SIZE = 30;

// Ways that are never ridden and only inflate the payload: unbuilt roads,
// steps, sidewalks/crossings, driveways and parking aisles.
const WAY_FILTER =
  '["highway"]' +
  '["highway"!~"^(proposed|construction|abandoned|razed|corridor|elevator|platform|bus_stop|steps)$"]' +
  '["service"!~"^(driveway|parking_aisle)$"]' +
  '["footway"!~"^(sidewalk|crossing)$"]';

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

const cache = new Map<string, CorridorWays>();

function cacheGet(key: string): CorridorWays | undefined {
  if (!cache.has(key)) return undefined;
  const entry = cache.get(key)!;
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, value: CorridorWays): void {
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

export interface CorridorBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Cut the route into chunks of ~CHUNK_M (scaled up so a very long route
 * still fits MAX_BOXES) and return each chunk's bounding box padded by
 * CORRIDOR_M. Exported for tests.
 */
export function corridorBoxes(coordinates: ReadonlyArray<ReadonlyArray<number>>): CorridorBox[] {
  if (coordinates.length === 0) return [];
  const totalM = polylineLengthM(coordinates);
  const chunkM = Math.max(CHUNK_M, totalM / MAX_BOXES);

  const boxes: CorridorBox[] = [];
  let chunk: Array<ReadonlyArray<number>> = [coordinates[0]];
  let acc = 0;
  const flush = () => {
    if (chunk.length === 0) return;
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    for (const [lng, lat] of chunk) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
    const padLat = CORRIDOR_M / 111000;
    const midLat = ((south + north) / 2) * (Math.PI / 180);
    const padLng = padLat / Math.max(0.2, Math.cos(midLat));
    boxes.push({ south: south - padLat, west: west - padLng, north: north + padLat, east: east + padLng });
  };
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    acc += haversineMeters(a[1], a[0], b[1], b[0]);
    chunk.push(b);
    if (acc >= chunkM) {
      flush();
      chunk = [b];
      acc = 0;
    }
  }
  if (chunk.length > 1) flush();
  else if (boxes.length === 0) flush();
  return boxes;
}

/** Overpass QL: one union of per-chunk bounding-box way queries. */
export function buildCorridorQuery(coordinates: ReadonlyArray<ReadonlyArray<number>>): string {
  const terms = corridorBoxes(coordinates)
    .map(
      (b) =>
        `way${WAY_FILTER}(${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)});`,
    )
    .join('');
  return `[out:json][timeout:25];(${terms});out geom;`;
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
      timeoutMs: 30000,
    });
    const ways = elementsToTaggedWays(elements);
    if (ways.length === 0) return null;
    const result: CorridorWays = { ways, source: 'overpass' };
    // Only successes are cached: a transient mirror failure must not pin a
    // geometry to "unavailable" until the page reloads.
    cacheSet(key, result);
    return result;
  } catch (err) {
    console.warn('Corridor way fetch failed:', (err as Error)?.message ?? err);
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
