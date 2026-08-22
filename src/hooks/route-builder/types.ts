/**
 * Local types for the Route Builder 2.0 hook layer.
 *
 * After S2, v2 no longer depends on `src/routing/executor` for type
 * shapes. The hook-internal route shape is defined here. It is
 * intentionally structurally similar to the now-unused
 * `RouteSnapshot` so tests and component contracts remain stable.
 */
import type { Coordinate } from '../../types/geo';

export type { Coordinate };

/**
 * A waypoint on the active route. Mirrors the v1 store shape — every
 * waypoint has a stable id, a `[lng, lat]` position, a role
 * ('start' | 'end' | 'waypoint'), and an optional human-readable name.
 */
export interface RouteWaypoint {
  id: string;
  position: Coordinate;
  type: 'start' | 'end' | 'waypoint';
  name: string;
}

/**
 * Route statistics in canonical units (km / m / s per T1.1).
 */
export interface RouteStats {
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  duration_s: number;
}

/**
 * Lightweight snapshot used by the suggestion list and chat handler.
 * Only the fields v2 actually consumes are present here.
 */
export interface RouteSnapshot {
  geometry: Coordinate[];
  waypoints: Array<{ coordinate: Coordinate }>;
  stats: RouteStats;
  elevations_m?: number[];
  /** Provider turn cues (RouteCue[]) when the router supplied them. */
  cues?: unknown[] | null;
  /**
   * Concrete shape this suggestion was built as. Kept per-suggestion because a
   * `round_trip` request can come back as a mix of loops and out-and-backs,
   * and the shape that gets persisted must be the one the rider picked.
   */
  shape?: ResolvedRouteShape;
}

/**
 * Routing profile values accepted by the v1 routing engines.
 */
export type RoutingProfile = 'road' | 'gravel' | 'mtb' | 'commute';

/**
 * Route shape, in the generator's and database's vocabulary.
 * `round_trip` is a rider intent resolved to a concrete shape during
 * generation; it is never persisted (see routes.route_type's CHECK).
 */
export type RouteShape = 'round_trip' | 'loop' | 'out_back' | 'point_to_point';

/** The concrete shapes a route can actually be, and be saved as. */
export type ResolvedRouteShape = 'loop' | 'out_back' | 'point_to_point';

export interface SurfaceMix {
  road?: number;
  gravel?: number;
  path?: number;
  trail?: number;
}

/**
 * The form input the FormPanel collects and feeds to `useAIGeneration.generate`.
 */
/**
 * Which of duration/distance the rider is actually asking for. The other is
 * a derived estimate and must not be treated as a target — sending both as
 * hard constraints is how "90 minutes" and "40 km" used to silently fight.
 */
export type TargetMode = 'time' | 'distance';

/**
 * What the rider asked for, kept alongside the route so the stats card can
 * keep comparing against it as the route is hand-edited.
 */
export interface RouteTarget {
  mode: TargetMode;
  durationMinutes?: number | null;
  distanceKm?: number | null;
}

/** How close a built route landed to its target. `error` is signed. */
export interface TargetAccuracy {
  mode: TargetMode;
  targetKm: number | null;
  achievedKm: number | null;
  targetMinutes: number | null;
  achievedMinutes: number | null;
  error: number | null;
  withinTolerance: boolean;
}

export interface GenerationFormInput {
  goal?: string;
  /** Defaults to 'time' when absent, matching the form's default. */
  target_mode?: TargetMode;
  duration_minutes?: number;
  distance_km?: number;
  elevation_gain_m?: number;
  start_coord?: Coordinate;
  route_profile?: RoutingProfile;
  route_shape?: RouteShape;
  surface_mix?: SurfaceMix;
  like_ride_id?: string;
  /**
   * Identity of the planned workout this route is for. Without it the prompt
   * falls back to "today's first incomplete workout", which is the wrong
   * session whenever the rider planned ahead — and, before the local-date fix,
   * often the wrong day too.
   */
  planned_workout_id?: string | null;
  scheduled_date?: string | null;
  workout_id?: string | null;
}

/**
 * Result of an AI-driven edit applied via the chat surface.
 */
export type EditResult =
  | {
      ok: true;
      newGeometry: Coordinate[];
      newStats: RouteStats;
      assistantText: string;
    }
  | { ok: false; reason: string };
