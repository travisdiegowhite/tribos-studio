/**
 * MutationHandlers telemetry helpers (T2.3).
 *
 * All events go through `trackRouteBuilder` (T1.4), which prefixes every
 * event with `route_builder_`. MutationHandlers events carry an extra
 * `mutation_handler_` prefix, so they arrive in PostHog as
 * `route_builder_mutation_handler_*` — the same nesting pattern
 * RouterClient uses for its `routerclient_*` stream.
 *
 * The six events mirror the T2.3 spec's telemetry table. Keeping them in
 * thin wrappers (rather than inline `trackRouteBuilder` calls) means the
 * property shapes are defined in exactly one place.
 */

import { trackRouteBuilder } from '../../../utils/routeBuilderTelemetry';
import type { ExecutionMetadata, ExecutorFailure, MutationType } from '../types';

/**
 * Which layer produced a failure. Drives post-launch tuning: failures
 * concentrated in `constraint_builder` mean the mutation translation
 * needs work; failures in `router` mean the routing providers do.
 */
export type FailureOrigin = 'constraint_builder' | 'router';

export function trackMutationHandlerStarted(
  mutationType: MutationType,
  isCompositional: boolean,
): void {
  trackRouteBuilder('mutation_handler_started', {
    mutation_type: mutationType,
    is_compositional: isCompositional,
  });
}

export function trackMutationHandlerSucceeded(
  mutationType: MutationType,
  metadata: ExecutionMetadata,
): void {
  trackRouteBuilder('mutation_handler_succeeded', {
    mutation_type: mutationType,
    duration_ms: metadata.duration_ms,
    provider_used: metadata.provider_used,
    cache_hit: metadata.cache_hit,
  });
}

export function trackMutationHandlerFailed(
  mutationType: MutationType,
  durationMs: number,
  failureKind: ExecutorFailure['kind'],
  failureOrigin: FailureOrigin,
): void {
  trackRouteBuilder('mutation_handler_failed', {
    mutation_type: mutationType,
    duration_ms: durationMs,
    failure_kind: failureKind,
    failure_origin: failureOrigin,
  });
}

export function trackMutationHandlerCompositionalStarted(mutationCount: number): void {
  trackRouteBuilder('mutation_handler_compositional_started', {
    mutation_count: mutationCount,
  });
}

export function trackMutationHandlerCompositionalSucceeded(
  mutationCount: number,
  totalDurationMs: number,
): void {
  trackRouteBuilder('mutation_handler_compositional_succeeded', {
    mutation_count: mutationCount,
    total_duration_ms: totalDurationMs,
  });
}

export function trackMutationHandlerCompositionalRolledBack(
  mutationCount: number,
  failedAtIndex: number,
  failureKind: ExecutorFailure['kind'],
  partialProgressMs: number,
): void {
  trackRouteBuilder('mutation_handler_compositional_rolled_back', {
    mutation_count: mutationCount,
    failed_at_index: failedAtIndex,
    failure_kind: failureKind,
    partial_progress_ms: partialProgressMs,
  });
}
