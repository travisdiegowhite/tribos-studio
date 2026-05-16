/**
 * Executor facade telemetry helpers (T2.5).
 *
 * All events go through `trackRouteBuilder` (T1.4) and arrive in
 * PostHog as `route_builder_executor_*`. Only `generate()` is
 * instrumented here — the three passthrough methods (`applyMutation`,
 * `applyMutations`, `applyManualAction`) inherit telemetry from the
 * MutationHandlers / ManualHandlers layers they delegate to. Adding
 * facade-level events on top of those would double-count.
 */

import { trackRouteBuilder } from '../../../utils/routeBuilderTelemetry';
import type { ExecutorFailure, ProviderName } from '../types';

export function trackExecutorGenerateCalled(properties: {
  count: 1 | 3;
  has_like_ride_id: boolean;
  target_distance_km: number | null;
}): void {
  trackRouteBuilder('executor_generate_called', properties);
}

export function trackExecutorGenerateSucceeded(properties: {
  count: 1 | 3;
  duration_ms: number;
  provider_used: ProviderName | null;
}): void {
  trackRouteBuilder('executor_generate_succeeded', properties);
}

export function trackExecutorGeneratePartial(properties: {
  successful_count: number;
  failed_count: number;
  duration_ms: number;
}): void {
  trackRouteBuilder('executor_generate_partial', properties);
}

export function trackExecutorGenerateFailed(properties: {
  count: 1 | 3;
  duration_ms: number;
  failure_kind: ExecutorFailure['kind'];
}): void {
  trackRouteBuilder('executor_generate_failed', properties);
}
