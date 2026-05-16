/**
 * RouterClient public API.
 *
 * Production callers should use `getRouterClient()`. Tests can
 * construct `RouterClient` directly or replace the singleton via
 * `setRouterClient()`.
 *
 * T2.1 ships this module with zero production callers. T2.5 (Executor
 * facade) will wire it in.
 */

import { RouterClient } from './RouterClient';
import type { RouterClientConfig } from './types';

let instance: RouterClient | null = null;

export function getRouterClient(): RouterClient {
  if (!instance) instance = new RouterClient();
  return instance;
}

/** Test injection point. Replaces the singleton. */
export function setRouterClient(client: RouterClient | null): void {
  instance = client;
}

export function createRouterClient(config: RouterClientConfig = {}): RouterClient {
  return new RouterClient(config);
}

export { RouterClient };
export type {
  ExecutionMetadata,
  ExecutorFailure,
  ExecutorResult,
  ProviderConfig,
  ProviderFailure,
  ProviderName,
  ProviderResult,
  RouteConstraint,
  RouteContext,
  RouteProvider,
  RouteShape,
  RouteSnapshot,
  RouteStats,
  RouteWaypoint,
  RouterClientConfig,
  RoutingProfile,
  SegmentId,
  SurfaceMix,
  TrafficPreference,
} from './types';
export { PROVIDER_REGISTRY, getProvidersForProfile, normalizeProfile } from './registry';
