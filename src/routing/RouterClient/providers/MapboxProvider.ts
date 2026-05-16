/**
 * MapboxProvider — wraps `src/utils/directions.js`.
 *
 * See `docs/legacy-routing-notes.md` §4 for the legacy module audit.
 *
 * The two key behaviors preserved:
 *   1. `solve` calls `getCyclingDirections` (preference-aware routing
 *      via the Directions API)
 *   2. `connect` calls `mapMatchRoute` (waypoint-to-road map matching
 *      with the 15→25→50m radius fallback)
 */

import type { Coordinate } from '../../../types/geo';
import {
  getCyclingDirections,
  mapMatchRoute,
} from '../../../utils/directions';
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

/** Mapbox Map Matching API hard limit. */
const MAX_MAPMATCH_WAYPOINTS = 100;

interface MapboxResult {
  coordinates: Coordinate[];
  distance?: number;   // legacy meters field
  duration?: number;   // legacy seconds field
  distance_m?: number; // canonical (may be undefined for Mapbox legacy)
  duration_s?: number;
  confidence?: number;
}

/**
 * Translate constraint preferences into the legacy
 * `getCyclingDirections` `preferences` shape.
 */
function buildLegacyPreferences(
  constraint: RouteConstraint,
  context: RouteContext,
): unknown {
  const base = (context.preferences as Record<string, unknown> | undefined) ?? {};

  const out: Record<string, unknown> = { ...base };

  if (constraint.profile === 'gravel' || constraint.profile === 'mtb') {
    out.surfaceType = 'gravel';
  }

  if (constraint.traffic_preference === 'minimal') {
    out.routingPreferences = { trafficTolerance: 'low' };
    out.scenicPreferences = { quietnessLevel: 'high' };
  } else if (constraint.traffic_preference === 'low') {
    out.routingPreferences = { trafficTolerance: 'low' };
  }

  return out;
}

export class MapboxProvider implements RouteProvider {
  readonly name = 'mapbox' as const;

  /**
   * Per `docs/legacy-routing-notes.md` §4: we keep `supports`
   * permissive for all profiles because the legacy fallback chain
   * does land on Mapbox for gravel as a last resort. Quality is
   * acknowledged to be lower than BRouter for gravel.
   *
   * This deviates from the example in the T2.1 spec ("Mapbox returns
   * false for profile: gravel"). Rationale lives in the legacy notes.
   */
  supports(_profile: RoutingProfile): boolean {
    return true;
  }

  async solve(
    constraint: RouteConstraint,
    context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(constraint.waypoints, 'MapboxProvider.solve');

    if (!context.mapbox_token) {
      return {
        ok: false,
        reason: {
          kind: 'http_error',
          status: 0,
          message: 'Mapbox token not provided in context',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      const result = (await this.withTimeout(
        getCyclingDirections(
          constraint.waypoints as Coordinate[],
          context.mapbox_token,
          {
            profile: 'cycling',
            preferences: buildLegacyPreferences(constraint, context),
          },
        ),
        12_000,
      )) as MapboxResult | null;

      if (!result || !hasValidGeometry(result.coordinates)) {
        return {
          ok: false,
          reason: {
            kind: 'no_route_found',
            message: 'Mapbox returned no usable geometry',
          },
          duration_ms: Date.now() - startTime,
        };
      }

      // Legacy returns bare `distance`/`duration` from the Directions
      // wrapper (both in canonical meters/seconds).
      const distance_m = result.distance_m ?? result.distance ?? 0;
      const duration_s = result.duration_s ?? result.duration ?? 0;

      return {
        ok: true,
        route: buildSnapshot({
          coordinates: result.coordinates,
          distance_m,
          duration_s,
          // Mapbox does not return elevation in this path.
          elevationGain_m: 0,
          elevationLoss_m: 0,
          waypoints: constraint.waypoints,
        }),
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyError(err, { timeoutMs: 12_000 }),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  async connect(
    waypoints: Coordinate[],
    context: RouteContext,
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    assertWaypoints(waypoints, 'MapboxProvider.connect');

    if (!context.mapbox_token) {
      return {
        ok: false,
        reason: {
          kind: 'http_error',
          status: 0,
          message: 'Mapbox token not provided in context',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    // Map Matching hard limit of 100 waypoints. Legacy truncates;
    // the adapter treats it as a failure so the fallback chain can
    // try a different provider that has a higher limit (Stadia).
    if (waypoints.length > MAX_MAPMATCH_WAYPOINTS) {
      return {
        ok: false,
        reason: {
          kind: 'invalid_response',
          message: `Mapbox map-matching: too many waypoints (${waypoints.length} > ${MAX_MAPMATCH_WAYPOINTS})`,
        },
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      const result = (await this.withTimeout(
        mapMatchRoute(waypoints, context.mapbox_token, { profile: 'cycling' }),
        12_000,
      )) as MapboxResult | null;

      if (!result || !hasValidGeometry(result.coordinates)) {
        return {
          ok: false,
          reason: {
            kind: 'no_route_found',
            message: 'Mapbox map-match returned no usable geometry',
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
          elevationGain_m: 0,
          elevationLoss_m: 0,
          waypoints,
        }),
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyError(err, { timeoutMs: 12_000 }),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Mapbox request timed out after ${ms}ms`));
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
