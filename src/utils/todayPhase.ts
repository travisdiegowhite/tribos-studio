/**
 * Pure helper: compute week-in-phase position from a plan template.
 *
 * Given a TrainingPlanTemplate (whose `phases` array is shaped like
 *   { weeks: number[], phase: TrainingPhase, focus: string }
 * ) and the current week number, return the position inside the matching
 * phase entry. Returns null if the template or current week is missing.
 *
 * The audit notes that this arithmetic doesn't exist anywhere else in
 * the codebase yet — every Today component reads it through this helper.
 */

import type { TrainingPhase, TrainingPlanTemplate } from '../types/training';

export interface PhasePosition {
  phase: TrainingPhase;
  weekInPhase: number;       // 1-indexed
  weeksInPhase: number;
  weeksRemaining: number;    // weeks left in phase, exclusive of current
}

export function computePhasePosition(
  template: TrainingPlanTemplate | null | undefined,
  currentWeek: number | null | undefined,
): PhasePosition | null {
  if (!template?.phases || !currentWeek) return null;

  for (const phase of template.phases) {
    if (Array.isArray(phase.weeks) && phase.weeks.includes(currentWeek)) {
      const idx = phase.weeks.indexOf(currentWeek);
      return {
        phase: phase.phase,
        weekInPhase: idx + 1,
        weeksInPhase: phase.weeks.length,
        weeksRemaining: phase.weeks.length - idx - 1,
      };
    }
  }
  return null;
}
