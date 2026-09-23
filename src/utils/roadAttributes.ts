/**
 * roadAttributes — the OSM ways a route actually rides, with their tags.
 *
 * Sources, cheapest first:
 *   1. BRouter `taggedWays` (wayTags.ts) handed in by the caller, or
 *      remembered by the BRouter client for this exact geometry — the
 *      router already told us the way tags, free, no network.
 *   2. BRouter re-ride (brouterTrace.ts): the line is reconstructed through
 *      via points sampled along it and the response's tag rows are snapped
 *      back onto the original geometry. ~0.5 s for a 45 km loop, works for
 *      Stadia-built, imported, restored and loaded routes alike.
 *   3. Overpass, corridor query, last resort: the route is cut into short
 *      chunks and each chunk's bounding box (padded by CORRIDOR_M) becomes
 *      one term of a single union query. The public mirrors are shared and
 *      slow — a 110 km route's corridor drew 504s and 30 s timeouts in
 *      production, which is why tier 2 exists. `way(around:…)` with the
 *      route as a polyline is NOT usable at all: overpass-api.de answers it
 *      with 406 Not Acceptable and the other mirrors time out.
 *
 * Successful results are cached by quantized geometry (LRU; failures are
 * not cached so a hiccup can be retried), mirroring surfaceMeasurement.ts.
 * Matching a geometry against the ways reuses surfaceOverlay's spatial
 * grid + edge-distance snap (`matchRouteWays`).
 */

import { fetchOverpassElements, type OverpassElement } from './overpassClient';
import { matchRouteWays, groupSegmentsToFeatures } from './surfaceOverlay.js';
import { haversineMeters } from './distanceUnits';
import { taggedWaysCoverage, recallTaggedWays, geometryKey, type TaggedWay } from './wayTags';
import { traceTaggedWaysWithBRouter } from './brouterTrace';
import {
  ltsForTags,
  summarizeStress,
  facilityForTags,
  summarizeFacilities,
  LTS_COLORS,
  LTS_LABELS,
  type Lts,
  type StressSummary,
  type FacilityKind,
  type FacilitySummary,
} from './trafficStress';
import {
  inferSurface,
  summarizeSurface,
  type SurfaceCategory,
  type SurfaceInference,
  type SurfaceSummary,
} from './surfaceInference';
import type { Coordinate } from '../types/geo';

/** Each chunk's bounding box is padded by this many metres. */
export const CORRIDOR_M = 40;
/**
 * Route length per bounding box; longer routes scale this up to stay under
 * MAX_BOXES. Short chunks hug the line, so the union covers far less area
 * (and far fewer ways to serialise) than the 1.5 km chunks it replaced.
 */
export const CHUNK_M = 500;
/** Hard cap on boxes per query so the request stays parseable. */
export const MAX_BOXES = 250;
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

/**
 * `brouter`: tags from the route's own build; `brouter_trace`: BRouter
 * re-rode the line; `overpass`: corridor query.
 */
export type RoadAttributeSource = 'brouter' | 'brouter_trace' | 'overpass';

export interface CorridorWays {
  ways: TaggedWay[];
  source: RoadAttributeSource;
}

export interface RouteStressResult {
  /** One LTS (0–4) per coordinate segment (`coordinates.length - 1`). */
  ltsSegments: Lts[];
  summary: StressSummary;
  /** One bike-facility kind per coordinate segment, from the same ways. */
  facilities: FacilityKind[];
  /** Bike-lane / shoulder coverage roll-up (trafficStress.ts). */
  facility: FacilitySummary;
  source: RoadAttributeSource;
}

export interface RouteSurfaceResult {
  /** One category per coordinate segment (`coordinates.length - 1`). */
  segments: SurfaceCategory[];
  /** The inference behind each segment (category, confidence, deciding tag). */
  inferences: SurfaceInference[];
  summary: SurfaceSummary;
  source: RoadAttributeSource;
}

export interface FetchCorridorOptions {
  taggedWays?: ReadonlyArray<TaggedWay> | null;
}

const cache = new Map<string, CorridorWays>();
// Stress and surface are measured for the same geometry at the same moment;
// one network round-trip serves both.
const inflight = new Map<string, Promise<CorridorWays | null>>();

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
 * Ways along the route: BRouter tags (given or remembered) when they cover
 * the geometry, else a BRouter re-ride, else a cached Overpass corridor
 * fetch. Never throws; null when nothing is available.
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

  const remembered = recallTaggedWays(coordinates);
  if (remembered) return { ways: remembered, source: 'brouter' };

  const key = geometryKey(coordinates);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;
  const work = fetchCorridorWaysUncached(coordinates, key).finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

async function fetchCorridorWaysUncached(
  coordinates: ReadonlyArray<Coordinate>,
  key: string,
): Promise<CorridorWays | null> {
  const traced = await traceTaggedWaysWithBRouter(coordinates);
  if (traced) {
    const result: CorridorWays = { ways: traced, source: 'brouter_trace' };
    cacheSet(key, result);
    return result;
  }

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
  const facilities = matched.map((way) => (way ? facilityForTags(way.tags) : 'unknown'));
  return {
    ltsSegments,
    summary: summarizeStress(ltsSegments, coordinates),
    facilities,
    facility: summarizeFacilities(facilities, coordinates),
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

/**
 * Per-segment surface for a geometry given its corridor ways. Pure. Every
 * way counts, tagged or not: the inference ladder (surfaceInference.ts)
 * decides what each segment is made of and how sure we are.
 */
export function analyzeRouteSurface(
  coordinates: ReadonlyArray<Coordinate>,
  corridor: CorridorWays,
): RouteSurfaceResult | null {
  const matched = matchRouteWays(coordinates, corridor.ways) as Array<TaggedWay | null> | null;
  if (!matched) return null;
  const inferences = matched.map((way) => inferSurface(way?.tags));
  return {
    segments: inferences.map((inf) => inf.category),
    inferences,
    summary: summarizeSurface(inferences, coordinates),
    source: corridor.source,
  };
}

/** Fetch + analyze surface in one call; shares the corridor cache with stress. */
export async function measureRouteSurface(
  coordinates: ReadonlyArray<Coordinate>,
  options: FetchCorridorOptions = {},
): Promise<RouteSurfaceResult | null> {
  const corridor = await fetchCorridorWays(coordinates, options);
  if (!corridor) return null;
  return analyzeRouteSurface(coordinates, corridor);
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
