/**
 * Which route the landing draws as soon as a plan comes back.
 *
 * The ladder's "alternatives" outcome means the exact request failed, but a
 * shape or distance alternative at the rider's own level is still a route
 * they asked for ("Counter-clockwise instead", "26 mi instead of 30"). Hiding
 * it behind a card read as "no route" in testing (2026-11-03), so it's drawn
 * at once, with its note, and the other alternatives stay as cards. A
 * "ride it at Comfort L+1" alternative is never drawn unasked: it's above the
 * level the rider chose.
 */

import type { ComfortCandidate, ComfortPlan } from '../../utils/comfortLadder';

export function firstToShow(plan: ComfortPlan): ComfortCandidate | null {
  if (plan.route) return plan.route;
  if (plan.outcome !== 'alternatives') return null;
  return plan.alternatives.find((a) => a.level === plan.level && a.kind !== 'comfort_up') ?? null;
}
