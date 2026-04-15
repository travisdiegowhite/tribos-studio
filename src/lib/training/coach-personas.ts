/**
 * Coach Persona Ranking
 *
 * Each persona has a utility function that scores adjustment options differently.
 * Returns a ranked list with per-persona reasoning text for the AI.
 */

import type {
  CoachPersona,
  AdjustmentOption,
  AdjustmentProjections,
  RankedOption,
  RankingContext,
} from './types';

interface OptionScores {
  no_adjust: number;
  modify: number;
  swap: number;
  insert_rest: number;
  drop: number;
}

/**
 * Rank adjustment options through a persona's lens.
 * Returns options sorted by score (highest first) with rationale text.
 */
export function rankOptions(
  persona: CoachPersona,
  projections: AdjustmentProjections,
  context: RankingContext
): RankedOption[] {
  const scores: OptionScores = {
    no_adjust: 0,
    modify: 0,
    swap: 0,
    insert_rest: 0,
    drop: 0,
  };

  switch (persona) {
    case 'hammer':
      // Minimizes disruption — pushes athlete to absorb load
      scores.no_adjust = context.fsGap < 15 ? 80 : 40;
      scores.modify = 70;
      scores.swap = 50;
      scores.insert_rest = 30;
      scores.drop = 10;
      break;

    case 'scientist':
      // Maximizes TSB accuracy — picks option closest to planned TSB
      scores.no_adjust = 100 - Math.abs(projections.no_adjust - projections.planned) * 3;
      scores.modify = 100 - Math.abs(projections.modify - projections.planned) * 3;
      scores.swap = context.swapFeasible
        ? 100 - Math.abs(projections.swap - projections.planned) * 3
        : 0;
      scores.insert_rest = 100 - Math.abs(projections.insert_rest - projections.planned) * 3;
      scores.drop = 20;
      break;

    case 'encourager':
      // Prefers options where athlete still gets a quality session
      scores.no_adjust = 60;
      scores.modify = 85;
      scores.swap = 75;
      scores.insert_rest = 55;
      scores.drop = 15;
      break;

    case 'pragmatist':
      // Minimizes calendar disruption — prefers simple changes
      scores.no_adjust = context.fsGap < 10 ? 90 : 50;
      scores.modify = 70;
      scores.swap = context.swapFeasible ? 85 : 20;
      scores.insert_rest = 55;
      scores.drop = 40;
      break;

    case 'competitor':
      // Protects A-event readiness above all else
      scores.no_adjust = context.isNearRace ? 10 : 60;
      scores.modify = context.isNearRace ? 30 : 70;
      scores.swap = context.isNearRace && context.swapFeasible ? 80 : 65;
      scores.insert_rest = context.isNearRace ? 90 : 50;
      scores.drop = context.isNearRace ? 85 : 20;
      break;
  }

  return (Object.entries(scores) as [AdjustmentOption, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([option, score]) => ({
      option,
      score,
      rationale: RATIONALES[option][persona],
    }));
}

// ── Persona-specific rationale text ──────────────────────────────────────────

const RATIONALES: Record<AdjustmentOption, Record<CoachPersona, string>> = {
  no_adjust: {
    hammer: 'You can take it. Legs are tired but that just means training is working.',
    scientist: 'TSB gap is within acceptable range. Monitor ATL over next 48h.',
    encourager: "You've handled sessions like this before. Let's see how the next one feels.",
    pragmatist: 'Nothing to change — keep the week as planned.',
    competitor: 'Risk vs. reward here. With race day this close, I want to protect the quality session.',
  },
  modify: {
    hammer: 'Hit 70% today, come back full strength next week.',
    scientist: 'Reducing the quality session by 30% keeps TSB within target range.',
    encourager: "Still a great workout — just a little trimmed so you're sharp.",
    pragmatist: 'Trim the next session slightly, keep everything else the same.',
    competitor: 'Quality over quantity. Fewer sharp intervals beats more flat ones.',
  },
  swap: {
    hammer: "Later in the week is open. Full session, no compromises.",
    scientist: 'Two extra recovery days brings TSB back to planned levels.',
    encourager: "Next hard day becomes an easy spin, then you'll be flying for the swapped session.",
    pragmatist: 'Easy swap — light day first, then the quality session as planned.',
    competitor: 'Protecting the quality session is the priority. Swapping works.',
  },
  insert_rest: {
    hammer: "One extra day won't hurt. You'll come back stronger.",
    scientist: 'Rest day reduces ATL optimally before the quality session.',
    encourager: "A rest day is training too. You'll come back bigger.",
    pragmatist: 'Add a rest day, keep everything else.',
    competitor: 'Race prep means showing up fresh. Rest day is the move.',
  },
  drop: {
    hammer: "We're skipping this one. Protect the block.",
    scientist: 'TSB recovery requires removing this session. Data is clear.',
    encourager: "This week's already been big — take it as a bonus rest day.",
    pragmatist: 'Drop it, pick up next week clean.',
    competitor: 'Nothing compromises race day. Drop it.',
  },
};
