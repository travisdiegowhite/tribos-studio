/**
 * The landing's routing engine: BRouter with the Tribos comfort profile
 * (comfort_level 1–5), plus the comfort validator, driven by the ladder.
 * No AI (decided 2026-11-02), so no Claude cost and no guest AI cap.
 *
 * BRouter rather than Stadia because a BRouter route carries the way tags
 * the validator needs (maxspeed, lanes, shoulder) in the same call. A Stadia
 * line would need a re-ride per candidate to read them.
 */

import { getBRouterDirections, brouterServers, PUBLIC_BROUTER_URL, BROUTER_PROFILES } from '../../utils/brouter';
import { tribosParamsFor } from '../../utils/brouterProfiles';
import { classifyRouteSegments } from '../../utils/comfortValidator';
import { planComfortRoute, type ComfortPlan, type LadderDeps, type RouteCall } from '../../utils/comfortLadder';
import type { TaggedWay } from '../../utils/wayTags';
import type { Coordinate } from '../../types/geo';
import type { ComfortLevel } from '../../utils/comfortLevels';
import type { LandingSurface } from './landingPrefs';

const KM_PER_MI = 1.609344;

/** Share of unpaved the gravel profile aims for, by the form's "Riding on". */
const GRAVEL_TARGET_PCT: Record<Exclude<LandingSurface, 'road'>, number> = { gravel: 70, mixed: 35 };

export interface LandingRequest {
  start: Coordinate;
  distanceMi: number;
  surface: LandingSurface;
  comfortLevel: ComfortLevel;
  /** Loop direction; "Try a different loop" rotates it. */
  bearingDeg?: number;
}

/** BRouter answered with no route (target island, nothing found): a real "no route here". */
export class NoRouteError extends Error {
  constructor() {
    super('no route');
    this.name = 'NoRouteError';
  }
}

export function routeCallFor(surface: LandingSurface) {
  return async (call: RouteCall) => {
    const tribos = tribosParamsFor(
      surface === 'road'
        ? { surface: 'road', comfortLevel: call.level }
        : { surface: 'gravel', comfortLevel: call.level, gravelTargetPct: GRAVEL_TARGET_PCT[surface] },
    );
    const route = (await getBRouterDirections(call.waypoints.map(([lng, lat]) => [lng, lat] as [number, number]), {
      profile: surface === 'road' ? BROUTER_PROFILES.TREKKING : BROUTER_PROFILES.GRAVEL,
      tribos,
      forceTribos: true,
    })) as { coordinates: Coordinate[]; distance_m: number; taggedWays?: TaggedWay[] } | null;
    if (!route || !Array.isArray(route.coordinates) || route.coordinates.length < 2) throw new NoRouteError();
    return {
      coordinates: route.coordinates,
      distance_m: route.distance_m,
      segmentClasses: route.taggedWays?.length ? classifyRouteSegments(route.coordinates, route.taggedWays) : null,
    };
  };
}

/**
 * Nearby-start search only when a self-hosted server leads the list. The
 * public brouter.de is a volunteer service; the ladder's extra calls stay
 * off it (comfort routing spec §5, call budget).
 */
export function selfHostedRouting(): boolean {
  return brouterServers()[0] !== PUBLIC_BROUTER_URL;
}

export function planLandingRoute(req: LandingRequest, deps: Partial<LadderDeps> = {}): Promise<ComfortPlan> {
  return planComfortRoute(
    {
      start: req.start,
      targetDistance_km: req.distanceMi * KM_PER_MI,
      level: req.comfortLevel,
      surface: req.surface === 'road' ? 'road' : 'gravel',
      bearingDeg: req.bearingDeg ?? 0,
    },
    {
      route: routeCallFor(req.surface),
      allowNearbyStart: selfHostedRouting(),
      ...deps,
    },
  );
}
