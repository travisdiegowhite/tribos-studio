/**
 * RouterClient local types — Executor Spec §2 and §4.3 narrowed to what
 * the routing layer needs.
 *
 * Per T2.2, executor-wide types (RouteConstraint, RouteContext,
 * RouteSnapshot, ExecutorResult, ExecutorFailure, ExecutionMetadata,
 * ProviderName, RoutingProfile, RouteShape, etc.) have been relocated
 * to `src/routing/executor/types.ts`. This module now re-exports them
 * alongside the RouterClient-specific provider adapter contract.
 */

import type { Coordinate } from '../../types/geo';
import type { ProviderName, RoutingProfile, RouteSnapshot } from '../executor/types';

// ---------------------------------------------------------------------------
// Re-exports of executor-wide types (preserves existing import paths)
// ---------------------------------------------------------------------------

export type {
  Coordinate,
  ExecutionMetadata,
  ExecutorFailure,
  ExecutorResult,
  ProviderName,
  RouteConstraint,
  RouteContext,
  RouteShape,
  RouteSnapshot,
  RouteStats,
  RouteWaypoint,
  RoutingProfile,
  SegmentId,
  SurfaceMix,
  TrafficPreference,
} from '../executor/types';

// ---------------------------------------------------------------------------
// Provider adapter contract — RouterClient-specific
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
    constraint: import('../executor/types').RouteConstraint,
    context: import('../executor/types').RouteContext,
  ): Promise<ProviderResult>;

  /**
   * Geometry through an ordered waypoint list. Used by manual edits.
   * No preference satisfaction — connect-the-dots with cycling-default
   * road preference.
   */
  connect(
    waypoints: Coordinate[],
    context: import('../executor/types').RouteContext,
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
