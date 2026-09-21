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
 * Gravel is found by tag OR inferred (surfaceInference.ts): `surface=gravel`
 * and friends, `tracktype=grade2..5`, and untagged `highway=track`, so the
 * county roads OSM never got round to tagging still count. No direction is
 * needed: without one the search is a full circle and the loop heads
 * wherever the most gravel is.
 *
 * Two ways to find them: an Overpass bbox query (complete, carries road
 * names) and, when the public mirrors fail or come back empty, BRouter
 * itself: gravel-profile spokes out from the start whose tag rows say what
 * unpaved roads it rode. The spokes cost a few short routing calls and work
 * whenever routing does.
 *
 * Pure compute, fail-soft (any Overpass/routing failure returns []), no React
 * or store access. Coordinates are canonical [lng, lat] per src/types/geo.ts;
 * Overpass {lat,lon} is converted once at the parse boundary in findGravelWays.
 */

import { getSmartCyclingRoute as getSmartCyclingRouteJs } from './smartCyclingRouter';
import { inferSurface } from './surfaceInference';
import { fetchOverpassElements } from './overpassClient';
import { elementsToTaggedWays } from './roadAttributes';
import { getBRouterDirections as getBRouterDirectionsJs, BROUTER_PROFILES } from './brouter';
import {
  calculateDestinationPoint as calculateDestinationPointJs,
  calculateBearing as calculateBearingJs,
  normalizeBearing as normalizeBearingJs,
} from './iterativeRouteBuilder';
import { haversineKm } from './distanceUnits';
import { fnv1a32, stableJson } from './stableHash';
import { clipLoopGeometry } from './clipLoopGeometry';
import { assertCoordinate, type Coordinate } from '../types/geo';
import type { TaggedWay } from './wayTags';

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
  /** Per-segment OSM tags when BRouter routed it (wayTags.ts). */
  taggedWays?: TaggedWay[];
}
const getSmartCyclingRoute = getSmartCyclingRouteJs as (
  waypoints: ReadonlyArray<Coordinate>,
  options: Record<string, unknown>,
) => Promise<SmartRouteResult | null>;
const getBRouterDirections = getBRouterDirectionsJs as unknown as (
  waypoints: Array<[number, number]>,
  options: { profile: string },
) => Promise<{ taggedWays?: TaggedWay[] | null } | null>;

export interface GravelWay {
  id: number;
  name: string | null;
  surface: 'gravel' | 'unpaved';
  /** 0.95 when `surface=*` says so, lower when inferred (surfaceInference.ts). */
  confidence: number;
  /** The deciding tag, e.g. `surface=gravel`, `tracktype=grade3`. */
  evidence: string;
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
  /** Bearing the loop heads out on (requested, or chosen from where the gravel is). */
  bearingDeg: number;
  gravelWaysUsed: string[];
  gravelChunkKm: number;
  /**
   * Surface-tagged ways from the router (BRouter), matched spatially so they
   * survive the loop clip below. Lets surface measurement skip Overpass.
   */
  taggedWays: TaggedWay[];
}

export interface BuildGravelParams {
  targetDistanceKm: number;
  /** null = no direction asked: search all round and head where the gravel is. */
  bearingDeg: number | null;
  gravelTargetPct: number;
  goal?: string;
  count?: number;
  /** Router preferences (traffic tolerance etc.), forwarded to the smart router. */
  preferences?: Record<string, unknown> | null;
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
const GRAVEL_SURFACE_RE = 'gravel|fine_gravel|pebblestone|compacted|unpaved|dirt|earth|ground';
/** Overpass gets this long per mirror. */
const OVERPASS_TIMEOUT_MS = 8000;
/** If Overpass has not answered by then, the BRouter spokes start alongside it. */
export const PROBE_AFTER_MS = 3000;
/** BRouter probe spokes: all round, or fanned about the requested heading. */
const PROBE_SPOKES_ALL = [0, 45, 90, 135, 180, 225, 270, 315];
const PROBE_SPOKE_OFFSETS = [-50, -25, 0, 25, 50];
/** Spokes reach this share of the search radius (the loop body, not its edge). */
const PROBE_REACH = 0.7;
/**
 * A chunk chain whose straight-line length is under this share of the target
 * gets loop apex waypoints added (roads wiggle, so 0.8× straight ≈ 1× ridden).
 */
const LOOP_PAD_TARGET = 0.8;
/** Apex headings relative to the loop's bearing, in orientation order. */
const LOOP_APEX_OFFSETS = [-40, 0, 40];
/** Compass step when choosing a heading from where the gravel is. */
const HEADING_STEP_DEG = 30;
/** Chosen headings are at least this far apart so the variants differ. */
const HEADING_MIN_SEPARATION_DEG = 60;

/** Smallest absolute angle between two bearings, in [0, 180]. */
function angularDiff(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Summed great-circle length of a [lng,lat] polyline, in km. */
export function polylineLengthKm(coords: ReadonlyArray<Coordinate>): number {
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

function cacheKey(start: Coordinate, bearingDeg: number | null, radiusKm: number): string {
  const q = [
    Math.round(start[0] * 1e3) / 1e3,
    Math.round(start[1] * 1e3) / 1e3,
    bearingDeg === null ? 'any' : Math.round(bearingDeg / 15) * 15,
    Math.round(radiusKm),
  ];
  return fnv1a32(stableJson(q));
}

export function clearGravelCache(): void {
  cache.clear();
}

/** Search radius for a loop of `targetDistanceKm`: a bit over the loop's own radius. */
export function gravelRadiusKm(targetDistanceKm: number): number {
  return Math.min(25, Math.max(3, (targetDistanceKm / (2 * Math.PI)) * 1.3));
}

/**
 * Find gravel/unpaved ways near `start` out to `radiusKm`: a wedge toward
 * `bearingDeg`, or all round when no direction was asked (null). Tagged AND
 * inferred gravel (tracktype, untagged tracks) both count, with the
 * inference's confidence carried on each way. Returns canonical [lng,lat]
 * geometries. Fail-soft → [].
 */
export async function findGravelWays(
  start: Coordinate,
  bearingDeg: number | null,
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

  // With a direction: the start plus three points fanned out along it (a
  // wedge is ~4x cheaper than the full circle). Without: the full circle.
  const corners: Coordinate[] =
    bearingDeg === null
      ? [0, 90, 180, 270].map((b) => destinationPoint(start, b, radiusKm))
      : [
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

  // Tagged gravel, graded tracks, and untagged tracks; surfaceInference
  // decides which of them are really unpaved.
  const query =
    `[out:json][timeout:20];(` +
    `way["highway"]["surface"~"^(${GRAVEL_SURFACE_RE})$"](${bbox});` +
    `way["highway"]["tracktype"~"^grade[2-5]$"](${bbox});` +
    `way["highway"="track"][!"surface"](${bbox});` +
    `);out geom;`;

  const viaOverpass: Promise<GravelWay[]> = fetchOverpassElements(query, {
    timeoutMs: OVERPASS_TIMEOUT_MS,
  })
    .then((elements) => gravelWaysFromTagged(start, radiusKm, elementsToTaggedWays(elements)))
    .catch(() => []);

  // Overpass is complete and carries names, so it gets first call; but the
  // public mirrors are slow or down often enough that the BRouter spokes
  // start after PROBE_AFTER_MS and whichever finds gravel first wins.
  let ways = await withDeadline(viaOverpass, PROBE_AFTER_MS);
  if (!ways || ways.length === 0) {
    ways = await firstNonEmpty([viaOverpass, probeGravelWaysWithBRouter(start, bearingDeg, radiusKm)]);
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, ways);
  return ways;
}

/** Resolves with the promise's value, or null once `ms` has passed first. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** The first of the promises to resolve non-empty; [] once all have settled empty. */
function firstNonEmpty<T>(promises: Array<Promise<T[]>>): Promise<T[]> {
  return new Promise((resolve) => {
    let pending = promises.length;
    for (const p of promises) {
      p.then((v) => (v.length > 0 ? resolve(v) : undefined))
        .catch(() => undefined)
        .finally(() => {
          pending -= 1;
          if (pending === 0) resolve([]);
        });
    }
  });
}

/**
 * Tagged ways → GravelWay, keeping only gravel/unpaved verdicts of usable
 * length inside the radius. Overpass ids are positive; BRouter runs carry
 * sequential negative ids (wayTags.ts) so the two never collide.
 */
function gravelWaysFromTagged(
  start: Coordinate,
  radiusKm: number,
  tagged: ReadonlyArray<TaggedWay>,
  seen: Set<string> = new Set(),
): GravelWay[] {
  const ways: GravelWay[] = [];
  for (const el of tagged) {
    const inference = inferSurface(el.tags);
    if (inference.category !== 'gravel' && inference.category !== 'unpaved') continue;

    // BRouter geometry carries elevation as a third element; chunk entry /
    // exit points must be plain [lng, lat] for the router and the coord
    // contract.
    const coords: Coordinate[] = el.geometry.map(([lng, lat]) => [lng, lat] as Coordinate);
    const lengthKm = polylineLengthKm(coords);
    if (lengthKm < MIN_WAY_KM) continue;

    const midpoint = coords[Math.floor(coords.length / 2)];
    const dedupe = `${midpoint[0].toFixed(4)},${midpoint[1].toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    const distFromStartKm = haversineKm(start[1], start[0], midpoint[1], midpoint[0]);
    if (distFromStartKm > radiusKm * 1.1) continue;
    seen.add(dedupe);

    ways.push({
      id: el.id,
      name: el.tags.name ?? null,
      surface: inference.category,
      confidence: inference.confidence,
      evidence: inference.detail,
      coords,
      midpoint,
      lengthKm,
      bearingFromStart: bearingBetween(start, midpoint),
      distFromStartKm,
    });
  }
  return ways;
}

/**
 * Gravel ways found by riding out from `start` with BRouter's gravel
 * profile: eight spokes all round, or five fanned about `bearingDeg`. Each
 * spoke's tag rows name the unpaved roads it rode; duplicates across spokes
 * collapse on their midpoint. Sequential and fail-soft: a failed spoke is
 * skipped. Exported for tests.
 */
export async function probeGravelWaysWithBRouter(
  start: Coordinate,
  bearingDeg: number | null,
  radiusKm: number,
): Promise<GravelWay[]> {
  const bearings =
    bearingDeg === null
      ? PROBE_SPOKES_ALL
      : PROBE_SPOKE_OFFSETS.map((o) => normalizeBearing(bearingDeg + o));
  const seen = new Set<string>();
  const ways: GravelWay[] = [];
  for (const b of bearings) {
    const end = destinationPoint(start, b, radiusKm * PROBE_REACH);
    let tagged: TaggedWay[] | null | undefined;
    try {
      const route = await getBRouterDirections(
        [
          [start[0], start[1]],
          [end[0], end[1]],
        ],
        { profile: BROUTER_PROFILES.GRAVEL },
      );
      tagged = route?.taggedWays;
    } catch {
      tagged = null;
    }
    if (!Array.isArray(tagged) || tagged.length === 0) continue;
    for (const w of gravelWaysFromTagged(start, radiusKm, tagged, seen)) {
      ways.push({ ...w, id: -(ways.length + 1) });
    }
  }
  return ways;
}

export interface GravelHeading {
  bearingDeg: number;
  /** Gravel km within the selection band of that heading. */
  gravelKm: number;
  /** Ranking score: km weighted toward the heading's centre. */
  score: number;
}

/**
 * The `count` headings with the most gravel in their band, at least
 * HEADING_MIN_SEPARATION_DEG apart, best first. Gravel counts more the
 * closer it sits to the heading, so the pick centres on the cluster rather
 * than clipping its edge. Used when the rider named no direction, and to
 * say where the gravel is when a loop came up short. [] when there is no
 * gravel at all.
 */
export function bestGravelHeadings(ways: ReadonlyArray<GravelWay>, count: number): GravelHeading[] {
  const scored: GravelHeading[] = [];
  for (let b = 0; b < 360; b += HEADING_STEP_DEG) {
    let km = 0;
    let score = 0;
    for (const w of ways) {
      const diff = angularDiff(w.bearingFromStart, b);
      if (diff > BAND_HALF_DEG) continue;
      km += w.lengthKm;
      score += w.lengthKm * (1 - diff / BAND_HALF_DEG);
    }
    if (km > 0) scored.push({ bearingDeg: b, gravelKm: km, score });
  }
  scored.sort((a, b) => b.score - a.score || a.bearingDeg - b.bearingDeg);
  const chosen: GravelHeading[] = [];
  for (const h of scored) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => angularDiff(c.bearingDeg, h.bearingDeg) >= HEADING_MIN_SEPARATION_DEG)) {
      chosen.push(h);
    }
  }
  return chosen;
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
  // A way OSM says is gravel outranks one we only inferred.
  const sure = 0.3 * (way.confidence ?? 0);
  return midBand + 0.5 * lengthScore + named + sure;
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

/** Straight-line length of a waypoint chain, km. */
function chainKm(waypoints: ReadonlyArray<Coordinate>): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += haversineKm(waypoints[i - 1][1], waypoints[i - 1][0], waypoints[i][1], waypoints[i][0]);
  }
  return total;
}

/**
 * When the gravel near the start is thin, the chunk chain hugs the start and
 * the routed loop comes back far shorter than asked. Pad it with up to three
 * apex waypoints on a circle of the target loop's radius, each inserted
 * where it lengthens the chain least, until the chain is about target-sized.
 * The gravel chunks stay in order; the router threads the apexes between
 * them. Exported for tests.
 */
export function padLoopWaypoints(
  start: Coordinate,
  waypoints: ReadonlyArray<Coordinate>,
  targetDistanceKm: number,
  bearingDeg: number,
  orientation: 'cw' | 'ccw',
): Coordinate[] {
  const wps = [...waypoints];
  const loopRadiusKm = targetDistanceKm / (2 * Math.PI);
  const offsets = orientation === 'cw' ? LOOP_APEX_OFFSETS : [...LOOP_APEX_OFFSETS].reverse();
  for (const off of offsets) {
    if (chainKm(wps) >= LOOP_PAD_TARGET * targetDistanceKm) break;
    const apex = destinationPoint(start, normalizeBearing(bearingDeg + off), loopRadiusKm);
    let bestI = 1;
    let bestCost = Infinity;
    for (let i = 1; i < wps.length; i++) {
      const a = wps[i - 1];
      const b = wps[i];
      const cost =
        haversineKm(a[1], a[0], apex[1], apex[0]) +
        haversineKm(apex[1], apex[0], b[1], b[0]) -
        haversineKm(a[1], a[0], b[1], b[0]);
      if (cost < bestCost) {
        bestCost = cost;
        bestI = i;
      }
    }
    wps.splice(bestI, 0, apex);
  }
  return wps;
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
 * `bearingDeg` null means no direction was asked. Returns [] when there
 * isn't enough gravel near the start (caller falls back).
 */
export async function buildGravelLoopCandidates(
  start: Coordinate,
  params: BuildGravelParams,
): Promise<GravelLoopRoute[]> {
  assertCoordinate(start, 'buildGravelLoopCandidates.start');
  const {
    targetDistanceKm,
    bearingDeg,
    gravelTargetPct,
    goal = 'endurance',
    count = 3,
    preferences = null,
  } = params;

  const radiusKm = gravelRadiusKm(targetDistanceKm);
  const ways = await findGravelWays(start, bearingDeg, radiusKm);
  if (ways.length === 0) return [];

  // With a direction: that heading and two offsets. Without: the headings
  // with the most gravel, so the loop goes where the gravel is.
  const allVariants: Array<{ subBearing: number; orientation: 'cw' | 'ccw' }> =
    bearingDeg !== null
      ? [
          { subBearing: bearingDeg, orientation: 'cw' },
          { subBearing: normalizeBearing(bearingDeg + 25), orientation: 'ccw' },
          { subBearing: normalizeBearing(bearingDeg - 25), orientation: 'cw' },
        ]
      : bestGravelHeadings(ways, count).map((h, i) => ({
          subBearing: h.bearingDeg,
          orientation: i % 2 === 0 ? ('cw' as const) : ('ccw' as const),
        }));
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

    const chain: Coordinate[] = [start];
    for (const c of chunks) {
      assertCoordinate(c.entry, 'gravelChunk.entry');
      assertCoordinate(c.exit, 'gravelChunk.exit');
      chain.push(c.entry, c.exit);
    }
    chain.push(start);
    const waypoints = padLoopWaypoints(
      start,
      chain,
      targetDistanceKm,
      variant.subBearing,
      variant.orientation,
    );

    let route: SmartRouteResult | null = null;
    try {
      route = await getSmartCyclingRoute(waypoints, {
        profile: 'gravel',
        trainingGoal: goal,
        preferences,
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

    // Clip out-and-back spurs the gravel-seeking router left behind, then
    // recompute distance from the clipped geometry (the router's distance_m
    // is now stale). Elevation + gravel % are re-measured downstream.
    const clipped = clipLoopGeometry(route.coordinates);
    results.push({
      coordinates: clipped,
      distanceKm: parseFloat(polylineLengthKm(clipped).toFixed(1)),
      elevationGain: route.elevationGain ?? 0,
      duration_s: route.duration_s ?? route.duration ?? 0,
      name: buildGravelName(chunks.map((c) => c.name ?? '')),
      source: 'gravel_network',
      bearingDeg: variant.subBearing,
      gravelWaysUsed,
      gravelChunkKm: chunks.reduce((sum, c) => sum + c.lengthKm, 0),
      taggedWays: route.taggedWays ?? [],
    });
    if (results.length >= count) break;
  }

  return results;
}
