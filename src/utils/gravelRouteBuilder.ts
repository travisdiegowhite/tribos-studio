/**
 * gravelRouteBuilder — build cycling loops that actually ride gravel.
 *
 * Routing between town centers lets BRouter/Valhalla connect them on
 * pavement, so a "50% gravel" request comes back ~9% gravel. The fix: find
 * the real gravel/dirt ways near the start (OSM via Overpass) and place
 * waypoints at the ENTRY and EXIT of each gravel stretch. Both routers route
 * strictly through every waypoint in order, so two points on the same way
 * force the router to ride the gravel between them (a single point only
 * forces touching it). Stringing enough stretches together also lets us size
 * total gravel length to the requested percentage.
 *
 * Pure compute, fail-soft (any Overpass/routing failure returns []), no React
 * or store access. Coordinates are canonical [lng, lat] per src/types/geo.ts;
 * Overpass {lat,lon} is converted once at the parse boundary in findGravelWays.
 */

import { getSmartCyclingRoute as getSmartCyclingRouteJs } from './smartCyclingRouter';
import { classifySurface } from './surfaceOverlay.js';
import {
  calculateDestinationPoint as calculateDestinationPointJs,
  calculateBearing as calculateBearingJs,
  normalizeBearing as normalizeBearingJs,
} from './iterativeRouteBuilder';
import { haversineKm, M_TO_KM } from './distanceUnits';
import { fnv1a32, stableJson } from './stableHash';
import { assertCoordinate, type Coordinate } from '../types/geo';

// The geometry helpers + router are untyped JS (JSDoc uses mutable [number,number]).
// Re-type them once to accept the readonly canonical Coordinate.
const destinationPoint = calculateDestinationPointJs as unknown as (
  start: Coordinate,
  bearingDeg: number,
  distanceKm: number,
) => Coordinate;
const bearingBetween = calculateBearingJs as unknown as (a: Coordinate, b: Coordinate) => number;
const normalizeBearing = normalizeBearingJs as unknown as (bearing: number) => number;

interface SmartRouteResult {
  coordinates?: Coordinate[];
  distance_m?: number;
  distance?: number;
  duration_s?: number;
  duration?: number;
  elevationGain?: number;
}
const getSmartCyclingRoute = getSmartCyclingRouteJs as (
  waypoints: ReadonlyArray<Coordinate>,
  options: Record<string, unknown>,
) => Promise<SmartRouteResult | null>;

export interface GravelWay {
  id: number;
  name: string | null;
  surface: 'gravel' | 'unpaved';
  coords: Coordinate[];
  midpoint: Coordinate;
  lengthKm: number;
  bearingFromStart: number;
  distFromStartKm: number;
}

export interface GravelChunk {
  wayId: number;
  name: string | null;
  entry: Coordinate;
  exit: Coordinate;
  lengthKm: number;
  midpoint: Coordinate;
}

export interface GravelLoopRoute {
  coordinates: Coordinate[];
  distanceKm: number;
  elevationGain: number;
  duration_s: number;
  name: string;
  source: 'gravel_network';
  gravelWaysUsed: string[];
  gravelChunkKm: number;
}

export interface BuildGravelParams {
  targetDistanceKm: number;
  bearingDeg: number;
  gravelTargetPct: number;
  goal?: string;
  count?: number;
}

// Tuning constants.
const MIN_WAY_KM = 0.2; // ignore driveway / parking-aisle stubs
const MIN_CHUNK_KM = 0.4;
const MAX_CHUNK_KM = 6;
const MAX_CHUNKS = 14; // → ≤30 waypoints, polite to BRouter
const BAND_HALF_DEG = 70; // keep ways within ±70° of the requested bearing
// Aim ~30% over the raw gravel budget (pavement connectors dilute the result),
// capped so gravel never tries to exceed 80% of the distance.
const BUDGET_OVERSHOOT = 1.3;
const BUDGET_DISTANCE_CAP = 0.8;
const BUCKET_OFFSETS = [-45, -20, 0, 20, 45];
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const GRAVEL_SURFACE_RE = 'gravel|fine_gravel|pebblestone|compacted|unpaved|dirt|earth|ground';

interface OverpassNode {
  lat: number;
  lon: number;
}
interface OverpassWay {
  type: string;
  id: number;
  geometry?: OverpassNode[];
  tags?: { surface?: string; name?: string };
}

/** Smallest absolute angle between two bearings, in [0, 180]. */
function angularDiff(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Summed great-circle length of a [lng,lat] polyline, in km. */
function polylineLengthKm(coords: ReadonlyArray<Coordinate>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    total += haversineKm(a[1], a[0], b[1], b[0]);
  }
  return total;
}

// ---- Overpass query for gravel ways (direction-limited bbox) -------------

const cache = new Map<string, GravelWay[]>();
const CACHE_MAX = 20;

function cacheKey(start: Coordinate, bearingDeg: number, radiusKm: number): string {
  const q = [
    Math.round(start[0] * 1e3) / 1e3,
    Math.round(start[1] * 1e3) / 1e3,
    Math.round(bearingDeg / 15) * 15,
    Math.round(radiusKm),
  ];
  return fnv1a32(stableJson(q));
}

export function clearGravelCache(): void {
  cache.clear();
}

/**
 * Find gravel/unpaved ways near `start`, biased toward `bearingDeg` out to
 * `radiusKm`. Returns canonical [lng,lat] geometries. Fail-soft → [].
 */
export async function findGravelWays(
  start: Coordinate,
  bearingDeg: number,
  radiusKm: number,
): Promise<GravelWay[]> {
  assertCoordinate(start, 'findGravelWays.start');

  const key = cacheKey(start, bearingDeg, radiusKm);
  const cached = cache.get(key);
  if (cached) {
    // LRU touch.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  // Direction-limited bbox: the start plus three points fanned out along the
  // requested bearing. A wedge toward the travel direction is ~4x cheaper
  // than a full radius circle.
  const corners: Coordinate[] = [
    start,
    destinationPoint(start, normalizeBearing(bearingDeg - 50), radiusKm),
    destinationPoint(start, normalizeBearing(bearingDeg), radiusKm),
    destinationPoint(start, normalizeBearing(bearingDeg + 50), radiusKm),
  ];
  const lngs = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const buf = 100 / 111000; // ~100m, matches surfaceOverlay
  const south = Math.min(...lats) - buf;
  const north = Math.max(...lats) + buf;
  const west = Math.min(...lngs) - buf;
  const east = Math.max(...lngs) + buf;
  const bbox = `${south},${west},${north},${east}`; // Overpass lat,lon order

  const query = `[out:json][timeout:15];(way["highway"]["surface"~"^(${GRAVEL_SURFACE_RE})$"](${bbox}););out geom;`;

  let elements: OverpassWay[];
  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    elements = Array.isArray(data.elements) ? data.elements : [];
  } catch {
    return [];
  }

  const ways: GravelWay[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const surface = classifySurface(el.tags?.surface);
    if (surface !== 'gravel' && surface !== 'unpaved') continue;

    // The one and only {lat,lon} → [lng,lat] conversion.
    const coords: Coordinate[] = el.geometry.map((n) => [n.lon, n.lat] as Coordinate);
    const lengthKm = polylineLengthKm(coords);
    if (lengthKm < MIN_WAY_KM) continue;

    const midpoint = coords[Math.floor(coords.length / 2)];
    const distFromStartKm = haversineKm(start[1], start[0], midpoint[1], midpoint[0]);
    if (distFromStartKm > radiusKm * 1.1) continue;

    ways.push({
      id: el.id,
      name: el.tags?.name ?? null,
      surface,
      coords,
      midpoint,
      lengthKm,
      bearingFromStart: bearingBetween(start, midpoint),
      distFromStartKm,
    });
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, ways);
  return ways;
}

// ---- Chunk extraction + loop construction --------------------------------

/** Index of the way vertex nearest to `target`. */
function nearestVertexIndex(coords: ReadonlyArray<Coordinate>, target: Coordinate): number {
  let bestIdx = 0;
  let bestKm = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(coords[i][1], coords[i][0], target[1], target[0]);
    if (d < bestKm) {
      bestKm = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Walk `coords` from `startIdx` in `step` direction up to `targetKm`. */
function walkFrom(
  coords: ReadonlyArray<Coordinate>,
  startIdx: number,
  step: 1 | -1,
  targetKm: number,
): { endIdx: number; lengthKm: number } {
  let acc = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i + step >= 0 && i + step < coords.length; i += step) {
    acc += haversineKm(coords[i][1], coords[i][0], coords[i + step][1], coords[i + step][0]);
    endIdx = i + step;
    if (acc >= targetKm) break;
  }
  return { endIdx, lengthKm: acc };
}

/**
 * Extract an entry→exit chunk of up to `remainingBudgetKm` (clamped) from a
 * way. When an `approach` point is given (the previous chunk's exit), the entry
 * starts at the nearest vertex to it and walks the direction with the longer
 * run — keeping consecutive chunks close so the router's pavement connectors
 * stay short. Two distinct points on the same way force the router to ride the
 * stretch between them.
 */
export function extractChunk(
  way: GravelWay,
  remainingBudgetKm: number,
  approach?: Coordinate,
): GravelChunk {
  const target = Math.min(Math.max(remainingBudgetKm, MIN_CHUNK_KM), MAX_CHUNK_KM, way.lengthKm);
  const { coords } = way;
  const startIdx = approach ? nearestVertexIndex(coords, approach) : 0;

  const fwd = walkFrom(coords, startIdx, 1, target);
  const bwd = walkFrom(coords, startIdx, -1, target);
  const pick = fwd.lengthKm >= bwd.lengthKm ? fwd : bwd;

  const entry = coords[startIdx];
  const exit = coords[pick.endIdx];
  const midpoint = coords[Math.round((startIdx + pick.endIdx) / 2)];
  return { wayId: way.id, name: way.name, entry, exit, lengthKm: pick.lengthKm, midpoint };
}

/** Preference score for a way (higher = better chunk seed). */
function wayPreference(way: GravelWay, radiusKm: number): number {
  // Peak preference for ways ~0.65 of the radius out (loop body, not the edge).
  const midBand = 1 - Math.min(1, Math.abs(way.distFromStartKm / radiusKm - 0.65) / 0.65);
  const lengthScore = Math.min(way.lengthKm, MAX_CHUNK_KM) / MAX_CHUNK_KM;
  const named = way.name ? 0.2 : 0;
  return midBand + 0.5 * lengthScore + named;
}

interface SelectParams {
  targetDistanceKm: number;
  bearingDeg: number;
  gravelTargetPct: number;
  orientation: 'cw' | 'ccw';
  radiusKm: number;
}

/**
 * Select & order gravel chunks so the route heads in `bearingDeg`, progresses
 * around a loop, and sums gravel length ≈ gravelTargetPct × targetDistanceKm.
 * Returns chunks already in loop order; [] only when no usable ways.
 */
export function selectChunksForLoop(
  start: Coordinate,
  ways: GravelWay[],
  params: SelectParams,
): GravelChunk[] {
  const { targetDistanceKm, bearingDeg, gravelTargetPct, orientation, radiusKm } = params;
  // Overshoot: connectors dilute gravel, so aim above the raw budget (capped).
  const budgetKm =
    Math.min((gravelTargetPct / 100) * BUDGET_OVERSHOOT, BUDGET_DISTANCE_CAP) * targetDistanceKm;

  // Keep ways in the requested half of the compass.
  const inBand = ways.filter((w) => angularDiff(w.bearingFromStart, bearingDeg) <= BAND_HALF_DEG);
  if (inBand.length === 0) return [];

  // Bucket by nearest sub-bearing offset; sort each bucket by preference. The
  // buckets give the loop a spatial spread; chaining (below) keeps it ordered.
  const buckets = new Map<number, GravelWay[]>();
  for (const w of inBand) {
    const rel = ((w.bearingFromStart - bearingDeg + 540) % 360) - 180; // [-180,180)
    let nearest = BUCKET_OFFSETS[0];
    for (const off of BUCKET_OFFSETS) {
      if (Math.abs(rel - off) < Math.abs(rel - nearest)) nearest = off;
    }
    if (!buckets.has(nearest)) buckets.set(nearest, []);
    buckets.get(nearest)!.push(w);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => wayPreference(b, radiusKm) - wayPreference(a, radiusKm));
  }
  const order = [...BUCKET_OFFSETS].sort((a, b) => (orientation === 'cw' ? a - b : b - a));

  // Candidate set: best per bucket, round-robin in orientation order, so the
  // pool spans the loop arc without over-picking one direction.
  const pool: GravelWay[] = [];
  const pooled = new Set<number>();
  for (let pass = 0; pass < MAX_CHUNKS && pool.length < MAX_CHUNKS; pass++) {
    let added = false;
    for (const off of order) {
      const list = buckets.get(off);
      if (!list) continue;
      const next = list.find((w) => !pooled.has(w.id));
      if (!next) continue;
      pooled.add(next.id);
      pool.push(next);
      added = true;
      if (pool.length >= MAX_CHUNKS) break;
    }
    if (!added) break;
  }

  // Chain greedily by proximity: from the current point, take the unused pool
  // way whose nearest endpoint is closest, and extract its chunk approaching
  // from that point. Minimises pavement connectors → higher gravel %.
  const chunks: GravelChunk[] = [];
  const used = new Set<number>();
  let current: Coordinate = start;
  let accumulated = 0;
  while (accumulated < budgetKm && chunks.length < MAX_CHUNKS) {
    let best: GravelWay | null = null;
    let bestGapKm = Infinity;
    for (const w of pool) {
      if (used.has(w.id)) continue;
      const gap = Math.min(
        haversineKm(w.coords[0][1], w.coords[0][0], current[1], current[0]),
        haversineKm(
          w.coords[w.coords.length - 1][1],
          w.coords[w.coords.length - 1][0],
          current[1],
          current[0],
        ),
      );
      if (gap < bestGapKm) {
        bestGapKm = gap;
        best = w;
      }
    }
    if (!best) break;
    used.add(best.id);
    const chunk = extractChunk(best, budgetKm - accumulated, current);
    chunks.push(chunk);
    accumulated += chunk.lengthKm;
    current = chunk.exit;
  }
  return chunks;
}

/** "Gravel via Nelson Rd & 75th St" from the OSM names actually ridden. */
export function buildGravelName(usedNames: string[]): string {
  const distinct = [...new Set(usedNames.filter(Boolean))];
  if (distinct.length === 0) return 'Gravel loop';
  if (distinct.length === 1) return `Gravel via ${distinct[0]}`;
  return `Gravel via ${distinct[0]} & ${distinct[1]}`;
}

/**
 * Build up to `count` gravel-network loop candidates. One Overpass query is
 * shared across all variants; each variant routes through real gravel chunks.
 * Returns [] when there isn't enough gravel near the start (caller falls back).
 */
export async function buildGravelLoopCandidates(
  start: Coordinate,
  params: BuildGravelParams,
): Promise<GravelLoopRoute[]> {
  assertCoordinate(start, 'buildGravelLoopCandidates.start');
  const { targetDistanceKm, bearingDeg, gravelTargetPct, goal = 'endurance', count = 3 } = params;

  const radiusKm = Math.min(25, Math.max(3, (targetDistanceKm / (2 * Math.PI)) * 1.3));
  const ways = await findGravelWays(start, bearingDeg, radiusKm);
  if (ways.length === 0) return [];

  const allVariants: Array<{ subBearing: number; orientation: 'cw' | 'ccw' }> = [
    { subBearing: bearingDeg, orientation: 'cw' },
    { subBearing: normalizeBearing(bearingDeg + 25), orientation: 'ccw' },
    { subBearing: normalizeBearing(bearingDeg - 25), orientation: 'cw' },
  ];
  const variants = allVariants.slice(0, count);

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const results: GravelLoopRoute[] = [];
  const seen = new Set<string>();

  for (const variant of variants) {
    const chunks = selectChunksForLoop(start, ways, {
      targetDistanceKm,
      bearingDeg: variant.subBearing,
      gravelTargetPct,
      orientation: variant.orientation,
      radiusKm,
    });
    if (chunks.length === 0) continue;

    const waypoints: Coordinate[] = [start];
    for (const c of chunks) {
      assertCoordinate(c.entry, 'gravelChunk.entry');
      assertCoordinate(c.exit, 'gravelChunk.exit');
      waypoints.push(c.entry, c.exit);
    }
    waypoints.push(start);

    let route: SmartRouteResult | null = null;
    try {
      route = await getSmartCyclingRoute(waypoints, {
        profile: 'gravel',
        trainingGoal: goal,
        mapboxToken,
      });
    } catch {
      route = null;
    }
    if (!route?.coordinates || route.coordinates.length < 10) continue;

    const gravelWaysUsed = [...new Set(chunks.map((c) => c.name).filter((n): n is string => !!n))];
    const dedupeKey = gravelWaysUsed.slice(0, 2).join('|');
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);

    results.push({
      coordinates: route.coordinates,
      distanceKm: parseFloat(M_TO_KM(route.distance_m ?? route.distance ?? 0).toFixed(1)),
      elevationGain: route.elevationGain ?? 0,
      duration_s: route.duration_s ?? route.duration ?? 0,
      name: buildGravelName(chunks.map((c) => c.name ?? '')),
      source: 'gravel_network',
      gravelWaysUsed,
      gravelChunkKm: chunks.reduce((sum, c) => sum + c.lengthKm, 0),
    });
    if (results.length >= count) break;
  }

  return results;
}
