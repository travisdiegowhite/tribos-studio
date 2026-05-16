/**
 * StadiaProvider — wraps `src/utils/stadiaMapsRouter.js`.
 *
 * See `docs/legacy-routing-notes.md` §2 for the legacy module audit.
 *
 * Critical: this adapter does NOT re-implement Valhalla costing math.
 * It translates `RouteConstraint` → the legacy module's input shape
 * and calls `getStadiaMapsRoute` directly. The costing layering
 * (profile + training goal + traffic tolerance + legacy preferences)
 * happens inside the legacy module, and that's exactly what we want
 * to preserve.
 */

import type { Coordinate } from '../../../types/geo';
import {
  getStadiaMapsRoute,
  isStadiaMapsAvailable,
} from '../../../utils/stadiaMapsRouter';
import type {
  ProviderResult,
  RouteConstraint,
  RouteContext,
  RouteProvider,
  RoutingProfile,
} from '../types';
import {
  assertWaypoints,
  buildSnapshot,
  classifyError,
  hasValidGeometry,
} from './shared';

/**
 * Map the spec-canonical `RoutingProfile` to the legacy Stadia profile
 * string. Legacy uses `'mountain'`/`'commuting'`.
 */
function toStadiaProfile(profile: RoutingProfile): string {
  switch (profile) {
    case 'mtb':
      return 'mountain';
    case 'commute':
      return 'commuting';
    default:
      return profile;
  }
}

/**
 * Translate constraint surface/traffic preferences into the legacy
 * `preferences` shape that `stadiaMapsRouter.getStadiaMapsRoute`
 * expects. The legacy module reads these fields:
 *
 *   preferences.routingPreferences.trafficTolerance: 'low'|'medium'|'high'
 *   preferences.trafficTolerance                   : same (legacy alias)
 *   preferences.scenicPreferences.quietnessLevel   : 'high'|'medium'|'low'
 *   preferences.avoidTraffic                       : 'high'|'medium'
 *   preferences.avoidHills                         : boolean
 *
 * We map:
 *   traffic_preference === 'minimal' → trafficTolerance: 'low' + avoidTraffic: 'high'
 *   traffic_preference === 'low'     → trafficTolerance: 'low'
 *
 * The caller's `context.preferences` (if any) is layered underneath
 * — constraint preferences override user defaults.
 */
function buildLegacyPreferences(
  constraint: RouteConstraint,
  context: RouteContext,
): unknown {
  const base = (context.preferences as Record<string, unknown> | undefined) ?? {};

  if (constraint.traffic_preference === 'minimal') {
    return {
      ...base,
      routingPreferences: { trafficTolerance: 'low' },
      avoidTraffic: 'high',
    };
  }
  if (constraint.traffic_preference === 'low') {
    return {
      ...base,
      routingPreferences: { trafficTolerance: 'low' },
    };
  }
  return base;
}

interface StadiaResult {
  coordinates: Coordinate[];
  distance_m?: number;
  duration_s?: number;
  distance?: number;
  duration?: number;
  elevationGain?: number;
  elevationLoss?: number;
}

export class StadiaProvider implements RouteProvider {
  readonly name = 'stadia' as const;

  supports(profile: RoutingProfile): boolean {
    // Stadia handles all four profiles. Quality varies (it's weaker
    // for gravel than BRouter), but the registry ordering — not
    // `supports` — decides which provider is preferred.
    return ['road', 'gravel', 'mtb', 'commute'].includes(profile);
  }

  async solve(
    constraint: RouteConstraint,
    context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(constraint.waypoints, 'StadiaProvider.solve');

    if (!isStadiaMapsAvailable()) {
      return {
        ok: false,
        reason: {
          kind: 'http_error',
          status: 0,
          message: 'Stadia Maps API key not configured',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      // Legacy JSDoc types waypoints as mutable `[lon, lat][]` and the
      // options object with narrow inferred types. Our canonical types
      // (`readonly Coordinate`, `unknown` preferences, nullable userSpeed)
      // are stricter; cast at the boundary.
      const stadiaOptions = {
        profile: toStadiaProfile(constraint.profile),
        preferences: buildLegacyPreferences(constraint, context),
        trainingGoal: context.training_goal ?? 'endurance',
        userSpeed: context.user_speed_kph ?? null,
      } as unknown as Parameters<typeof getStadiaMapsRoute>[1];
      const result = (await getStadiaMapsRoute(
        constraint.waypoints as unknown as [number, number][],
        stadiaOptions,
      )) as StadiaResult | null;

      if (!result || !hasValidGeometry(result.coordinates)) {
        return {
          ok: false,
          reason: {
            kind: 'no_route_found',
            message: 'Stadia returned no usable geometry',
          },
          duration_ms: Date.now() - startTime,
        };
      }

      const distance_m = result.distance_m ?? result.distance ?? 0;
      const duration_s = result.duration_s ?? result.duration ?? 0;

      return {
        ok: true,
        route: buildSnapshot({
          coordinates: result.coordinates,
          distance_m,
          duration_s,
          elevationGain_m: result.elevationGain ?? 0,
          elevationLoss_m: result.elevationLoss ?? 0,
          waypoints: constraint.waypoints,
        }),
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyError(err, { timeoutMs: 12000 }),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  async connect(
    waypoints: Coordinate[],
    context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(waypoints, 'StadiaProvider.connect');

    if (!isStadiaMapsAvailable()) {
      return {
        ok: false,
        reason: {
          kind: 'http_error',
          status: 0,
          message: 'Stadia Maps API key not configured',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      // Connect path: no training-goal or traffic-tolerance layering.
      // Bare road profile, defaults across the board. The legacy
      // module's `getStadiaMapsRoute` accepts an empty preferences
      // object and skips all the layering branches in that case.
      const stadiaOptions = {
        profile: 'road',
        preferences: null,
        trainingGoal: 'endurance',
        userSpeed: context.user_speed_kph ?? null,
      } as unknown as Parameters<typeof getStadiaMapsRoute>[1];
      const result = (await getStadiaMapsRoute(
        waypoints as unknown as [number, number][],
        stadiaOptions,
      )) as StadiaResult | null;

      if (!result || !hasValidGeometry(result.coordinates)) {
        return {
          ok: false,
          reason: {
            kind: 'no_route_found',
            message: 'Stadia returned no usable geometry',
          },
          duration_ms: Date.now() - startTime,
        };
      }

      const distance_m = result.distance_m ?? result.distance ?? 0;
      const duration_s = result.duration_s ?? result.duration ?? 0;

      return {
        ok: true,
        route: buildSnapshot({
          coordinates: result.coordinates,
          distance_m,
          duration_s,
          elevationGain_m: result.elevationGain ?? 0,
          elevationLoss_m: result.elevationLoss ?? 0,
          waypoints,
        }),
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyError(err, { timeoutMs: 12000 }),
        duration_ms: Date.now() - startTime,
      };
    }
  }
}
