/**
 * comfortLadder — `planComfortRoute`, the §4 ladder of
 * docs/COMFORT-ROUTING-SPEC.md: warn and route, offer alternatives, or refuse.
 *
 * The router steers and the validator decides. Every route this module hands
 * back passes `validateMatchedSegments` at the level it's shown for. A route
 * that fails at the rider's level is never returned as the route: it either
 * becomes a "ride it at Comfort L+1" alternative (passing at L+1) or it is
 * dropped.
 *
 * Engine-agnostic and pure apart from the injected `route` call: the harness
 * passes BRouter (Node), the landing form will pass the browser client. The
 * caller's `route` returns the line plus one class per coordinate segment,
 * from the engine's own way tags or a re-ride, so this module never fetches
 * tags itself.
 *
 * Call budget (spec §5 Phase 0B): at most `budget` route calls per request
 * (default 12). The nearby-start search runs only when `allowNearbyStart`
 * is true, so callers turn it off while the public brouter.de fallback is
 * serving.
 *
 * Distances: km in the request, metres on routes (CLAUDE.md unit rules).
 * Coordinates: canonical [lng, lat].
 */

import type { Coordinate } from '../types/geo';
import type { ComfortClassResult } from './comfortClass';
import { COMFORT_RULES, type ComfortLevel } from './comfortLevels';
import { validateMatchedSegments, type ComfortValidation } from './comfortValidator';
import { destinationPoint, loopWaypoints, rescaleRoadFactor, DEFAULT_ROAD_FACTOR } from './loopWaypoints';

export type LadderSurface = 'road' | 'gravel';
export type LadderOutcome = 'ok' | 'alternatives' | 'refused';
/** What an alternative changes. `shape|distance|comfort_up` match the `alternative_chosen` analytics kinds. */
export type CandidateKind = 'primary' | 'shape' | 'distance' | 'comfort_up' | 'nearby_start' | 'shorter';

export interface ComfortRouteRequest {
  start: Coordinate;
  targetDistance_km: number;
  level: ComfortLevel;
  surface: LadderSurface;
  /** Direction from the start to the loop's centre. Default 0 (north). */
  bearingDeg?: number;
  clockwise?: boolean;
}

/** What the caller's engine returns for one request. */
export interface RoutedLine {
  coordinates: Coordinate[];
  distance_m: number;
  /** One class per coordinate segment (null where no way matched). Null when no tag data at all. */
  segmentClasses: Array<ComfortClassResult | null> | null;
}

export interface RouteCall {
  waypoints: Coordinate[];
  surface: LadderSurface;
  /** The comfort level the engine should steer for. */
  level: ComfortLevel;
}

export interface LadderDeps {
  route(call: RouteCall): Promise<RoutedLine>;
  /** Max route calls for this request. Default `LADDER_CONFIG.budget`. */
  budget?: number;
  /** Search nearby starts on a refusal. Turn off while the brouter.de fallback is serving. */
  allowNearbyStart?: boolean;
  /** Errors that must abort the plan rather than count as "no route here" (throttling, network). */
  isFatal?(err: unknown): boolean;
}

export const LADDER_CONFIG = {
  budget: 12,
  /** A route within this share of the target counts as "the same distance". */
  distanceTolerance: 0.15,
  /** ±25% (spec §4 step 2). */
  distanceStep: 0.25,
  /** Attempts for the primary loop: one first try, then one rescale toward the target. */
  primaryAttempts: 2,
  /** Nearby-start search: ring radii (km) and points per ring. */
  nearbyRadii_km: [3, 6] as readonly number[],
  nearbyPerRing: 4,
  /** "A shorter loop" on a refusal: this share of the target. */
  shorterShare: 0.5,
  maxAlternatives: 3,
} as const;

export interface ComfortCandidate {
  kind: CandidateKind;
  /** The level this candidate was validated at and passes at. */
  level: ComfortLevel;
  start: Coordinate;
  targetDistance_km: number;
  bearingDeg: number;
  clockwise: boolean;
  waypoints: Coordinate[];
  coordinates: Coordinate[];
  distance_m: number;
  validation: ComfortValidation;
  /** One line on what's different from the request (alternatives and refusal suggestions). */
  note: string | null;
  /** For comfort_up: what becomes flagged at L+1 compared with the request. */
  comfortUp?: { fromLevel: ComfortLevel; flagged_m: number; stretches: number };
  /** For nearby_start: straight-line distance from the requested start. */
  startOffset_m?: number;
}

export interface CandidateTrace {
  kind: CandidateKind;
  bearingDeg: number;
  clockwise: boolean;
  targetDistance_km: number;
  start: Coordinate;
  error: string | null;
  distance_m: number | null;
  passes: boolean | null;
}

export interface ComfortPlan {
  outcome: LadderOutcome;
  level: ComfortLevel;
  /** Set when outcome is 'ok'. */
  route: ComfortCandidate | null;
  /** Up to 3, each passing at its own `level` (outcome 'alternatives'). */
  alternatives: ComfortCandidate[];
  /** Outcome 'refused': what to suggest instead. */
  refusal: {
    message: string;
    nearbyStart: ComfortCandidate | null;
    shorter: ComfortCandidate | null;
    /** Rider level + 1, offered as "try Comfort L+1" when ≤ 5. */
    tryLevel: ComfortLevel | null;
  } | null;
  calls: number;
  budget: number;
  tried: CandidateTrace[];
}

const MI_M = 1609.344;

/** "26 mi". Miles, as the landing spec's copy is written. */
export function formatMiles(distance_m: number): string {
  const mi = distance_m / MI_M;
  return `${mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10} mi`;
}

function nextLevel(level: ComfortLevel): ComfortLevel | null {
  return level < 5 ? ((level + 1) as ComfortLevel) : null;
}

function normBearing(b: number): number {
  return ((b % 360) + 360) % 360;
}

/** The plain reasons for the stretches that are flagged at L+1, most common first. */
function topReasons(v: ComfortValidation, max = 2): string[] {
  const counts = new Map<string, number>();
  for (const s of v.flaggedStretches) for (const r of s.reasons) counts.set(r, (counts.get(r) ?? 0) + s.length_m);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([r]) => r);
}

/** One line on what an alternative changes. No absolutes (comfortLevels.test.ts rule applies). */
export function candidateNote(c: Omit<ComfortCandidate, 'note'>, request: ComfortRouteRequest): string {
  const reqClockwise = request.clockwise !== false;
  switch (c.kind) {
    case 'shape': {
      if (c.clockwise !== reqClockwise && normBearing(c.bearingDeg) === normBearing(request.bearingDeg ?? 0)) {
        return c.clockwise ? 'Clockwise instead' : 'Counter-clockwise instead';
      }
      return 'A different loop from the same start';
    }
    case 'distance':
    case 'shorter':
      return `${formatMiles(c.distance_m)} instead of ${formatMiles(request.targetDistance_km * 1000)}`;
    case 'comfort_up': {
      const up = c.comfortUp;
      const reasons = topReasons(c.validation);
      const what = reasons.length ? ` of ${reasons.join(', ')}` : ' above your comfort';
      return `At Comfort ${c.level}: adds ${formatMiles(up?.flagged_m ?? c.validation.flagged_m)}${what}`;
    }
    case 'nearby_start':
      return `Start ${formatMiles(c.startOffset_m ?? 0)} away`;
    default:
      return '';
  }
}

export function refusalMessage(level: ComfortLevel): string {
  return `There isn't a route at Comfort ${level} from here at this distance.`;
}

/**
 * Plan a comfort route: try the request, then alternatives, then a refusal
 * with suggestions — every returned route validated at its stated level.
 */
export async function planComfortRoute(request: ComfortRouteRequest, deps: LadderDeps): Promise<ComfortPlan> {
  const budget = deps.budget ?? LADDER_CONFIG.budget;
  const level = request.level;
  const bearing0 = normBearing(request.bearingDeg ?? 0);
  const clockwise0 = request.clockwise !== false;
  const tried: CandidateTrace[] = [];
  let calls = 0;
  let lastError: unknown = null;
  let anyRouted = false;
  // Learned from the primary so later loops land nearer their targets.
  let roadFactor = DEFAULT_ROAD_FACTOR;

  interface Routed {
    kind: CandidateKind;
    start: Coordinate;
    targetDistance_km: number;
    bearingDeg: number;
    clockwise: boolean;
    waypoints: Coordinate[];
    line: RoutedLine;
    trace: CandidateTrace;
  }

  const attempt = async (
    kind: CandidateKind,
    opts: { start?: Coordinate; targetDistance_km?: number; bearingDeg?: number; clockwise?: boolean; steerLevel?: ComfortLevel; roadFactor?: number },
  ): Promise<Routed | null> => {
    if (calls >= budget) return null;
    const start = opts.start ?? request.start;
    const targetDistance_km = opts.targetDistance_km ?? request.targetDistance_km;
    const bearingDeg = normBearing(opts.bearingDeg ?? bearing0);
    const clockwise = opts.clockwise ?? clockwise0;
    const waypoints = loopWaypoints(start, targetDistance_km, { bearingDeg, clockwise, roadFactor: opts.roadFactor ?? roadFactor });
    const trace: CandidateTrace = { kind, bearingDeg, clockwise, targetDistance_km, start, error: null, distance_m: null, passes: null };
    tried.push(trace);
    calls++;
    try {
      const line = await deps.route({ waypoints, surface: request.surface, level: opts.steerLevel ?? level });
      anyRouted = true;
      trace.distance_m = line.distance_m;
      return { kind, start, targetDistance_km, bearingDeg, clockwise, waypoints, line, trace };
    } catch (err) {
      if (deps.isFatal?.(err)) throw err;
      lastError = err;
      trace.error = err instanceof Error ? err.message : String(err);
      return null;
    }
  };

  const validate = (r: Routed, atLevel: ComfortLevel): ComfortValidation | null => {
    if (!r.line.segmentClasses || r.line.coordinates.length < 2) return null;
    return validateMatchedSegments(r.line.coordinates, r.line.segmentClasses, atLevel);
  };

  const distanceOk = (r: Routed, target_km: number) =>
    Math.abs(r.line.distance_m / 1000 - target_km) / target_km <= LADDER_CONFIG.distanceTolerance;

  const toCandidate = (r: Routed, kind: CandidateKind, atLevel: ComfortLevel, v: ComfortValidation, extra: Partial<ComfortCandidate> = {}): ComfortCandidate => {
    const base = {
      kind,
      level: atLevel,
      start: r.start,
      targetDistance_km: r.targetDistance_km,
      bearingDeg: r.bearingDeg,
      clockwise: r.clockwise,
      waypoints: r.waypoints,
      coordinates: r.line.coordinates,
      distance_m: r.line.distance_m,
      validation: v,
      ...extra,
    };
    return { ...base, note: kind === 'primary' ? null : candidateNote(base, request) };
  };

  const mark = (r: Routed, passes: boolean) => {
    r.trace.passes = passes;
  };

  // ── Step 1: the request itself (warn and route) ─────────────────────────
  let primary: Routed | null = null;
  let primaryFactor = roadFactor;
  for (let i = 0; i < LADDER_CONFIG.primaryAttempts; i++) {
    const r = await attempt('primary', { roadFactor: primaryFactor });
    if (!r) {
      // Unroutable waypoint: nudge the shape like the harness does. The
      // nudge stays with the primary; later loops keep the learned factor.
      primaryFactor *= 1.15;
      continue;
    }
    if (!primary || Math.abs(r.line.distance_m / 1000 - request.targetDistance_km) < Math.abs(primary.line.distance_m / 1000 - request.targetDistance_km)) {
      primary = r;
    }
    roadFactor = rescaleRoadFactor(primaryFactor, request.targetDistance_km, r.line.distance_m / 1000);
    if (distanceOk(r, request.targetDistance_km)) {
      roadFactor = primaryFactor;
      break;
    }
    primaryFactor = roadFactor;
  }
  const primaryV = primary ? validate(primary, level) : null;
  if (primary && primaryV) mark(primary, primaryV.passes);
  if (primary && primaryV?.passes && distanceOk(primary, request.targetDistance_km)) {
    return { outcome: 'ok', level, route: toCandidate(primary, 'primary', level, primaryV), alternatives: [], refusal: null, calls, budget, tried };
  }

  // ── Step 2: alternatives, each passing at its own level ─────────────────
  const alternatives: ComfortCandidate[] = [];
  const routedAtLevel: Routed[] = primary ? [primary] : [];

  // A primary that passes but missed the distance is a "different distance" alternative as is.
  if (primary && primaryV?.passes) {
    alternatives.push(toCandidate(primary, 'distance', level, primaryV));
  }

  // Same distance, different shape: reverse direction first (same roads area), then rotate.
  const shapes: Array<{ bearingDeg: number; clockwise: boolean }> = [
    { bearingDeg: bearing0, clockwise: !clockwise0 },
    { bearingDeg: bearing0 + 180, clockwise: clockwise0 },
    { bearingDeg: bearing0 + 90, clockwise: clockwise0 },
    { bearingDeg: bearing0 + 270, clockwise: clockwise0 },
  ];
  for (const s of shapes) {
    if (calls >= budget - 1) break; // keep a call for the distance step
    const r = await attempt('shape', s);
    if (!r) continue;
    routedAtLevel.push(r);
    const v = validate(r, level);
    mark(r, !!v?.passes);
    if (v?.passes && distanceOk(r, request.targetDistance_km)) {
      alternatives.push(toCandidate(r, 'shape', level, v));
      break;
    }
  }

  // Different distance: nearest of ±25%, shorter first (shorter loops pass more often).
  if (!alternatives.some((a) => a.kind === 'distance')) {
    for (const f of [1 - LADDER_CONFIG.distanceStep, 1 + LADDER_CONFIG.distanceStep]) {
      if (calls >= budget) break;
      const target_km = request.targetDistance_km * f;
      const r = await attempt('distance', { targetDistance_km: target_km });
      if (!r) continue;
      routedAtLevel.push(r);
      const v = validate(r, level);
      mark(r, !!v?.passes);
      if (v?.passes && distanceOk(r, target_km)) {
        alternatives.push(toCandidate(r, 'distance', level, v));
        break;
      }
    }
  }

  // Ride one of these at Comfort L+1: free — re-validate what we already routed.
  const up = nextLevel(level);
  if (up) {
    let best: { r: Routed; v: ComfortValidation; atL: ComfortValidation } | null = null;
    for (const r of routedAtLevel) {
      if (!distanceOk(r, request.targetDistance_km)) continue;
      const atL = validate(r, level);
      if (!atL || atL.passes) continue; // a pass at L is already offered as itself
      const v = validate(r, up);
      if (!v?.passes) continue;
      if (!best || v.withinPct > best.v.withinPct) best = { r, v, atL };
    }
    // Nothing we have passes at L+1: one call steering for L+1, if the budget allows.
    if (!best && calls < budget) {
      const r = await attempt('comfort_up', { steerLevel: up });
      if (r && distanceOk(r, request.targetDistance_km)) {
        const v = validate(r, up);
        const atL = validate(r, level);
        mark(r, !!v?.passes);
        if (v?.passes && atL && !atL.passes) best = { r, v, atL };
      }
    }
    if (best) {
      alternatives.push(
        toCandidate(best.r, 'comfort_up', up, best.v, {
          comfortUp: { fromLevel: level, flagged_m: best.v.flagged_m, stretches: best.v.flaggedStretches.length },
        }),
      );
    }
  }

  if (alternatives.length) {
    // One of each kind, in the order the spec lists them.
    const order: CandidateKind[] = ['shape', 'distance', 'comfort_up'];
    alternatives.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return {
      outcome: 'alternatives',
      level,
      route: null,
      alternatives: alternatives.slice(0, LADDER_CONFIG.maxAlternatives),
      refusal: null,
      calls,
      budget,
      tried,
    };
  }

  // Every call failed outright (nothing routed): that's an engine problem, not a refusal.
  if (!anyRouted && lastError) throw lastError;

  // ── Step 3: refuse, with a nearby start and/or a shorter loop ───────────
  let nearbyStart: ComfortCandidate | null = null;
  if (deps.allowNearbyStart) {
    search: for (const radius_km of LADDER_CONFIG.nearbyRadii_km) {
      for (let k = 0; k < LADDER_CONFIG.nearbyPerRing; k++) {
        if (calls >= budget - 1) break search; // keep a call for the shorter loop
        const ringBearing = bearing0 + (360 / LADDER_CONFIG.nearbyPerRing) * k;
        const start = destinationPoint(request.start, radius_km, normBearing(ringBearing));
        const r = await attempt('nearby_start', { start });
        if (!r) continue;
        const v = validate(r, level);
        mark(r, !!v?.passes);
        if (v?.passes && distanceOk(r, request.targetDistance_km)) {
          nearbyStart = toCandidate(r, 'nearby_start', level, v, { startOffset_m: radius_km * 1000 });
          break search;
        }
      }
    }
  }

  let shorter: ComfortCandidate | null = null;
  if (calls < budget) {
    const target_km = request.targetDistance_km * LADDER_CONFIG.shorterShare;
    const r = await attempt('shorter', { targetDistance_km: target_km, roadFactor: DEFAULT_ROAD_FACTOR });
    if (r) {
      const v = validate(r, level);
      mark(r, !!v?.passes);
      if (v?.passes) shorter = toCandidate(r, 'shorter', level, v);
    }
  }

  return {
    outcome: 'refused',
    level,
    route: null,
    alternatives: [],
    refusal: { message: refusalMessage(level), nearbyStart, shorter, tryLevel: up },
    calls,
    budget,
    tried,
  };
}

/** Every route a plan hands back, with the level it's shown for (for acceptance checks). */
export function returnedRoutes(plan: ComfortPlan): ComfortCandidate[] {
  const out: ComfortCandidate[] = [];
  if (plan.route) out.push(plan.route);
  out.push(...plan.alternatives);
  if (plan.refusal?.nearbyStart) out.push(plan.refusal.nearbyStart);
  if (plan.refusal?.shorter) out.push(plan.refusal.shorter);
  return out;
}

/** The §5 acceptance check on one returned route: no blocked road, within the stretch and share limits. */
export function meetsAcceptance(c: ComfortCandidate): boolean {
  const v = c.validation;
  const flaggedHeadsUps = v.headsUps.filter((h) => h.kind === 'flagged').length;
  return (
    v.passes &&
    v.blocked_m === 0 &&
    v.blockedStretches.length === 0 &&
    v.flaggedStretches.every((s) => !s.overLimit) &&
    v.flagged_m <= v.total_m * COMFORT_RULES.maxFlaggedShare + 1e-6 &&
    flaggedHeadsUps >= v.flaggedStretches.length
  );
}
