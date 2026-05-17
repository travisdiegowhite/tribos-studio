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
}

/**
 * Routing profile values accepted by the v1 routing engines.
 */
export type RoutingProfile = 'road' | 'gravel' | 'mtb' | 'commute';

export type RouteShape = 'loop' | 'out_and_back' | 'point_to_point';

export interface SurfaceMix {
  road?: number;
  gravel?: number;
  path?: number;
  trail?: number;
}

/**
 * The form input the FormPanel collects and feeds to `useAIGeneration.generate`.
 */
export interface GenerationFormInput {
  goal?: string;
  duration_minutes?: number;
  distance_km?: number;
  elevation_gain_m?: number;
  start_coord?: Coordinate;
  route_profile?: RoutingProfile;
  route_shape?: RouteShape;
  surface_mix?: SurfaceMix;
  like_ride_id?: string;
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
