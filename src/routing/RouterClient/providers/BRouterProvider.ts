/**
 * BRouterProvider — wraps `src/utils/brouter.js`.
 *
 * See `docs/legacy-routing-notes.md` §3 for the legacy module audit.
 */

import type { Coordinate } from '../../../types/geo';
import {
  BROUTER_PROFILES,
  getBRouterDirections,
  selectBRouterProfile,
} from '../../../utils/brouter';
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

/** Public BRouter instance fails for ≥30 waypoints. */
const MAX_BROUTER_WAYPOINTS = 30;

/**
 * Choose a BRouter profile name from the spec profile + training goal +
 * constraint surface preference.
 *
 * - `gravel` profile → `BROUTER_PROFILES.GRAVEL` (specialist)
 * - `mtb` profile    → `BROUTER_PROFILES.MTB`
 * - `road`/`commute` → use the legacy `selectBRouterProfile` which maps
 *   training goal to profile
 */
function chooseBRouterProfile(
  constraint: RouteConstraint,
  context: RouteContext,
): string {
  if (constraint.profile === 'gravel') return BROUTER_PROFILES.GRAVEL;
  if (constraint.profile === 'mtb') return BROUTER_PROFILES.MTB;

  // Surface preference can override the goal-based pick.
  const surfaceHint =
    constraint.surface_preference && (constraint.surface_preference.gravel ?? 0) > 0.5
      ? 'gravel'
      : null;

  // `selectBRouterProfile` is JS — its inferred param type is too narrow
  // because the default is `null`. Cast at the boundary.
  return (selectBRouterProfile as (g: string, s: string | null) => string)(
    context.training_goal ?? 'endurance',
    surfaceHint,
  );
}

interface BRouterResult {
  coordinates: Coordinate[];
  distance_m?: number;
  duration_s?: number;
  distance?: number;
  duration?: number;
  elevationGain?: number;
  elevationLoss?: number;
  elevation?: { ascent?: number; descent?: number };
}

export class BRouterProvider implements RouteProvider {
  readonly name = 'brouter' as const;

  supports(profile: RoutingProfile): boolean {
    return ['road', 'gravel', 'mtb', 'commute'].includes(profile);
  }

  async solve(
    constraint: RouteConstraint,
    context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(constraint.waypoints, 'BRouterProvider.solve');

    if (constraint.waypoints.length >= MAX_BROUTER_WAYPOINTS) {
      return {
        ok: false,
        reason: {
          kind: 'invalid_response',
          message: `BRouter: too many waypoints (${constraint.waypoints.length} ≥ ${MAX_BROUTER_WAYPOINTS})`,
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return this.runRequest(
      constraint.waypoints,
      chooseBRouterProfile(constraint, context),
      startTime,
    );
  }

  async connect(
    waypoints: Coordinate[],
    _context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(waypoints, 'BRouterProvider.connect');

    if (waypoints.length >= MAX_BROUTER_WAYPOINTS) {
      return {
        ok: false,
        reason: {
          kind: 'invalid_response',
          message: `BRouter: too many waypoints (${waypoints.length} ≥ ${MAX_BROUTER_WAYPOINTS})`,
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return this.runRequest(waypoints, BROUTER_PROFILES.TREKKING, startTime);
  }

  private async runRequest(
    waypoints: readonly Coordinate[],
    profile: string,
    startTime: number,
  ): Promise<ProviderResult> {
    try {
      // BRouter has no native timeout in the legacy module — wrap it.
      const result = (await this.withTimeout(
        // Legacy JSDoc types `coordinates: Array<[lon, lat]>` as mutable
        // tuples; our canonical `Coordinate` is `readonly`. Erase the
        // readonly at the boundary — the legacy module does not mutate.
        getBRouterDirections(waypoints as unknown as [number, number][], { profile }),
        15_000,
      )) as BRouterResult | null;

      if (!result || !hasValidGeometry(result.coordinates)) {
        return {
          ok: false,
          reason: {
            kind: 'no_route_found',
            message: 'BRouter returned no usable geometry',
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
          elevationGain_m: result.elevationGain ?? result.elevation?.ascent ?? 0,
          elevationLoss_m: result.elevationLoss ?? result.elevation?.descent ?? 0,
          waypoints,
        }),
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyError(err, { timeoutMs: 15_000 }),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`BRouter request timed out after ${ms}ms`));
      }, ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
