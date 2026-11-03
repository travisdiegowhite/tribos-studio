/**
 * Landing funnel events (docs/ROUTING-LANDING-SPEC.md §5). Fire-and-forget,
 * never throws. Funnel: landing_viewed → route_requested → route_result(ok)
 * → route_exported → account_created_from_route.
 */

import posthog from 'posthog-js';
import type { ComfortPlan } from '../../utils/comfortLadder';

const MI_M = 1609.344;

export type LandingEvent =
  | 'landing_viewed'
  | 'route_requested'
  | 'route_result'
  | 'alternative_chosen'
  | 'route_exported'
  | 'account_created_from_route';

export function trackLanding(event: LandingEvent, properties: Record<string, unknown> = {}): void {
  try {
    posthog.capture(event, properties);
  } catch {
    // telemetry must never break a flow
  }
}

/** `route_result` properties for a plan (the ok route, else the first alternative). */
export function routeResultProps(plan: ComfortPlan, latency_ms: number): Record<string, unknown> {
  const shown = plan.route ?? plan.alternatives[0] ?? null;
  const v = shown?.validation;
  return {
    outcome: plan.outcome,
    within_comfort_pct: v ? v.withinPct : null,
    flagged_stretches: v ? v.flaggedStretches.length : null,
    flagged_mi: v ? Math.round((v.flagged_m / MI_M) * 100) / 100 : null,
    unknown_pct: v ? v.unknownPct : null,
    alternatives: plan.alternatives.map((a) => a.kind),
    calls: plan.calls,
    latency_ms,
  };
}
