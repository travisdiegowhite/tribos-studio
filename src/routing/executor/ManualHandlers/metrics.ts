/**
 * ManualHandlers telemetry helpers (T2.4).
 *
 * All events go through `trackRouteBuilder` (T1.4), which prefixes every
 * event with `route_builder_`. ManualHandlers events carry an extra
 * `manual_handler_` prefix, so they arrive in PostHog as
 * `route_builder_manual_handler_*` — same nesting pattern as the
 * `mutation_handler_*` stream.
 *
 * The three events mirror the T2.4 spec's telemetry table.
 *
 * Note: T1.4 also emits `route_edit_applied` at the application layer.
 * Both events fire at different layers — T1.4 records that a UI edit
 * was dispatched; these events record that the executor processed it.
 * Do not collapse them.
 */

import { trackRouteBuilder } from '../../../utils/routeBuilderTelemetry';
import type { ExecutorFailure, ManualAction, ProviderName } from '../types';

export function trackManualHandlerStarted(action: ManualAction): void {
  trackRouteBuilder('manual_handler_started', { action });
}

export function trackManualHandlerSucceeded(
  action: ManualAction,
  durationMs: number,
  providerUsed: ProviderName | null,
  cacheHit: boolean,
): void {
  trackRouteBuilder('manual_handler_succeeded', {
    action,
    duration_ms: durationMs,
    provider_used: providerUsed,
    cache_hit: cacheHit,
  });
}

export function trackManualHandlerFailed(
  action: ManualAction,
  durationMs: number,
  failureKind: ExecutorFailure['kind'],
): void {
  trackRouteBuilder('manual_handler_failed', {
    action,
    duration_ms: durationMs,
    failure_kind: failureKind,
  });
}
