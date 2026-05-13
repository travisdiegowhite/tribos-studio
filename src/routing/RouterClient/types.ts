/**
 * RouterClient local types — Executor Spec §2 and §4.3 narrowed to what
 * the routing layer needs. Imports the canonical `Coordinate` from
 * `src/types/geo.ts`.
 *
 * Why these live in `src/routing/RouterClient/types.ts` rather than the
 * shared `src/types/` tree: T2.1 ships RouterClient as a self-contained
 * module with no production callers. Once T2.5 (executor facade) lands
 * and other modules begin importing `ExecutorResult` / `RouteSnapshot`,
 * the right home is `src/types/executor.ts`. For now, local keeps the
 * blast radius small.
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
 * higher-level analysis layer (out of scope for T2.1) attaches meaning.
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
// RouteContext — passed alongside every solve()/connect() call
// ---------------------------------------------------------------------------

/**
 * Subset of the full `RouteContext` (Executor Spec §3) that the routing
 * layer reads. RouterClient does not need user identity, history, or
 * memory — those are consumed by the mutation handlers in T2.3.
 *
 * The full RouteContext is passed; this interface narrows what the
 * router actually touches.
 */
export interface RouteContext {
  /** User ID. Optional at this layer — only used for telemetry/logging. */
  user_id?: string;

  /** Mapbox access token. Required for MapboxProvider to function. */
  mapbox_token?: string;

  /**
   * Training goal — used to layer training-specific costing in
   * StadiaProvider and to pick a BRouter profile in BRouterProvider.
   * Free-form string; the providers handle their own subset.
   */
  training_goal?: string;

  /** User preferences — passed through to legacy provider modules. */
  preferences?: unknown;

  /** Personalized cycling speed in km/h. Passed through to Stadia. */
  user_speed_kph?: number;
}

// ---------------------------------------------------------------------------
// RouteSnapshot — output shape
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
 *
 * Note: this is a narrower shape than the legacy
 * `smartCyclingRouter` result. Provider-specific extras (Stadia's
 * maneuvers, road classification, etc.) are dropped at the adapter
 * boundary. If those become needed later, add a `metadata.diagnostics`
 * field rather than re-widening this type.
 */
export interface RouteSnapshot {
  geometry: Coordinate[];
  waypoints: RouteWaypoint[];
  stats: RouteStats;
}

// ---------------------------------------------------------------------------
// ExecutorResult — return shape from solve()/connect()
// ---------------------------------------------------------------------------

export interface ExecutionMetadata {
  provider_used: ProviderName | null;
  duration_ms: number;
  cache_hit: boolean;
  attempts_tried: number;
  constraint_relaxations?: string[];
}

/**
 * Failures the router itself can produce. The richer set in Executor
 * Spec §2.1 (e.g. `mutation_not_supported`) is produced by handler
 * layers above this one.
 */
export type ExecutorFailure =
  | { kind: 'router_unavailable'; providers_tried: ProviderName[] }
  | { kind: 'constraint_infeasible'; constraint: string; explanation: string }
  | { kind: 'waypoint_unreachable'; waypoint_index: number }
  | { kind: 'context_missing'; required_field: string }
  | { kind: 'internal_error'; message: string };

export type ExecutorResult =
  | { ok: true; route: RouteSnapshot; metadata: ExecutionMetadata }
  | { ok: false; reason: ExecutorFailure; partial?: RouteSnapshot };

// ---------------------------------------------------------------------------
// Provider adapter contract
// ---------------------------------------------------------------------------

export type ProviderFailure =
  | { kind: 'network_error'; message: string }
  | { kind: 'http_error'; status: number; message: string }
  | { kind: 'timeout'; timeout_ms: number }
  | { kind: 'invalid_response'; message: string }
  | { kind: 'no_route_found'; message: string }
  | { kind: 'profile_unsupported'; profile: RoutingProfile };

export type ProviderResult =
  | { ok: true; route: RouteSnapshot; duration_ms: number }
  | { ok: false; reason: ProviderFailure; duration_ms: number };

export interface RouteProvider {
  readonly name: ProviderName;

  /** Whether this provider can handle the given profile. */
  supports(profile: RoutingProfile): boolean;

  /**
   * Full preference-aware routing. Used by the LLM mutation path.
   */
  solve(
    constraint: RouteConstraint,
    context: RouteContext,
  ): Promise<ProviderResult>;

  /**
   * Geometry through an ordered waypoint list. Used by manual edits.
   * No preference satisfaction — connect-the-dots with cycling-default
   * road preference.
   */
  connect(
    waypoints: Coordinate[],
    context: RouteContext,
  ): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  profile: RoutingProfile;
  providers: ProviderName[];
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface RouterClientConfig {
  cacheMaxSize?: number;
  cacheTtlMs?: number;
  dedupWindowMs?: number;
  /**
   * Override the registry (test injection). Production code should use
   * the default registry from `registry.ts`.
   */
  registry?: ProviderConfig[];
  /**
   * Override the providers map (test injection).
   */
  providers?: Partial<Record<ProviderName, RouteProvider>>;
}
