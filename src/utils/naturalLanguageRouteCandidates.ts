/**
 * naturalLanguageRouteCandidates — multi-candidate natural-language route
 * generation for the RB2 coach chat.
 *
 * Parses the request once (one Claude call via `parseRouteRequest`), then
 * builds up to three route variants with the iterative builder — same center
 * bearing clockwise and counterclockwise, plus an offset-bearing variant —
 * scores them against the request (distance accuracy, direction match,
 * familiarity) and returns them best-first as `RouteSnapshot`-carrying
 * candidates ready for the `aiSuggestions` store.
 *
 * Branches with nothing to vary (named waypoints, familiar-roads seeding,
 * the non-iterative fallback) delegate to the existing single-route pipeline
 * and return one candidate.
 */

import {
  parseRouteRequest,
  generateRouteFromParsedRequest,
  routeThroughWaypoints,
} from './naturalLanguageRouteBuilder';
import {
  generateIterativeRoute,
  resolveBearing,
  getDirectionName,
} from './iterativeRouteBuilder';
import {
  buildRoutePlanningPrompt,
  parseRoutePlanningResponse,
} from './naturalLanguagePrompt';
import { buildGravelLoopCandidates, type GravelLoopRoute } from './gravelRouteBuilder';
import { getAuthHeaders } from './authHeaders';
import { reverseGeocodeRegion } from './geocoding.js';
import { measureGravelPct } from './surfaceMeasurement';
import { scoreRoutePreference } from './routeScoring';
import { calculateBearing } from './routeUtils';
import { haversineKm } from './distanceUnits';
import { enrichRouteElevation } from '../hooks/route-builder/elevationEnrichment';
import { snapshotFromGeneratedRoute } from '../hooks/route-builder/routeSnapshot';
import type { Coordinate, RouteSnapshot } from '../hooks/route-builder/types';

export type LoopOrientation = 'cw' | 'ccw';

export interface RouteCandidate {
  snapshot: RouteSnapshot;
  name: string;
  /** One-line "why this route" from the planner, when available. */
  rationale?: string;
  /** Compass label of the direction the route heads ("Northeast"). */
  direction_label: string;
  loop_orientation: LoopOrientation;
  source: string;
  surface_profile: string;
  /** Requested gravel share (%), when the rider stated one; else null. */
  gravel_target_pct: number | null;
  /** Measured gravel+unpaved share (%) of the routed geometry; null if unknown. */
  gravel_actual_pct: number | null;
  familiarity_percent: number | null;
  /** Fidelity-to-request score in [0, 1]; candidates are returned best-first. */
  score: number;
  requested: { distance_km: number; bearing: number | null };
  /** Raw Claude parse result (surface prefs etc.) — same for all candidates. */
  parsed: unknown;
}

/** Courtesy stagger between variant/plan starts (each = several routing calls). */
const VARIANT_STAGGER_MS = 300;

/** Score weights: distance fit dominates, then direction, gravel, familiarity. */
const W_DISTANCE = 0.4;
const W_DIRECTION = 0.25;
const W_GRAVEL = 0.2;
const W_FAMILIARITY = 0.15;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The iterative builder + waypoint router are untyped JS — cast once at module scope.
const generateIterativeRouteLoose = generateIterativeRoute as unknown as (
  params: Record<string, unknown>,
) => Promise<GeneratedRouteResult | null>;

const routeThroughWaypointsLoose = routeThroughWaypoints as unknown as (
  start: Coordinate,
  names: string[],
  opts: Record<string, unknown>,
) => Promise<GeneratedRouteResult | null>;

/** Drop candidates whose distance is wildly off target; never empty the list. */
const DIST_HI = 1.6;
const DIST_LO = 0.6;
function applyDistanceGuard(candidates: RouteCandidate[]): RouteCandidate[] {
  if (candidates.length <= 1) return candidates;
  const ratio = (c: RouteCandidate) => c.snapshot.stats.distance_km / c.requested.distance_km;
  const inBand = candidates.filter((c) => {
    if (!(c.requested.distance_km > 0)) return true;
    const r = ratio(c);
    return r <= DIST_HI && r >= DIST_LO;
  });
  if (inBand.length > 0) return inBand;
  // Everything is off — keep the single closest so we never hard-error.
  return [
    candidates.slice().sort((a, b) => Math.abs(ratio(a) - 1) - Math.abs(ratio(b) - 1))[0],
  ];
}

/** Backfill API-derived elevation on every candidate (cached, parallel). */
async function enrichAll(candidates: RouteCandidate[]): Promise<void> {
  await Promise.all(
    candidates.map(async (candidate) => {
      candidate.snapshot = await enrichRouteElevation(candidate.snapshot);
    }),
  );
}

/** Score each candidate's familiarity against the rider's history (fail-soft). */
async function familiarityAll(
  candidates: RouteCandidate[],
  accessToken: string | null,
): Promise<void> {
  if (!accessToken) return;
  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const scored = (await scoreRoutePreference(
          candidate.snapshot.geometry as Array<[number, number]>,
          accessToken,
        )) as { familiarityPercent?: number } | null;
        candidate.familiarity_percent = scored?.familiarityPercent ?? null;
      } catch {
        candidate.familiarity_percent = null;
      }
    }),
  );
}

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Bearing from the start to the route's far point — the sampled coordinate
 * farthest from the start. Robust for loops and out-and-backs alike: the far
 * point sits in the half of the compass the route actually explored.
 */
function bearingToFarPoint(
  geometry: ReadonlyArray<ReadonlyArray<number>>,
  start: Coordinate,
): number | null {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  const step = Math.max(1, Math.floor(geometry.length / 200));
  let farPoint: ReadonlyArray<number> | null = null;
  let far_km = -1;
  for (let i = 0; i < geometry.length; i += step) {
    const p = geometry[i];
    const d_km = haversineKm(start[1], start[0], p[1], p[0]);
    if (d_km > far_km) {
      far_km = d_km;
      farPoint = p;
    }
  }
  if (!farPoint || far_km <= 0) return null;
  return calculateBearing(start, [farPoint[0], farPoint[1]]) as number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

interface ParsedRequest {
  parsed: {
    waypoints?: string[];
    preferences?: { surfaceType?: string; preferFamiliar?: boolean };
  };
  startLocation: Coordinate;
  routeProfile: string;
  goal: string;
  type: string;
  preferFamiliar: boolean;
  durationMinutes: number;
  targetDistanceKm: number;
  direction: string | null;
  gravelTargetPct?: number | null;
}

interface GeneratedRouteResult {
  coordinates: Coordinate[];
  distanceKm: number;
  elevationGain?: number;
  duration_s?: number;
  duration?: number;
  name?: string;
  rationale?: string;
  source?: string;
  directionLabel?: string;
  familiarityScore?: { familiarityPercent?: number } | null;
  cues?: unknown[] | null;
}

function scoreCandidate(
  candidate: RouteCandidate,
  requestedBearing: number | null,
  startLocation: Coordinate,
): number {
  const target_km = candidate.requested.distance_km;
  const actual_km = candidate.snapshot.stats.distance_km;
  const distanceAccuracy =
    target_km > 0 ? clamp01(1 - Math.abs(actual_km - target_km) / target_km) : 0.5;

  let directionMatch = 1;
  if (requestedBearing !== null) {
    const actualBearing = bearingToFarPoint(candidate.snapshot.geometry, startLocation);
    directionMatch =
      actualBearing === null ? 0.5 : 1 - angularDiff(actualBearing, requestedBearing) / 180;
  }

  // Gravel fit: full credit when no target was requested; a soft penalty for
  // the gap when we both asked for a % and measured one; neutral if unmeasured.
  let gravelMatch = 1;
  if (candidate.gravel_target_pct !== null) {
    gravelMatch =
      candidate.gravel_actual_pct === null
        ? 0.5
        : clamp01(1 - Math.abs(candidate.gravel_actual_pct - candidate.gravel_target_pct) / 100);
  }

  const familiarity = (candidate.familiarity_percent ?? 0) / 100;

  return clamp01(
    W_DISTANCE * distanceAccuracy +
      W_DIRECTION * directionMatch +
      W_GRAVEL * gravelMatch +
      W_FAMILIARITY * familiarity,
  );
}

function candidateFromRoute(
  route: GeneratedRouteResult,
  request: ParsedRequest,
  requestedBearing: number | null,
  loopOrientation: LoopOrientation,
  variantBearing: number | null,
): RouteCandidate | null {
  if (!route?.coordinates || route.coordinates.length < 10) return null;
  const distance_km = Number.parseFloat((route.distanceKm ?? 0).toFixed(1));
  const snapshot = snapshotFromGeneratedRoute({
    coordinates: route.coordinates,
    distance_km,
    elevation_gain_m: route.elevationGain ?? 0,
    duration_s: route.duration_s ?? route.duration ?? 0,
    cues: route.cues ?? null,
  });
  if (!snapshot) return null;
  const labelBearing = variantBearing ?? requestedBearing;
  return {
    snapshot,
    name: route.name || `${distance_km}km ${request.goal} ${request.type}`,
    rationale: route.rationale,
    direction_label:
      route.directionLabel ?? (labelBearing !== null ? getDirectionName(labelBearing) : ''),
    loop_orientation: loopOrientation,
    source: route.source || 'iterative_quarter_loop',
    surface_profile: request.routeProfile,
    gravel_target_pct: request.gravelTargetPct ?? null,
    gravel_actual_pct: null,
    familiarity_percent: route.familiarityScore?.familiarityPercent ?? null,
    score: 0,
    requested: { distance_km: request.targetDistanceKm, bearing: requestedBearing },
    parsed: request.parsed,
  };
}

interface VariantSpec {
  bearing_deg: number | null;
  orientation: LoopOrientation;
  /** Retried once with this bearing when the primary fails (offset variant). */
  fallbackBearing_deg?: number;
}

function variantSpecsFor(requestedBearing: number | null, type: string): VariantSpec[] {
  const isOutBack = type === 'out_back' || type === 'out_and_back';
  if (requestedBearing === null) {
    // No direction asked — spread three bearings around the compass from a
    // shared random base so the options genuinely differ.
    const base = Math.random() * 360;
    return [0, 120, 240].map((offset) => ({
      bearing_deg: normalizeBearing(base + offset),
      orientation: 'cw' as const,
    }));
  }
  if (isOutBack) {
    // Orientation is meaningless for out-and-backs — vary the bearing.
    return [
      { bearing_deg: requestedBearing, orientation: 'cw' },
      { bearing_deg: normalizeBearing(requestedBearing + 30), orientation: 'cw' },
      { bearing_deg: normalizeBearing(requestedBearing - 30), orientation: 'cw' },
    ];
  }
  return [
    { bearing_deg: requestedBearing, orientation: 'cw' },
    { bearing_deg: requestedBearing, orientation: 'ccw' },
    {
      bearing_deg: normalizeBearing(requestedBearing + 30),
      orientation: 'cw',
      fallbackBearing_deg: normalizeBearing(requestedBearing - 30),
    },
  ];
}

/**
 * Generate scored route candidates from a free-text request.
 *
 * Context shape matches `generateRouteFromNaturalLanguage` (biasCoord,
 * userLocation, placedStart, weather, calendar, profile, speedProfile,
 * useIterativeBuilder, accessToken, onProgress).
 *
 * @returns candidates ordered best-first (1–3 entries)
 * @throws 'NO_START' when no start coordinate resolves; routing errors otherwise.
 */
export async function generateRouteCandidatesFromNaturalLanguage(
  userRequest: string,
  context: Record<string, unknown> = {},
): Promise<RouteCandidate[]> {
  const request = (await parseRouteRequest(userRequest, context)) as ParsedRequest;
  const accessToken = (context.accessToken as string | null) ?? null;
  const onProgress = context.onProgress as ((stage: string) => void) | undefined;
  const progress = (stage: string) => {
    try { onProgress?.(stage); } catch { /* best-effort */ }
  };

  const requestedBearing: number | null =
    request.direction !== null ? (resolveBearing(request.direction) as number | null) : null;
  const hasNamedWaypoints = (request.parsed?.waypoints?.length ?? 0) > 0;
  const useIterative = context.useIterativeBuilder !== false;
  const familiarBranch = Boolean(accessToken && request.preferFamiliar && request.type === 'loop');

  // Nothing to vary on these paths — delegate to the single-route pipeline.
  if (hasNamedWaypoints || !useIterative || familiarBranch) {
    const route = (await generateRouteFromParsedRequest(request, context)) as GeneratedRouteResult;
    const candidate = candidateFromRoute(route, request, requestedBearing, 'cw', null);
    if (!candidate) {
      throw new Error('Could not generate a route. Try a different duration or location.');
    }
    candidate.snapshot = await enrichRouteElevation(candidate.snapshot);
    candidate.score = scoreCandidate(candidate, requestedBearing, request.startLocation);
    return [candidate];
  }

  // Iterative branch: build three variants in parallel, staggered to be
  // polite to the public routing providers (each variant routes 4 segments).
  progress('iterative');
  const specs = variantSpecsFor(requestedBearing, request.type);

  const buildVariant = async (spec: VariantSpec, index: number): Promise<RouteCandidate | null> => {
    if (index > 0) await sleep(index * VARIANT_STAGGER_MS);
    const attempt = (bearing_deg: number | null) =>
      generateIterativeRouteLoose({
        startLocation: [request.startLocation[0], request.startLocation[1]],
        targetDistanceKm: request.targetDistanceKm,
        routeType: request.type === 'out_back' ? 'out_and_back' : request.type,
        direction: bearing_deg !== null ? String(bearing_deg) : null,
        loopOrientation: spec.orientation,
        options: { profile: request.routeProfile, trainingGoal: request.goal },
        trainingGoal: request.goal,
      });

    let route: GeneratedRouteResult | null = null;
    try {
      route = await attempt(spec.bearing_deg);
    } catch {
      route = null;
    }
    if (!route?.coordinates?.length && spec.fallbackBearing_deg !== undefined) {
      try {
        route = await attempt(spec.fallbackBearing_deg);
      } catch {
        route = null;
      }
    }
    if (!route) return null;
    return candidateFromRoute(route, request, requestedBearing, spec.orientation, spec.bearing_deg);
  };

  const settled = await Promise.allSettled(specs.map((spec, i) => buildVariant(spec, i)));
  const candidates = settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((c): c is RouteCandidate => c !== null);

  if (candidates.length === 0) {
    throw new Error('Could not generate a route. Try a different duration or location.');
  }

  // Elevation enrichment (cached; no-op when the provider already reported
  // gain) must land before display so no card or reply ever says 0m climbing.
  await enrichAll(candidates);
  await familiarityAll(candidates, accessToken);

  const guarded = applyDistanceGuard(candidates);
  for (const candidate of guarded) {
    candidate.score = scoreCandidate(candidate, requestedBearing, request.startLocation);
  }
  guarded.sort((a, b) => b.score - a.score);

  return guarded;
}

/** Resolve a start coord from the chat context (placed → geolocation → viewport). */
function resolveStartFromContext(context: Record<string, unknown>): Coordinate | null {
  return (
    (context.placedStart as Coordinate | null) ??
    (context.userLocation as Coordinate | null) ??
    (context.biasCoord as Coordinate | null) ??
    null
  );
}

/**
 * Plan route candidates the way a knowledgeable local would: ask Claude to
 * propose ~3 distinct routes as lists of REAL waypoints (towns, gravel roads,
 * landmarks), geocode and route through each, measure the actual gravel share,
 * score, and return best-first. This replaces the geometric box-builder on the
 * happy path; `generateIterativeRoute` is only a per-slot / total fallback so
 * generation never hard-errors (except NO_START).
 *
 * Context shape matches `generateRouteCandidatesFromNaturalLanguage`.
 */
export async function generatePlannedRouteCandidates(
  userRequest: string,
  context: Record<string, unknown> = {},
): Promise<RouteCandidate[]> {
  const startLocation = resolveStartFromContext(context);
  if (!startLocation) throw new Error('NO_START');

  const accessToken = (context.accessToken as string | null) ?? null;
  const onProgress = context.onProgress as ((stage: string) => void) | undefined;
  const progress = (stage: string) => {
    try { onProgress?.(stage); } catch { /* best-effort */ }
  };

  // Reverse-geocode the start so Claude can name real nearby places.
  progress('planning');
  const regionLabel = await reverseGeocodeRegion([startLocation[0], startLocation[1]]);

  // One Claude call → up to three named plans. Any failure (network, non-JSON,
  // no usable plans) drops through to the geometric pipeline below.
  let plan: ReturnType<typeof parseRoutePlanningResponse> | null = null;
  try {
    const prompt = buildRoutePlanningPrompt(userRequest, {
      weatherData: (context.weather as object | null) ?? null,
      regionLabel,
      calendarData: (context.calendar as object | null) ?? null,
    });
    const apiUrl = import.meta.env.PROD ? '/api/claude-routes' : 'http://localhost:3000/api/claude-routes';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ prompt, maxTokens: 1500, temperature: 0.4 }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success) plan = parseRoutePlanningResponse(data.content);
    }
  } catch (e) {
    console.warn('[planning] Claude planning failed, falling back to geometric:', e);
  }

  if (!plan || plan.routes.length === 0) {
    return generateRouteCandidatesFromNaturalLanguage(userRequest, context);
  }

  const requestedBearing: number | null =
    plan.direction !== null ? (resolveBearing(plan.direction) as number | null) : null;
  const type = plan.routeType || 'loop';
  const goal = 'endurance';
  const targetDistanceKm = plan.distance_km ?? 48;
  // Gravel intent is the requested *percentage*, not the surface label: "50%
  // gravel" is literally a mix, so Claude returns surfaceType 'mixed'. Key off
  // the target so the gravel-network path actually runs, and force the gravel
  // routing profile so the connectors are gravel too (not just the forced ways).
  const gravelTargetPct = plan.gravelTargetPct ?? (plan.surfaceType === 'gravel' ? 50 : null);
  const wantsGravel = (gravelTargetPct ?? 0) > 0 || plan.surfaceType === 'gravel';
  const routeProfile = wantsGravel ? 'gravel' : (context.profile as string) || 'road';

  const request: ParsedRequest = {
    parsed: { waypoints: [], preferences: { surfaceType: plan.surfaceType } },
    startLocation,
    routeProfile,
    goal,
    type,
    preferFamiliar: false,
    durationMinutes: 60,
    targetDistanceKm,
    direction: plan.direction,
    gravelTargetPct,
  };

  const directionLabel =
    requestedBearing !== null ? getDirectionName(requestedBearing) : undefined;

  // Shared finalize: elevation → gravel measurement (when gravel) → familiarity
  // → distance guard → score → best-first. Used by both the gravel-network and
  // Claude-town paths so they behave identically downstream.
  const finalize = async (cands: RouteCandidate[]): Promise<RouteCandidate[]> => {
    await enrichAll(cands);
    if (wantsGravel) {
      for (const candidate of cands) {
        const measured = await measureGravelPct(candidate.snapshot.geometry);
        candidate.gravel_actual_pct = measured?.gravelPct ?? null;
      }
    }
    await familiarityAll(cands, accessToken);
    const guarded = applyDistanceGuard(cands);
    for (const candidate of guarded) {
      candidate.score = scoreCandidate(candidate, requestedBearing, startLocation);
    }
    guarded.sort((a, b) => b.score - a.score);
    return guarded;
  };

  // Gravel-network path: when gravel + a resolved direction, build the loop
  // from real OSM gravel ways (waypoints ON the gravel force the router to ride
  // it). Wins for gravel; falls through to Claude-town planning when the area
  // is gravel-sparse.
  if (wantsGravel && requestedBearing !== null) {
    progress('gravel-network');
    let gravelRoutes: GravelLoopRoute[] = [];
    try {
      gravelRoutes = await buildGravelLoopCandidates(startLocation, {
        targetDistanceKm,
        bearingDeg: requestedBearing,
        gravelTargetPct: gravelTargetPct ?? 50,
        goal,
        count: 3,
      });
    } catch {
      gravelRoutes = [];
    }
    if (gravelRoutes.length >= 1) {
      const gravelCandidates: RouteCandidate[] = [];
      for (const gr of gravelRoutes) {
        const route: GeneratedRouteResult = {
          coordinates: gr.coordinates,
          distanceKm: gr.distanceKm,
          elevationGain: gr.elevationGain,
          duration_s: gr.duration_s,
          name: gr.name,
          source: gr.source,
          directionLabel,
          rationale:
            gr.gravelWaysUsed.length > 0
              ? `Rides ${gr.gravelWaysUsed.length} gravel roads incl. ${gr.gravelWaysUsed.slice(0, 2).join(' & ')}`
              : 'Strings together gravel roads in your direction',
        };
        const c = candidateFromRoute(route, request, requestedBearing, 'cw', requestedBearing);
        if (c) gravelCandidates.push(c);
      }
      if (gravelCandidates.length >= 1) {
        return finalize(gravelCandidates);
      }
    }
    // else: gravel-sparse — fall through to Claude-town planning below.
  }

  // Build a per-plan iterative fallback when its waypoints can't be routed.
  const iterativeFallback = async (): Promise<GeneratedRouteResult | null> => {
    try {
      return await generateIterativeRouteLoose({
        startLocation: [startLocation[0], startLocation[1]],
        targetDistanceKm,
        routeType: type === 'out_back' ? 'out_and_back' : type,
        direction: requestedBearing !== null ? String(requestedBearing) : null,
        loopOrientation: 'cw',
        options: { profile: routeProfile, trainingGoal: goal },
        trainingGoal: goal,
      });
    } catch {
      return null;
    }
  };

  // Route each plan sequentially (geocoding + a routing call each), staggered
  // to stay polite to the public providers.
  const candidates: RouteCandidate[] = [];
  const plans = plan.routes.slice(0, 3);
  for (let i = 0; i < plans.length; i++) {
    if (i > 0) await sleep(VARIANT_STAGGER_MS);
    const planRoute = plans[i];
    let route: GeneratedRouteResult | null = null;
    try {
      const routed = await routeThroughWaypointsLoose(startLocation, planRoute.waypoints, {
        profile: routeProfile,
        goal,
        type,
      });
      if (routed) {
        route = { ...routed, name: planRoute.name, rationale: planRoute.rationale, directionLabel };
      }
    } catch {
      route = null;
    }
    if (!route) route = await iterativeFallback();
    if (!route) continue;
    const candidate = candidateFromRoute(route, request, requestedBearing, 'cw', requestedBearing);
    if (candidate) candidates.push(candidate);
  }

  // Every plan failed (and so did the iterative fallbacks) — hand off entirely.
  if (candidates.length === 0) {
    return generateRouteCandidatesFromNaturalLanguage(userRequest, context);
  }

  return finalize(candidates);
}
