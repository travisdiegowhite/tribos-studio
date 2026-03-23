/**
 * Deviation Detection Pipeline
 *
 * Runs after every workout sync. Computes the diff between planned and actual,
 * classifies the deviation, calls the fatigue estimator and projection engine,
 * then returns a full DeviationAnalysis.
 */

import { estimateTSS } from './fatigue-estimation';
import {
  projectAdjustmentOptions,
  assessDeviationImpact,
} from './tsb-projection';
import { DEVIATION_MIN_DELTA, DEVIATION_MIN_RATIO } from './constants';
import type {
  ActivityData,
  CalibrationFactors,
  DailyLoad,
  ProjectionState,
  PlannedWorkoutRef,
  DeviationAnalysis,
  DeviationType,
} from './types';

/**
 * Main entry point for deviation analysis.
 *
 * @param actual — The completed activity data
 * @param planned — The planned workout for this day
 * @param currentState — Current CTL/ATL/TSB state
 * @param upcomingSchedule — Next 14 days of planned workouts as DailyLoad[]
 * @param calibration — User's TSS estimation calibration factors
 */
export function analyzeDeviation(
  actual: ActivityData,
  planned: PlannedWorkoutRef,
  currentState: ProjectionState,
  upcomingSchedule: DailyLoad[],
  calibration: CalibrationFactors
): DeviationAnalysis {
  const estimate = estimateTSS(actual, calibration);
  const delta = estimate.tss - planned.tss;
  const ratio = delta / Math.max(planned.tss, 1);

  // Not a meaningful deviation
  if (delta < DEVIATION_MIN_DELTA && ratio < DEVIATION_MIN_RATIO) {
    return { has_deviation: false };
  }

  // Classify deviation type
  const deviation_type = classifyDeviationType(actual, planned, delta);

  // Severity: 0–10 scale factoring both TSS delta and ratio
  const rawSeverity = (delta / 10) * 0.6 + (ratio * 10) * 0.4;
  const severity_score = Math.round(Math.min(10, Math.max(0, rawSeverity)) * 10) / 10;

  // Find next quality session in upcoming schedule
  const qualityIdx = upcomingSchedule.findIndex(d => d.is_quality);
  if (qualityIdx === -1) {
    // No upcoming quality session — return deviation info without adjustment options
    return {
      has_deviation: true,
      deviation_type,
      severity_score,
      tss_estimate: estimate,
    };
  }

  // Check swap feasibility: is there a light day 2 slots after quality session?
  const swapTargetIdx = qualityIdx + 2;
  const swapFeasible = swapTargetIdx < upcomingSchedule.length
    && upcomingSchedule[swapTargetIdx].tss < 60
    && !upcomingSchedule[swapTargetIdx].is_quality;

  const adjustment_options = projectAdjustmentOptions(
    currentState,
    upcomingSchedule,
    estimate.tss,
    qualityIdx
  );

  const impact = assessDeviationImpact(adjustment_options, {
    swapFeasible,
    qualitySessionImportance: 'B', // TODO: pull from plan metadata
  });

  return {
    has_deviation: true,
    deviation_type,
    severity_score,
    tss_estimate: estimate,
    adjustment_options,
    impact,
  };
}

/**
 * Classify the type of deviation based on actual vs planned workout characteristics.
 */
function classifyDeviationType(
  actual: ActivityData,
  planned: PlannedWorkoutRef,
  delta: number
): DeviationType {
  // Different workout type entirely
  if (actual.workout_type && actual.workout_type !== planned.type) {
    return 'type_substitution';
  }

  // Duration significantly longer with similar intensity = volume upgrade
  if (delta > 0 && planned.tss > 0) {
    const expectedHours = planned.tss / 48; // rough TSS/hour for endurance
    const actualHours = actual.duration_seconds / 3600;
    if (actualHours > expectedHours * 1.3) {
      return 'volume_upgrade';
    }
  }

  // Default: intensity was too high
  return 'intensity_upgrade';
}
