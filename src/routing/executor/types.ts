/**
 * Executor-wide types shared across the routing executor modules.
 *
 * Per T2.2 spec, types that are consumed by ConstraintBuilder,
 * RouterClient, MutationHandlers, and the executor facade live here.
 * RouterClient-specific types (provider adapter contract, client config)
 * stay in `src/routing/RouterClient/types.ts`.
 *
 * The canonical `Coordinate` type lives in `src/types/geo.ts` and is
 * re-exported here for convenience.
 */

import type { Coordinate } from '../../types/geo';

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/**
 * Spec-canonical routing profile names. Per the executor spec §4.3.
 *
 * Note: legacy `smartCyclingRouter.js` uses `'mountain'`/`'commuting'`.
 * The adapter modules accept either; normalisation happens at module
 * entry via `normalizeProfile`.
 */
export type RoutingProfile = 'road' | 'gravel' | 'mtb' | 'commute';

export type ProviderName = 'stadia' | 'brouter' | 'mapbox';

// ---------------------------------------------------------------------------
// RouteConstraint — input to solve()
// ---------------------------------------------------------------------------

/**
 * Surface mix preference. Fractions need not sum to exactly 1.0 (router
 * treats them as relative weights).
 */
export interface SurfaceMix {
  road?: number;
  gravel?: number;
  path?: number;
  trail?: number;
}

export type TrafficPreference = 'low' | 'minimal';

export type RouteShape = 'loop' | 'out_and_back' | 'point_to_point';

/**
 * Opaque segment identifier. The router treats these as keys; the
 * higher-level analysis layer attaches meaning.
 */
export type SegmentId = string;

/**
 * Input to `RouterClient.solve()`. Mirrors Executor Spec §4.3.
 */
export interface RouteConstraint {
  // Required
  waypoints: Coordinate[];
  profile: RoutingProfile;
  shape: RouteShape;

  // Optional preferences (router treats as soft constraints)
  target_distance_km?: number;
  target_elevation_gain_m?: number;
  surface_preference?: SurfaceMix;
  traffic_preference?: TrafficPreference;
  avoid_segments?: SegmentId[];
  prefer_segments?: SegmentId[];
  exclude_segments?: SegmentId[];
}

// ---------------------------------------------------------------------------
// Scope (for scoped mutations)
// ---------------------------------------------------------------------------

/**
 * Scoped mutations apply only to a section of the route, identified by
 * km offset from the start. Both endpoints inclusive.
 */
export interface Scope {
  start_km: number;
  end_km: number;
}

// ---------------------------------------------------------------------------
// Weather context (for avoid_exposure)
// ---------------------------------------------------------------------------

/**
 * Optional weather context passed alongside `avoid_exposure` mutations.
 * Schema is intentionally loose for v1; tightens when weather integration
 * ships (v1.5).
 */
export interface WeatherContext {
  wind_direction_deg?: number;
  wind_speed_kph?: number;
  temperature_c?: number;
  conditions?: string;
}

// ---------------------------------------------------------------------------
// Mutation taxonomy — the 19 locked v1 mutations
// ---------------------------------------------------------------------------

export type ClimbCharacter = 'punchy' | 'sustained' | 'rolling' | 'flat';
export type SmoothTarget = 'remove_doublebacks' | 'remove_dead_ends' | 'simplify_turns';
export type ExposureType = 'wind' | 'sun';
export type SegmentProperty = 'steep_climb' | 'exposed' | 'busy_road' | 'rough_surface';
export type OptimizeCriterion = 'scenery' | 'training_value' | 'speed' | 'social';
export type POIType = 'coffee' | 'water' | 'food' | 'bike_shop' | 'restroom' | 'viewpoint';
export type MagnitudeLevel = 'small' | 'moderate' | 'large';

/**
 * The 19 mutation types from Turn Model Spec §3.1.
 */
export type Mutation =
  // ---- Geometric ----
  | { type: 'extend_distance'; delta_km: number; scope?: Scope }
  | { type: 'shorten_distance'; delta_km: number; scope?: Scope }
  | { type: 'trim_route'; from: 'start' | 'end'; amount_km: number }
  | { type: 'reverse_route' }
  | { type: 'smooth_route'; target: SmoothTarget }
  | { type: 'change_route_shape'; target: RouteShape }
  // ---- Climbing ----
  | { type: 'increase_climbing'; magnitude: MagnitudeLevel; scope?: Scope }
  | { type: 'reduce_climbing'; magnitude: MagnitudeLevel; scope?: Scope }
  | { type: 'change_climb_character'; target: ClimbCharacter; scope?: Scope }
  // ---- Routing preferences ----
  | { type: 'change_surface_mix'; target: SurfaceMix; scope?: Scope }
  | { type: 'change_traffic_preference'; target: TrafficPreference; scope?: Scope }
  | { type: 'avoid_exposure'; exposure_type: ExposureType; condition?: WeatherContext }
  // ---- Anchoring & avoidance ----
  | { type: 'anchor_through'; coordinate: Coordinate }
  | {
      type: 'anchor_at_poi';
      poi_query: string;
      poi_type?: POIType;
      position_hint?: 'start' | 'middle' | 'end';
    }
  | { type: 'avoid_segment'; segment_id: SegmentId }
  | {
      type: 'avoid_segment_by_property';
      property: SegmentProperty;
      locator?: { km?: number };
    }
  // ---- Familiarity ----
  | { type: 'swap_to_familiar'; region: string }
  | { type: 'swap_to_unfamiliar'; region: string }
  // ---- High-level ----
  | { type: 'optimize_for'; criterion: OptimizeCriterion };

export type MutationType = Mutation['type'];

// ---------------------------------------------------------------------------
// ManualAction taxonomy — UI-driven direct edits (Turn Model Spec §2)
// ---------------------------------------------------------------------------

/**
 * The 5 manual actions a user can take in the UI. Each carries a direct
 * geometric instruction (not intent) and is handled by ManualHandlers
 * (T2.4), which bypasses ConstraintBuilder and routes through
 * `RouterClient.connect` directly.
 */
export type ManualAction =
  | 'drag_waypoint'
  | 'add_waypoint'
  | 'remove_waypoint'
  | 'reverse_route'
  | 'clear_route';

/**
 * Discriminated payload union for `applyManualAction`. The `action`
 * discriminator must match the `action` argument passed alongside it;
 * `applyManualAction` enforces this with a runtime check.
 */
export type ManualActionPayload =
  | { action: 'drag_waypoint'; waypoint_index: number; new_coord: Coordinate }
  | { action: 'add_waypoint'; coord: Coordinate; insert_at?: number }
  | { action: 'remove_waypoint'; waypoint_index: number }
  | { action: 'reverse_route' }
  | { action: 'clear_route' };

// ---------------------------------------------------------------------------
// RouteContext — passed alongside every executor call
// ---------------------------------------------------------------------------

/**
 * Subset of the full `RouteContext` (Executor Spec §3) that the executor
 * layer reads. The full context will be expanded by T2.3/T2.5.
 */
export interface RouteContext {
  /** User ID. Optional at this layer — only used for telemetry/logging. */
  user_id?: string;

  /** Mapbox access token. Required for MapboxProvider to function. */
  mapbox_token?: string;

  /**
   * Training goal — used to layer training-specific costing in
   * StadiaProvider and to pick a BRouter profile in BRouterProvider.
   */
  training_goal?: string;

  /** User preferences — passed through to legacy provider modules. */
  preferences?: unknown;

  /** Personalized cycling speed in km/h. Passed through to Stadia. */
  user_speed_kph?: number;

  /** Origin coordinate for the route (used by extend_distance, change_route_shape). */
  start_coord?: Coordinate;

  /** Default routing profile when not otherwise inferred. */
  profile?: RoutingProfile;

  /** Default route shape used by handlers that need to preserve shape. */
  shape?: RouteShape;

  /**
   * Speed profile (km/h on flat). Used by extend_distance to estimate
   * detour length. Optional — handlers fall back to defaults.
   */
  speed_profile?: { flat_kph?: number };

  /**
   * Segment IDs the user has previously ridden. Used by
   * swap_to_familiar / swap_to_unfamiliar.
   */
  familiar_segments?: SegmentId[];

  /** Approximate ISO timestamp the ride is planned for; used by avoid_exposure(sun). */
  time_of_day?: string;

  /** Optional weather context, used by avoid_exposure(wind). */
  weather?: WeatherContext;

  /**
   * Recent rides used by `Executor.generate()` to resolve
   * `like_ride_id`. Optional — when missing, generate falls back to a
   * radial loop from `start_coord`. Shape is intentionally minimal at
   * this layer; the full RouteContext (Executor Spec §3) carries
   * richer per-ride telemetry.
   */
  recent_rides?: RideSummary[];
}

// ---------------------------------------------------------------------------
// RideSummary — minimal shape used by `like_ride_id` resolution
// ---------------------------------------------------------------------------

/**
 * Minimum fields the executor reads for `like_ride_id` lookup. The full
 * shape (with stats, training-day metadata, etc.) is defined upstream by
 * the Doc 2b pipeline and is allowed to carry additional fields — only
 * `id` and `waypoints` are load-bearing here.
 */
export interface RideSummary {
  id: string;
  waypoints: Coordinate[];
}

// ---------------------------------------------------------------------------
// GenerationConstraints — input to `Executor.generate()`
// ---------------------------------------------------------------------------

/**
 * Input to `Executor.generate()`. Mirrors Turn Model Spec §3
 * (`GenerationConstraints`). Already constraint-shaped — the executor
 * maps it directly to a `RouteConstraint` without going through
 * ConstraintBuilder.
 *
 * All fields are optional; defaults come from `RouteContext` where
 * applicable.
 */
export interface GenerationConstraints {
  /** Training goal bucket. Loose string — matches `RouteContext.training_goal`. */
  goal?: string;

  /** Target ride duration in minutes. Converted to distance via `speed_profile`. */
  duration_minutes?: number;

  /** Target distance in kilometers. Takes precedence over `duration_minutes` when both are set. */
  distance_km?: number;

  /** Target elevation gain in meters. */
  elevation_gain_m?: number;

  /** Surface mix preference. */
  surface_mix?: SurfaceMix;

  /** Explicit start coordinate. Falls back to `RouteContext.start_coord`. */
  start_coord?: Coordinate;

  /**
   * Reference a past ride as a structural template. The executor
   * resolves the ID via `RouteContext.recent_rides`; on miss it falls
   * through to the radial-loop seed.
   */
  like_ride_id?: string;
}

// ---------------------------------------------------------------------------
// RouteSnapshot — the snapshot shape that flows through the executor
// ---------------------------------------------------------------------------

/**
 * Waypoint on a route. The bare coordinate is the minimum; richer
 * structure (waypoint type, anchor reason) can be added in a later
 * spec revision.
 */
export interface RouteWaypoint {
  coordinate: Coordinate;
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
 * The route shape that flows through the executor layer.
 */
export interface RouteSnapshot {
  geometry: Coordinate[];
  waypoints: RouteWaypoint[];
  stats: RouteStats;
  /**
   * Optional per-geometry-point elevation (meters above sea level).
   * Same length as `geometry` when present. Required by elevation
   * analysis helpers (`elevationUtils`). Handlers that lack this
   * fall back to `stats.elevation_gain_m`.
   */
  elevations_m?: number[];
}

// ---------------------------------------------------------------------------
// ExecutorResult / ExecutorFailure — return shape from executor entry points
// ---------------------------------------------------------------------------

export interface ExecutionMetadata {
  provider_used: ProviderName | null;
  duration_ms: number;
  cache_hit: boolean;
  attempts_tried: number;
  constraint_relaxations?: string[];
}

/**
 * The full set of failure kinds the executor (any layer) can produce.
 * RouterClient produces a subset; MutationHandlers add
 * `mutation_not_supported`.
 */
export type ExecutorFailure =
  | { kind: 'router_unavailable'; providers_tried: ProviderName[] }
  | { kind: 'constraint_infeasible'; constraint: string; explanation: string }
  | { kind: 'waypoint_unreachable'; waypoint_index: number }
  | { kind: 'mutation_not_supported'; mutation_type: string }
  | { kind: 'context_missing'; required_field: string }
  | { kind: 'internal_error'; message: string };

export type ExecutorResult =
  | { ok: true; route: RouteSnapshot; metadata: ExecutionMetadata }
  | { ok: false; reason: ExecutorFailure; partial?: RouteSnapshot };

// Re-export Coordinate for convenience.
export type { Coordinate };
