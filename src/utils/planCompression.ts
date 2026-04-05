/**
 * Plan Compression Engine
 * Compresses training plan templates to fit a target event date,
 * using the user's fitness level to determine which phases can be shortened.
 *
 * Strategy:
 * 1. Calculate available weeks from start to target date
 * 2. Cut weeks from early base phases first (fitter users need less base)
 * 3. Never cut taper/peak/race weeks or recovery weeks after build blocks
 * 4. Re-number remaining weeks and rebuild phases
 */

import type {
  TrainingPlanTemplate,
  TrainingPhase,
  FitnessLevel,
} from '../types/training';

// ============================================================
// TYPES
// ============================================================

export interface CompressedPlanResult {
  /** The compressed template with renumbered weeks */
  template: TrainingPlanTemplate;
  /** Original duration in weeks */
  originalDuration: number;
  /** New duration in weeks */
  compressedDuration: number;
  /** Weeks that were removed (original week numbers) */
  removedWeeks: number[];
  /** Warnings about aggressive compression */
  warnings: string[];
  /** Whether compression was actually needed */
  wasCompressed: boolean;
}

export interface CompressionOptions {
  /** Target event/race date */
  targetDate: Date;
  /** Plan start date */
  startDate: Date;
  /** User's fitness level (beginner/intermediate/advanced) */
  fitnessLevel: FitnessLevel;
  /** Optional CTL for more precise fitness assessment */
  ctl?: number;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Max percentage of base phase weeks that can be cut by fitness level */
const BASE_CUT_LIMITS: Record<FitnessLevel, number> = {
  advanced: 0.5,      // Can skip up to 50% of base weeks
  intermediate: 0.3,  // Can skip up to 30% of base weeks
  beginner: 0.15,     // Can skip up to 15% of base weeks
};

/** CTL thresholds for overriding fitness level assessment */
const CTL_THRESHOLDS = {
  advanced: 60,
  intermediate: 30,
};

/** Phases that should NEVER be cut */
const PROTECTED_PHASES: Set<TrainingPhase> = new Set(['taper', 'peak']);

/** Maximum percentage of total plan that can be removed */
const MAX_COMPRESSION_RATIO = 0.4; // 40%

/** Minimum plan duration in weeks */
const MIN_PLAN_WEEKS = 4;

// ============================================================
// FITNESS LEVEL FROM CTL
// ============================================================

/**
 * Derive fitness level from CTL if available, otherwise use provided level.
 */
function effectiveFitnessLevel(fitnessLevel: FitnessLevel, ctl?: number): FitnessLevel {
  if (ctl === undefined) return fitnessLevel;
  if (ctl >= CTL_THRESHOLDS.advanced) return 'advanced';
  if (ctl >= CTL_THRESHOLDS.intermediate) return 'intermediate';
  return 'beginner';
}

// ============================================================
// WEEK CLASSIFICATION
// ============================================================

interface WeekInfo {
  weekNumber: number;
  phase: TrainingPhase;
  isProtected: boolean;
  isRecoveryAfterBuild: boolean;
  removalPriority: number; // Lower = remove first
}

/**
 * Classify each week in the plan for removal eligibility.
 */
function classifyWeeks(template: TrainingPlanTemplate): WeekInfo[] {
  const weeks: WeekInfo[] = [];

  for (const phase of template.phases) {
    for (let i = 0; i < phase.weeks.length; i++) {
      const weekNum = phase.weeks[i];
      const isProtected = PROTECTED_PHASES.has(phase.phase);

      // Detect recovery weeks that follow build phases
      let isRecoveryAfterBuild = false;
      if (phase.phase === 'recovery') {
        // Check if the previous phase was 'build'
        const phaseIndex = template.phases.indexOf(phase);
        if (phaseIndex > 0) {
          const prevPhase = template.phases[phaseIndex - 1];
          if (prevPhase.phase === 'build') {
            isRecoveryAfterBuild = true;
          }
        }
      }

      // Calculate removal priority (lower = more removable)
      let priority: number;
      if (isProtected) {
        priority = 100; // Never remove
      } else if (isRecoveryAfterBuild) {
        priority = 90; // Strongly protect recovery after build
      } else if (phase.phase === 'recovery') {
        // Mid-plan recovery weeks (not after build) can sometimes be cut
        priority = 40;
      } else if (phase.phase === 'base') {
        // Base phase weeks are most removable, earlier weeks more so
        priority = 10 + i; // First base week = 10, second = 11, etc.
      } else if (phase.phase === 'build') {
        // Build phase weeks: remove later ones first (keep early build)
        priority = 50 + (phase.weeks.length - 1 - i);
      } else {
        priority = 60; // Other phases
      }

      weeks.push({
        weekNumber: weekNum,
        phase: phase.phase,
        isProtected,
        isRecoveryAfterBuild,
        removalPriority: priority,
      });
    }
  }

  return weeks;
}

// ============================================================
// COMPRESSION LOGIC
// ============================================================

/**
 * Determine which weeks to remove based on fitness level and target duration.
 */
function selectWeeksToRemove(
  weekInfos: WeekInfo[],
  weeksToRemove: number,
  fitnessLevel: FitnessLevel,
): number[] {
  // Sort by removal priority (lowest = remove first)
  const removable = weekInfos
    .filter(w => !w.isProtected && !w.isRecoveryAfterBuild)
    .sort((a, b) => a.removalPriority - b.removalPriority);

  // Count base phase weeks available for removal
  const baseWeeks = removable.filter(w => w.phase === 'base');
  const maxBaseRemoval = Math.floor(baseWeeks.length * BASE_CUT_LIMITS[fitnessLevel]);

  const removed: number[] = [];
  let baseCut = 0;

  for (const week of removable) {
    if (removed.length >= weeksToRemove) break;

    if (week.phase === 'base') {
      if (baseCut < maxBaseRemoval) {
        removed.push(week.weekNumber);
        baseCut++;
      }
    } else if (week.phase === 'recovery' && !week.isRecoveryAfterBuild) {
      removed.push(week.weekNumber);
    } else if (week.phase === 'build') {
      // Only cut build weeks if we've exhausted base weeks
      removed.push(week.weekNumber);
    }
  }

  return removed;
}

/**
 * Rebuild template phases after removing weeks.
 */
function rebuildPhases(
  template: TrainingPlanTemplate,
  removedWeeks: Set<number>,
): TrainingPlanTemplate['phases'] {
  const newPhases: TrainingPlanTemplate['phases'] = [];
  let newWeekNum = 1;

  for (const phase of template.phases) {
    const remainingWeeks: number[] = [];
    for (const weekNum of phase.weeks) {
      if (!removedWeeks.has(weekNum)) {
        remainingWeeks.push(newWeekNum);
        newWeekNum++;
      }
    }
    if (remainingWeeks.length > 0) {
      newPhases.push({
        ...phase,
        weeks: remainingWeeks,
      });
    }
  }

  return newPhases;
}

/**
 * Rebuild weekTemplates after removing weeks, renumbering sequentially.
 */
function rebuildWeekTemplates(
  template: TrainingPlanTemplate,
  removedWeeks: Set<number>,
): TrainingPlanTemplate['weekTemplates'] {
  const newTemplates: TrainingPlanTemplate['weekTemplates'] = {};
  let newWeekNum = 1;

  for (let week = 1; week <= template.duration; week++) {
    if (!removedWeeks.has(week) && template.weekTemplates[week]) {
      newTemplates[newWeekNum] = template.weekTemplates[week];
      newWeekNum++;
    }
  }

  return newTemplates;
}

// ============================================================
// MAIN COMPRESSION FUNCTION
// ============================================================

/**
 * Compress a training plan template to fit within a target date.
 *
 * @param template - The full training plan template
 * @param options - Compression options (target date, start date, fitness level)
 * @returns Compressed plan result with the modified template and metadata
 *
 * @example
 * ```ts
 * const result = compressPlan(tenWeek10kPlan, {
 *   targetDate: new Date('2026-05-24'),
 *   startDate: new Date('2026-03-29'),
 *   fitnessLevel: 'intermediate',
 *   ctl: 45,
 * });
 * // result.compressedDuration = 8
 * // result.removedWeeks = [1, 2] (first two base weeks)
 * ```
 */
export function compressPlan(
  template: TrainingPlanTemplate,
  options: CompressionOptions,
): CompressedPlanResult {
  const { targetDate, startDate, fitnessLevel, ctl } = options;

  // Calculate available weeks
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const availableWeeks = Math.floor(
    (targetDate.getTime() - startDate.getTime()) / msPerWeek
  );

  // No compression needed
  if (availableWeeks >= template.duration) {
    return {
      template,
      originalDuration: template.duration,
      compressedDuration: template.duration,
      removedWeeks: [],
      warnings: [],
      wasCompressed: false,
    };
  }

  const weeksToRemove = template.duration - availableWeeks;
  const warnings: string[] = [];

  // Check minimum plan duration
  if (availableWeeks < MIN_PLAN_WEEKS) {
    warnings.push(
      `Only ${availableWeeks} weeks available — minimum recommended is ${MIN_PLAN_WEEKS} weeks. Consider a shorter plan template instead.`
    );
    return {
      template,
      originalDuration: template.duration,
      compressedDuration: template.duration,
      removedWeeks: [],
      warnings,
      wasCompressed: false,
    };
  }

  // Check compression ratio
  const compressionRatio = weeksToRemove / template.duration;
  if (compressionRatio > MAX_COMPRESSION_RATIO) {
    warnings.push(
      `Removing ${weeksToRemove} of ${template.duration} weeks (${Math.round(compressionRatio * 100)}%) exceeds recommended maximum of ${Math.round(MAX_COMPRESSION_RATIO * 100)}%. Consider selecting a shorter plan template.`
    );
  }

  // Determine effective fitness level
  const effectiveLevel = effectiveFitnessLevel(fitnessLevel, ctl);

  // Classify weeks and select which to remove
  const weekInfos = classifyWeeks(template);
  const removedWeekNumbers = selectWeeksToRemove(weekInfos, weeksToRemove, effectiveLevel);

  // Check if we could remove enough weeks
  if (removedWeekNumbers.length < weeksToRemove) {
    const deficit = weeksToRemove - removedWeekNumbers.length;
    warnings.push(
      `Could only safely remove ${removedWeekNumbers.length} of ${weeksToRemove} needed weeks. Plan will be ${template.duration - removedWeekNumbers.length} weeks (${deficit} week(s) longer than target).`
    );
  }

  const removedSet = new Set(removedWeekNumbers);

  // Rebuild the template
  const newPhases = rebuildPhases(template, removedSet);
  const newWeekTemplates = rebuildWeekTemplates(template, removedSet);
  const newDuration = template.duration - removedWeekNumbers.length;

  // Add fitness-based context to warnings
  if (effectiveLevel !== fitnessLevel && ctl !== undefined) {
    warnings.push(
      `Fitness level adjusted from "${fitnessLevel}" to "${effectiveLevel}" based on your CTL of ${ctl}.`
    );
  }

  // Describe what was removed
  const removedPhaseBreakdown = summarizeRemovedWeeks(weekInfos, removedWeekNumbers);
  if (removedPhaseBreakdown) {
    warnings.push(removedPhaseBreakdown);
  }

  const compressedTemplate: TrainingPlanTemplate = {
    ...template,
    duration: newDuration,
    phases: newPhases,
    weekTemplates: newWeekTemplates,
  };

  return {
    template: compressedTemplate,
    originalDuration: template.duration,
    compressedDuration: newDuration,
    removedWeeks: removedWeekNumbers,
    warnings,
    wasCompressed: removedWeekNumbers.length > 0,
  };
}

/**
 * Generate a human-readable summary of which weeks/phases were removed.
 */
function summarizeRemovedWeeks(weekInfos: WeekInfo[], removed: number[]): string | null {
  if (removed.length === 0) return null;

  const phaseCounts: Record<string, number> = {};
  for (const weekNum of removed) {
    const info = weekInfos.find(w => w.weekNumber === weekNum);
    if (info) {
      phaseCounts[info.phase] = (phaseCounts[info.phase] || 0) + 1;
    }
  }

  const parts = Object.entries(phaseCounts)
    .map(([phase, count]) => `${count} ${phase} week${count > 1 ? 's' : ''}`)
    .join(', ');

  return `Removed: ${parts}.`;
}

/**
 * Calculate a compression preview without modifying the template.
 * Useful for showing the user what would happen before they commit.
 */
export function previewCompression(
  template: TrainingPlanTemplate,
  options: CompressionOptions,
): {
  availableWeeks: number;
  weeksToRemove: number;
  canCompress: boolean;
  removableWeeks: number;
  removedPhases: Record<string, number>;
  warnings: string[];
} {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const availableWeeks = Math.floor(
    (options.targetDate.getTime() - options.startDate.getTime()) / msPerWeek
  );

  if (availableWeeks >= template.duration) {
    return {
      availableWeeks,
      weeksToRemove: 0,
      canCompress: true,
      removableWeeks: 0,
      removedPhases: {},
      warnings: [],
    };
  }

  const weeksToRemove = template.duration - availableWeeks;
  const effectiveLevel = effectiveFitnessLevel(options.fitnessLevel, options.ctl);
  const weekInfos = classifyWeeks(template);
  const removedWeekNumbers = selectWeeksToRemove(weekInfos, weeksToRemove, effectiveLevel);

  const removedPhases: Record<string, number> = {};
  for (const weekNum of removedWeekNumbers) {
    const info = weekInfos.find(w => w.weekNumber === weekNum);
    if (info) {
      removedPhases[info.phase] = (removedPhases[info.phase] || 0) + 1;
    }
  }

  const warnings: string[] = [];
  if (removedWeekNumbers.length < weeksToRemove) {
    warnings.push(`Can only safely remove ${removedWeekNumbers.length} of ${weeksToRemove} weeks needed.`);
  }
  if (weeksToRemove / template.duration > MAX_COMPRESSION_RATIO) {
    warnings.push(`Compression exceeds recommended ${Math.round(MAX_COMPRESSION_RATIO * 100)}% limit.`);
  }
  if (availableWeeks < MIN_PLAN_WEEKS) {
    warnings.push(`${availableWeeks} weeks is below the minimum ${MIN_PLAN_WEEKS}-week recommendation.`);
  }

  return {
    availableWeeks,
    weeksToRemove,
    canCompress: removedWeekNumbers.length >= weeksToRemove && availableWeeks >= MIN_PLAN_WEEKS,
    removableWeeks: removedWeekNumbers.length,
    removedPhases,
    warnings,
  };
}
