/**
 * Form Score Projection Engine
 *
 * Forward-simulation engine for TFI/AFI/FS. Takes current state,
 * a planned RSS schedule, and a deviation, then projects Form Score at
 * every future quality session under multiple adjustment strategies.
 */

import {
  TFI_TIME_CONSTANT,
  AFI_TIME_CONSTANT,
  QUALITY_FS_THRESHOLD,
  RACE_FS_TARGET_LOW,
  MODIFY_FACTOR,
  EASY_DAY_DEFAULT_TSS,
  SWAP_OFFSET_DAYS,
} from './constants';
import type {
  DailyLoad,
  ProjectionState,
  ProjectionResult,
  FSZone,
  AdjustmentProjections,
  AdjustmentOption,
  DeviationImpact,
} from './types';

// ── Core Step Function ───────────────────────────────────────────────────────

/**
 * Step the TFI/AFI/FS state forward by one day given today's RSS.
 * This is the core loop — just three arithmetic operations.
 */
export function stepDay(state: ProjectionState, rss: number): ProjectionState {
  const tfi = state.tfi + (rss - state.tfi) / TFI_TIME_CONSTANT;
  const afi = state.afi + (rss - state.afi) / AFI_TIME_CONSTANT;
  return { tfi, afi, formScore: tfi - afi };
}

// ── Schedule Projection ──────────────────────────────────────────────────────

/**
 * Project FS forward across a schedule of daily loads.
 * Returns state at each day, labeled with zone and quality flag.
 */
export function projectSchedule(
  initial: ProjectionState,
  schedule: DailyLoad[]
): ProjectionResult[] {
  let state = { ...initial };
  return schedule.map(day => {
    state = stepDay(state, day.rss);
    return {
      day: day.date,
      state: { ...state },
      is_quality: day.is_quality,
      fs_zone: classifyFS(state.formScore),
    };
  });
}

// ── Form Score Zone Classification ───────────────────────────────────────────

export function classifyFS(formScore: number): FSZone {
  if (formScore >= RACE_FS_TARGET_LOW) return 'race_ready';
  if (formScore >= -10) return 'building';
  if (formScore >= -25) return 'heavy_load';
  return 'overreached';
}

// ── Adjustment Projections ───────────────────────────────────────────────────

/**
 * Given current state, a deviation (extra RSS today), the planned schedule,
 * and the index of the next quality session — returns projected FS under
 * each of the four adjustment strategies.
 */
export function projectAdjustmentOptions(
  initial: ProjectionState,
  schedule: DailyLoad[],
  deviationRSS: number,
  qualityIdx: number
): AdjustmentProjections {
  const qualityRSS = schedule[qualityIdx].rss;

  // Build schedule variants
  const withDeviation = [...schedule];
  withDeviation[0] = { ...withDeviation[0], rss: deviationRSS };

  // Modify: trim quality session to MODIFY_FACTOR (70%)
  const modifiedSchedule = [...withDeviation];
  modifiedSchedule[qualityIdx] = {
    ...modifiedSchedule[qualityIdx],
    rss: Math.round(qualityRSS * MODIFY_FACTOR),
  };

  // Swap: replace quality day with easy, insert quality SWAP_OFFSET_DAYS later
  const swapSchedule = [...withDeviation];
  swapSchedule[qualityIdx] = {
    ...swapSchedule[qualityIdx],
    rss: EASY_DAY_DEFAULT_TSS,
    is_quality: false,
  };
  const swapTargetIdx = qualityIdx + SWAP_OFFSET_DAYS;
  if (swapTargetIdx < swapSchedule.length) {
    swapSchedule[swapTargetIdx] = {
      ...swapSchedule[swapTargetIdx],
      rss: qualityRSS,
      is_quality: true,
    };
  }

  // Insert rest: add zero-RSS day before quality session
  const restSchedule = [...withDeviation];
  restSchedule.splice(qualityIdx, 0, {
    date: 'inserted_rest',
    rss: 0,
    is_quality: false,
  });

  // Helper to get FS at a specific index
  const fsAtIdx = (sched: DailyLoad[], idx: number) => {
    const projection = projectSchedule(initial, sched);
    return projection[idx]?.state.formScore ?? 0;
  };

  // For swap, the quality session is at swapTargetIdx
  const effectiveSwapIdx = Math.min(swapTargetIdx, swapSchedule.length - 1);

  return {
    planned: fsAtIdx(schedule, qualityIdx),
    no_adjust: fsAtIdx(withDeviation, qualityIdx),
    modify: fsAtIdx(modifiedSchedule, qualityIdx),
    swap: fsAtIdx(swapSchedule, effectiveSwapIdx),
    insert_rest: fsAtIdx(restSchedule, qualityIdx + 1), // shifted by 1 due to insertion
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
  const fs_gap = projections.planned - projections.no_adjust;
  const will_breach_threshold = projections.no_adjust < QUALITY_FS_THRESHOLD;
  const importance = options.qualitySessionImportance;

  if (!will_breach_threshold && fs_gap < 5) {
    return {
      intervention_needed: false,
      urgency: 'none',
      fs_gap,
      recommended_option: 'no_adjust',
    };
  }

  // Score each option by distance from planned FS (closer = better)
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

  return { intervention_needed: true, urgency, fs_gap, recommended_option };
}
