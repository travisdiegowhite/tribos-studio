/**
 * Telemetry for route-generation fallback occurrences.
 *
 * PostHog is initialised in `src/main.jsx` via `<PostHogProvider>`, which
 * also wires up the `posthog-js` singleton. The `posthog` import here is
 * that same singleton, so capture calls from non-component code reach the
 * configured project the same way `usePostHog()` would from a component.
 */

import posthog from 'posthog-js';
import type { FallbackTier, FallbackReason } from './routeGenerationFallback';

export interface FallbackEvent {
  tier: FallbackTier;
  reason: FallbackReason;
  userId?: string | null;
  trainingGoal?: string;
  targetDistanceKm?: number;
}

export function captureFallback(event: FallbackEvent): void {
  try {
    posthog.capture('route_fallback_used', {
      tier: event.tier,
      reason: event.reason,
      user_id: event.userId ?? null,
      training_goal: event.trainingGoal,
      target_distance_km: event.targetDistanceKm,
    });
  } catch (err) {
    // PostHog may be uninitialised in tests / dev — never let telemetry
    // break the user-facing fallback path.
    console.warn('[fallback] posthog capture failed:', err);
  }
}
