/**
 * Routing engines the comfort harness can drive, plus the BRouter tag
 * re-ride the validator needs for engines that don't report way tags.
 *
 * Node-only (the harness). The browser equivalents are `src/utils/brouter.js`
 * and `src/utils/brouterTrace.ts`; this file talks HTTP directly so a run
 * doesn't depend on the browser client's circuit breaker, localStorage
 * profile cache or `import.meta.env`.
 */

import type { Coordinate } from '../../src/types/geo';
import type { TaggedWay } from '../../src/utils/wayTags';
import { taggedWaysFromBRouterProperties } from '../../src/utils/wayTags';
import { renderTribosProfile, type TribosParams } from '../../src/utils/brouterProfiles';
import { toleranceForComfortLevel, type ComfortLevel } from '../../src/utils/comfortLevels';
import { haversineMeters } from '../../src/utils/distanceUnits';

export type EngineName = 'stadia' | 'brouter-stock' | 'brouter-tribos';
export type Surface = 'road' | 'gravel';

export interface EngineRoute {
  coordinates: Coordinate[];
  distance_m: number;
  /** Way tags reported by the engine itself, when complete enough to validate. */
  taggedWays: TaggedWay[] | null;
}

export interface EngineVariant {
  /** Stable id for caching one generation across the comfort levels that share it. */
  id: string;
  /** What the engine was asked for, recorded in the results. */
  describe: string;
}

export interface Engine {
  name: EngineName;
  /** The request variant a comfort level maps to (engines with three settings share one across levels). */
  variant(surface: Surface, level: ComfortLevel): EngineVariant;
  route(waypoints: Coordinate[], surface: Surface, level: ComfortLevel): Promise<EngineRoute>;
}

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);

export const BROUTER_BASE = (env('BROUTER_URL') || env('VITE_BROUTER_URL') || 'https://brouter.de').replace(/\/+$/, '');

const profileIds = new Map<string, string>();

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export async function uploadProfile(text: string): Promise<string> {
  const cached = profileIds.get(text);
  if (cached) return cached;
  const resp = await fetchWithTimeout(`${BROUTER_BASE}/brouter/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  }, 30_000);
  if (!resp.ok) throw new Error(`profile upload ${resp.status}`);
  const data = (await resp.json()) as { profileid?: string; error?: string };
  if (!data.profileid) throw new Error(`profile upload: ${data.error ?? 'no id'}`);
  profileIds.set(text, data.profileid);
  return data.profileid;
}

interface BRouterResult {
  coordinates: Coordinate[];
  distance_m: number;
  properties: Record<string, unknown>;
}

/** The server asked us to slow down; not a routing answer. */
export class ThrottledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThrottledError';
  }
}

export function isThrottled(err: unknown): boolean {
  return err instanceof Error && err.name === 'ThrottledError';
}

/** Backoff schedule for a throttled server (brouter.de answers 403 "Please, retry later!"). */
const THROTTLE_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function brouterRoute(waypoints: ReadonlyArray<Coordinate>, profile: string): Promise<BRouterResult> {
  const lonlats = waypoints.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join('|');
  const url = `${BROUTER_BASE}/brouter?lonlats=${lonlats}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`;
  let resp: Response;
  let text: string;
  for (let attempt = 0; ; attempt++) {
    resp = await fetchWithTimeout(url);
    text = await resp.text();
    const throttled = resp.status === 429 || resp.status === 503 || (resp.status === 403 && /retry later/i.test(text));
    if (!throttled) break;
    if (attempt >= THROTTLE_BACKOFF_MS.length) throw new ThrottledError(`brouter ${resp.status}: ${text.slice(0, 80).trim()}`);
    console.warn(`  throttled by ${BROUTER_BASE}; waiting ${THROTTLE_BACKOFF_MS[attempt] / 1000}s`);
    await sleep(THROTTLE_BACKOFF_MS[attempt]);
  }
  if (!resp.ok) throw new Error(`brouter ${resp.status}: ${text.slice(0, 160).trim()}`);
  let json: { features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: Record<string, unknown> }> };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`brouter: ${text.slice(0, 160).trim()}`);
  }
  const f = json.features?.[0];
  const coords = (f?.geometry?.coordinates ?? []).map((c) => [c[0], c[1]] as Coordinate);
  if (coords.length < 2) throw new Error('brouter: empty route');
  const props = f?.properties ?? {};
  return { coordinates: coords, distance_m: Number(props['track-length']) || 0, properties: props };
}

function tribosParams(surface: Surface, level: ComfortLevel): TribosParams {
  return surface === 'gravel'
    ? { template: 'gravel', comfort_level: level, gravel_target: 0.5 }
    : { template: 'road', comfort_level: level };
}

/** Today's BRouter fallback: `selectBRouterProfile('endurance', surface, tolerance)` in brouter.js. */
function stockProfile(surface: Surface, level: ComfortLevel): string {
  if (surface === 'gravel') return 'gravel';
  if (toleranceForComfortLevel(level) === 'low') return 'safety';
  return 'trekking';
}

const brouterStock: Engine = {
  name: 'brouter-stock',
  variant(surface, level) {
    const p = stockProfile(surface, level);
    return { id: p, describe: `brouter ${p}` };
  },
  async route(waypoints, surface, level) {
    const r = await brouterRoute(waypoints, stockProfile(surface, level));
    // Stock profiles don't read maxspeed/lanes/shoulder, so BRouter omits
    // them from WayTags: the tags are incomplete for classing.
    return { coordinates: r.coordinates, distance_m: r.distance_m, taggedWays: null };
  },
};

const brouterTribos: Engine = {
  name: 'brouter-tribos',
  variant(surface, level) {
    const p = tribosParams(surface, level);
    return { id: `tribos-${p.template}-c${p.comfort_level}`, describe: `tribos-${p.template} comfort_level=${p.comfort_level}` };
  },
  async route(waypoints, surface, level) {
    const id = await uploadProfile(withTagProbe(renderTribosProfile(tribosParams(surface, level))));
    const r = await brouterRoute(waypoints, id);
    // The Tribos profiles read every tag the classifier needs.
    const ways = taggedWaysFromBRouterProperties(r.coordinates, r.properties);
    return { coordinates: r.coordinates, distance_m: r.distance_m, taggedWays: ways.length ? ways : null };
  },
};

async function stadiaEngine(): Promise<Engine> {
  const key = env('STADIA_API_KEY') || env('VITE_STADIA_API_KEY');
  if (!key) throw new Error('stadia engine needs STADIA_API_KEY (or VITE_STADIA_API_KEY)');
  // The production client, so the baseline measures exactly today's costing.
  const { getStadiaMapsRoute } = await import('../../src/utils/stadiaMapsRouter.js');
  return {
    name: 'stadia',
    variant(surface, level) {
      const tolerance = toleranceForComfortLevel(level);
      return { id: `${surface}-${tolerance}`, describe: `stadia ${surface} trafficTolerance=${tolerance}` };
    },
    async route(waypoints, surface, level) {
      const tolerance = toleranceForComfortLevel(level);
      const r = await getStadiaMapsRoute(waypoints, {
        profile: surface === 'gravel' ? 'gravel' : 'road',
        preferences: { trafficTolerance: tolerance },
        trainingGoal: 'endurance',
      });
      const coords = ((r?.coordinates ?? []) as number[][]).map((c) => [c[0], c[1]] as Coordinate);
      if (coords.length < 2) throw new Error('stadia: empty route');
      return { coordinates: coords, distance_m: Number(r.distance_m ?? r.distance) || 0, taggedWays: null };
    },
  };
}

export async function createEngine(name: EngineName): Promise<Engine> {
  if (name === 'brouter-stock') return brouterStock;
  if (name === 'brouter-tribos') return brouterTribos;
  if (name === 'stadia') return stadiaEngine();
  throw new Error(`unknown engine ${name}`);
}

// ── Tag re-ride ─────────────────────────────────────────────────────────

/** Vias every this many metres along the line. */
export const TRACE_SPACING_M = 750;
/** Vias per BRouter request. */
export const TRACE_CHUNK_VIAS = 40;

/**
 * The profile used to read tags along a line drawn by another engine:
 * Tribos road at "direct", so it follows the drawn line between vias rather
 * than detouring to quieter roads, and it reads maxspeed/lanes/shoulder.
 */
export function traceProfileText(): string {
  // Comfort 5 so it follows the drawn line rather than detouring, and with
  // closed-to-bikes access softened back to "walk your bike": the re-ride
  // has to travel the closed road to report it as class X, or the validator
  // would see it as merely unconfirmed.
  const text = renderTribosProfile({ template: 'road', comfort_level: 5 });
  const softened = text.replace(/(else if or bicycle=no\|private\|use_sidepath .* then )10000/, '$14');
  if (softened === text) throw new Error('trace profile: closed-to-bikes rule not found');
  return withTagProbe(softened);
}

/**
 * BRouter reports in `WayTags` only the keys the profile reads. The Tribos
 * profiles read `shoulder` but not the side-specific keys, so this adds
 * unused assignments that reference them. Costs are unchanged.
 */
export const TAG_PROBE_KEYS = ['shoulder:right', 'sidewalk:bicycle', 'cycleway:right:lane', 'estimated_town_class'];

export function withTagProbe(profileText: string): string {
  const probe = [
    '# comfort-harness tag probe: read-only references so BRouter reports these keys.',
    'assign comfort_probe_shoulder_right = shoulder:right=yes',
    'assign comfort_probe_sidewalk_bicycle = sidewalk:bicycle=yes',
    'assign comfort_probe_cycleway_right_lane = cycleway:right:lane=exclusive',
    'assign comfort_probe_town = estimated_town_class=1',
  ].join('\n');
  return profileText.replace(/^(---context:way.*)$/m, `$1\n${probe}`);
}

function viasAlong(coordinates: ReadonlyArray<Coordinate>, spacingM: number): Coordinate[] {
  const vias: Coordinate[] = [coordinates[0]];
  let acc = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    acc += haversineMeters(a[1], a[0], b[1], b[0]);
    if (acc >= spacingM) {
      vias.push(b);
      acc = 0;
    }
  }
  const last = coordinates[coordinates.length - 1];
  const tail = vias[vias.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) vias.push(last);
  return vias;
}

/**
 * Tagged ways along `coordinates`, by re-riding it with BRouter in chunks.
 * The ways carry the re-ride's geometry; the validator matches them back
 * onto the original line within the snap radius, so a chunk that took a
 * parallel road leaves those segments unknown rather than mis-classed.
 */
export async function traceTaggedWays(coordinates: ReadonlyArray<Coordinate>): Promise<{ ways: TaggedWay[]; calls: number }> {
  const profile = await uploadProfile(traceProfileText());
  const vias = viasAlong(coordinates, TRACE_SPACING_M);
  const ways: TaggedWay[] = [];
  let calls = 0;
  for (let start = 0; start < vias.length - 1; start += TRACE_CHUNK_VIAS - 1) {
    const chunk = vias.slice(start, start + TRACE_CHUNK_VIAS);
    if (chunk.length < 2) break;
    calls++;
    try {
      const r = await brouterRoute(chunk, profile);
      for (const w of taggedWaysFromBRouterProperties(r.coordinates, r.properties)) {
        ways.push({ ...w, id: -(ways.length + 1) });
      }
    } catch (err) {
      // Throttling isn't data: fail the generation so a resume retries it.
      if (isThrottled(err)) throw err;
      // A failed chunk leaves its segments unmatched → unknown. Never a pass.
      console.warn(`  trace chunk ${calls} failed: ${(err as Error).message}`);
    }
  }
  return { ways, calls };
}
