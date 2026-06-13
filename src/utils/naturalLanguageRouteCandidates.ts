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
} from './naturalLanguageRouteBuilder';
import {
  generateIterativeRoute,
  resolveBearing,
  getDirectionName,
} from './iterativeRouteBuilder';
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
  /** Compass label of the direction the route heads ("Northeast"). */
  direction_label: string;
  loop_orientation: LoopOrientation;
  source: string;
  surface_profile: string;
  familiarity_percent: number | null;
  /** Fidelity-to-request score in [0, 1]; candidates are returned best-first. */
  score: number;
  requested: { distance_km: number; bearing: number | null };
  /** Raw Claude parse result (surface prefs etc.) — same for all candidates. */
  parsed: unknown;
}

/** Courtesy stagger between variant starts (each variant = 4 routing calls). */
const VARIANT_STAGGER_MS = 300;

/** Score weights: distance fit dominates, then direction, then familiarity. */
const W_DISTANCE = 0.5;
const W_DIRECTION = 0.35;
const W_FAMILIARITY = 0.15;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
}

interface GeneratedRouteResult {
  coordinates: Coordinate[];
  distanceKm: number;
  elevationGain?: number;
  duration_s?: number;
  duration?: number;
  name?: string;
  source?: string;
  directionLabel?: string;
  familiarityScore?: { familiarityPercent?: number } | null;
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

  const familiarity = (candidate.familiarity_percent ?? 0) / 100;

  return clamp01(
    W_DISTANCE * distanceAccuracy + W_DIRECTION * directionMatch + W_FAMILIARITY * familiarity,
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
  });
  if (!snapshot) return null;
  const labelBearing = variantBearing ?? requestedBearing;
  return {
    snapshot,
    name: route.name || `${distance_km}km ${request.goal} ${request.type}`,
    direction_label:
      route.directionLabel ?? (labelBearing !== null ? getDirectionName(labelBearing) : ''),
    loop_orientation: loopOrientation,
    source: route.source || 'iterative_quarter_loop',
    surface_profile: request.routeProfile,
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
    // The iterative builder is untyped JS with partial JSDoc — cast once.
    const generateIterativeRouteLoose = generateIterativeRoute as unknown as (
      params: Record<string, unknown>,
    ) => Promise<GeneratedRouteResult | null>;
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
  await Promise.all(
    candidates.map(async (candidate) => {
      candidate.snapshot = await enrichRouteElevation(candidate.snapshot);
    }),
  );

  // Familiarity per candidate, fail-soft (the single-route path scores the
  // same way inside generateRouteFromParsedRequest).
  if (accessToken) {
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

  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate, requestedBearing, request.startLocation);
  }
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}
