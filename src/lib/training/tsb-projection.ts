/**
 * TSB Projection Engine
 *
 * Forward-simulation engine for CTL/ATL/TSB. Takes current state,
 * a planned TSS schedule, and a deviation, then projects TSB at every
 * future quality session under multiple adjustment strategies.
 */

import {
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  QUALITY_TSB_THRESHOLD,
  RACE_TSB_TARGET_LOW,
  MODIFY_FACTOR,
  EASY_DAY_DEFAULT_TSS,
  SWAP_OFFSET_DAYS,
} from './constants';
import type {
  DailyLoad,
  ProjectionState,
  ProjectionResult,
  TSBZone,
  AdjustmentProjections,
  AdjustmentOption,
  DeviationImpact,
} from './types';

// ── Core Step Function ───────────────────────────────────────────────────────

/**
 * Step the CTL/ATL/TSB state forward by one day given today's TSS.
 * This is the core loop — just three arithmetic operations.
 */
export function stepDay(state: ProjectionState, tss: number): ProjectionState {
  const ctl = state.ctl + (tss - state.ctl) / CTL_TIME_CONSTANT;
  const atl = state.atl + (tss - state.atl) / ATL_TIME_CONSTANT;
  return { ctl, atl, tsb: ctl - atl };
}

// ── Schedule Projection ──────────────────────────────────────────────────────

/**
 * Project TSB forward across a schedule of daily loads.
 * Returns state at each day, labeled with zone and quality flag.
 */
export function projectSchedule(
  initial: ProjectionState,
  schedule: DailyLoad[]
): ProjectionResult[] {
  let state = { ...initial };
  return schedule.map(day => {
    state = stepDay(state, day.tss);
    return {
      day: day.date,
      state: { ...state },
      is_quality: day.is_quality,
      tsb_zone: classifyTSB(state.tsb),
    };
  });
}

// ── TSB Zone Classification ──────────────────────────────────────────────────

export function classifyTSB(tsb: number): TSBZone {
  if (tsb >= RACE_TSB_TARGET_LOW) return 'race_ready';
  if (tsb >= -10) return 'building';
  if (tsb >= -25) return 'heavy_load';
  return 'overreached';
}

// ── Adjustment Projections ───────────────────────────────────────────────────

/**
 * Given current state, a deviation (extra TSS today), the planned schedule,
 * and the index of the next quality session — returns projected TSB under
 * each of the four adjustment strategies.
 */
export function projectAdjustmentOptions(
  initial: ProjectionState,
  schedule: DailyLoad[],
  deviationTSS: number,
  qualityIdx: number
): AdjustmentProjections {
  const qualityTSS = schedule[qualityIdx].tss;

  // Build schedule variants
  const withDeviation = [...schedule];
  withDeviation[0] = { ...withDeviation[0], tss: deviationTSS };

  // Modify: trim quality session to MODIFY_FACTOR (70%)
  const modifiedSchedule = [...withDeviation];
  modifiedSchedule[qualityIdx] = {
    ...modifiedSchedule[qualityIdx],
    tss: Math.round(qualityTSS * MODIFY_FACTOR),
  };

  // Swap: replace quality day with easy, insert quality SWAP_OFFSET_DAYS later
  const swapSchedule = [...withDeviation];
  swapSchedule[qualityIdx] = {
    ...swapSchedule[qualityIdx],
    tss: EASY_DAY_DEFAULT_TSS,
    is_quality: false,
  };
  const swapTargetIdx = qualityIdx + SWAP_OFFSET_DAYS;
  if (swapTargetIdx < swapSchedule.length) {
    swapSchedule[swapTargetIdx] = {
      ...swapSchedule[swapTargetIdx],
      tss: qualityTSS,
      is_quality: true,
    };
  }

  // Insert rest: add zero-TSS day before quality session
  const restSchedule = [...withDeviation];
  restSchedule.splice(qualityIdx, 0, {
    date: 'inserted_rest',
    tss: 0,
    is_quality: false,
  });

  // Helper to get TSB at a specific index
  const tsbAtIdx = (sched: DailyLoad[], idx: number) => {
    const projection = projectSchedule(initial, sched);
    return projection[idx]?.state.tsb ?? 0;
  };

  // For swap, the quality session is at swapTargetIdx
  const effectiveSwapIdx = Math.min(swapTargetIdx, swapSchedule.length - 1);

  return {
    planned: tsbAtIdx(schedule, qualityIdx),
    no_adjust: tsbAtIdx(withDeviation, qualityIdx),
    modify: tsbAtIdx(modifiedSchedule, qualityIdx),
    swap: tsbAtIdx(swapSchedule, effectiveSwapIdx),
    insert_rest: tsbAtIdx(restSchedule, qualityIdx + 1), // shifted by 1 due to insertion
  };
}

// ── Deviation Impact Assessment ──────────────────────────────────────────────

/**
 * Determines whether intervention is needed and scores urgency.
 */
export function assessDeviationImpact(
  projections: AdjustmentProjections,
  options: {
    swapFeasible: boolean;
    qualitySessionImportance: 'A' | 'B' | 'C';
  }
): DeviationImpact {
  const tsb_gap = projections.planned - projections.no_adjust;
  const will_breach_threshold = projections.no_adjust < QUALITY_TSB_THRESHOLD;
  const importance = options.qualitySessionImportance;

  if (!will_breach_threshold && tsb_gap < 5) {
    return {
      intervention_needed: false,
      urgency: 'none',
      tsb_gap,
      recommended_option: 'no_adjust',
    };
  }

  // Score each option by distance from planned TSB (closer = better)
  const candidates: [AdjustmentOption, number][] = [
    ['modify', Math.abs(projections.modify - projections.planned)],
    ['insert_rest', Math.abs(projections.insert_rest - projections.planned)],
  ];
  if (options.swapFeasible) {
    candidates.push(['swap', Math.abs(projections.swap - projections.planned)]);
  }
  candidates.sort((a, b) => a[1] - b[1]);
  const recommended_option = candidates[0][0];

  const urgency: DeviationImpact['urgency'] =
    importance === 'A' && will_breach_threshold ? 'high'
    : will_breach_threshold ? 'medium'
    : 'low';

  return { intervention_needed: true, urgency, tsb_gap, recommended_option };
}
