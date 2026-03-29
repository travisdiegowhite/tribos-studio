/**
 * Plan Conflict Resolver
 * Detects and resolves scheduling conflicts between multiple active training plans.
 * Primary plan key workouts take precedence over secondary plan workouts.
 */

import type { PlannedWorkoutDB, SportType, PlanPriority } from '../types/training';

// ============================================================
// TYPES
// ============================================================

export interface FitnessSnapshot {
  ctl: number;
  atl: number;
  tsb: number;
}

export interface ConflictUserPreferences {
  maxWorkoutsPerDay: number;
  maxWeeklyTSS: number;
  blockedDays: number[]; // 0-6 (Sunday = 0)
}

export type ConflictAction =
  | 'keep_both'
  | 'move_secondary'
  | 'downgrade_secondary'
  | 'skip_secondary';

export interface ConflictResolution {
  date: string;
  primaryWorkout: PlannedWorkoutDB;
  secondaryWorkout: PlannedWorkoutDB;
  action: ConflictAction;
  movedToDate?: string;
  replacementWorkoutId?: string;
  reason: string;
}

export interface WeeklyLoadAnalysis {
  weekStart: string;
  combinedTSS: number;
  capacityTSS: number;
  isOverloaded: boolean;
  overloadPercentage: number;
  recommendation: string;
}

export interface PlanConflictReport {
  conflicts: ConflictResolution[];
  weeklyLoadAnalysis: WeeklyLoadAnalysis[];
  totalConflicts: number;
  autoResolvable: number;
  needsUserInput: number;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Intensity rank by workout category — higher = more intense */
const CATEGORY_INTENSITY_RANK: Record<string, number> = {
  rest: 0,
  recovery: 1,
  flexibility: 1,
  core: 2,
  strength: 2,
  endurance: 3,
  tempo: 4,
  sweet_spot: 5,
  threshold: 6,
  climbing: 6,
  vo2max: 7,
  anaerobic: 8,
  racing: 9,
};

/** TSS threshold for considering a workout "key" */
const KEY_WORKOUT_TSS_THRESHOLD = 80;

/** Intensity factor threshold for "key" workout */
const KEY_WORKOUT_IF_THRESHOLD = 0.85;

/** Categories always considered "key" workouts */
const KEY_WORKOUT_CATEGORIES = new Set([
  'threshold', 'vo2max', 'anaerobic', 'racing', 'climbing',
]);

/** Max combined daily TSS before recommending removal */
const MAX_DAILY_TSS = 150;

/** TSB thresholds for fatigue-aware adjustments */
const TSB_DEEP_FATIGUE = -30;
const TSB_MODERATE_FATIGUE = -15;
const TSB_FRESH = 0;

// Recovery workout IDs to use as downgrade replacements
const CYCLING_RECOVERY_WORKOUT = 'recovery_spin';
const RUNNING_RECOVERY_WORKOUT = 'run_easy_recovery';

// ============================================================
// KEY WORKOUT DETECTION
// ============================================================

/**
 * Determine if a planned workout is a "key" workout that should be protected.
 * Key workouts are high-intensity, high-TSS, or sport-specific important sessions.
 */
export function isKeyWorkout(workout: PlannedWorkoutDB): boolean {
  // Check category
  if (workout.workout_type && KEY_WORKOUT_CATEGORIES.has(workout.workout_type)) {
    return true;
  }

  // Check TSS
  if (workout.target_tss && workout.target_tss >= KEY_WORKOUT_TSS_THRESHOLD) {
    return true;
  }

  // Check intensity rank
  const rank = CATEGORY_INTENSITY_RANK[workout.workout_type || ''] ?? 0;
  if (rank >= 5) { // sweet_spot and above
    return true;
  }

  return false;
}

/**
 * Get the intensity rank of a workout (higher = more intense)
 */
export function getWorkoutIntensityRank(workout: PlannedWorkoutDB): number {
  return CATEGORY_INTENSITY_RANK[workout.workout_type || ''] ?? 0;
}

/**
 * Get the appropriate recovery workout ID for a given sport type
 */
function getRecoveryWorkoutForSport(sportType: SportType | null): string {
  if (sportType === 'running') return RUNNING_RECOVERY_WORKOUT;
  return CYCLING_RECOVERY_WORKOUT;
}

// ============================================================
// CONFLICT DETECTION
// ============================================================

interface WorkoutWithPlanInfo extends PlannedWorkoutDB {
  plan_priority: PlanPriority;
  plan_sport_type: SportType | null;
}

/**
 * Detect conflicts between workouts from multiple plans on the same dates.
 */
export function detectConflicts(
  primaryWorkouts: PlannedWorkoutDB[],
  secondaryWorkouts: PlannedWorkoutDB[],
  primarySportType: SportType | null,
  secondarySportType: SportType | null,
): Map<string, { primary: WorkoutWithPlanInfo; secondary: WorkoutWithPlanInfo }> {
  const conflicts = new Map<string, { primary: WorkoutWithPlanInfo; secondary: WorkoutWithPlanInfo }>();

  // Index primary workouts by date
  const primaryByDate = new Map<string, PlannedWorkoutDB>();
  for (const w of primaryWorkouts) {
    if (!w.completed) {
      primaryByDate.set(w.scheduled_date, w);
    }
  }

  // Find overlapping dates
  for (const sw of secondaryWorkouts) {
    if (sw.completed) continue;
    const pw = primaryByDate.get(sw.scheduled_date);
    if (pw) {
      conflicts.set(sw.scheduled_date, {
        primary: { ...pw, plan_priority: 'primary', plan_sport_type: primarySportType },
        secondary: { ...sw, plan_priority: 'secondary', plan_sport_type: secondarySportType },
      });
    }
  }

  return conflicts;
}

// ============================================================
// CONFLICT RESOLUTION
// ============================================================

/**
 * Resolve a single day's conflict between primary and secondary workouts.
 */
function resolveDayConflict(
  date: string,
  primary: WorkoutWithPlanInfo,
  secondary: WorkoutWithPlanInfo,
  fitness: FitnessSnapshot | null,
  availableDates: Set<string>,
): ConflictResolution {
  const primaryIsKey = isKeyWorkout(primary);
  const secondaryIsKey = isKeyWorkout(secondary);
  const primaryRank = getWorkoutIntensityRank(primary);
  const secondaryRank = getWorkoutIntensityRank(secondary);

  const combinedTSS = (primary.target_tss || 0) + (secondary.target_tss || 0);

  // Both are easy/recovery — safe to double up
  if (!primaryIsKey && !secondaryIsKey && combinedTSS < MAX_DAILY_TSS) {
    return {
      date,
      primaryWorkout: primary,
      secondaryWorkout: secondary,
      action: 'keep_both',
      reason: `Both workouts are low intensity (${primary.workout_type || 'easy'} + ${secondary.workout_type || 'easy'}). Safe to do both.`,
    };
  }

  // Primary is key, secondary is easy — keep both if TSS is manageable
  if (primaryIsKey && !secondaryIsKey && combinedTSS < MAX_DAILY_TSS) {
    return {
      date,
      primaryWorkout: primary,
      secondaryWorkout: secondary,
      action: 'keep_both',
      reason: `Primary key workout (${primary.workout_type}) with easy secondary (${secondary.workout_type}). Combined load is manageable.`,
    };
  }

  // Check fatigue level for more aggressive decisions
  if (fitness && fitness.tsb < TSB_DEEP_FATIGUE) {
    return {
      date,
      primaryWorkout: primary,
      secondaryWorkout: secondary,
      action: 'skip_secondary',
      reason: `Deep fatigue detected (TSB: ${fitness.tsb}). Skipping secondary ${secondary.workout_type} to protect recovery.`,
    };
  }

  // Primary is key, secondary is also key — move or downgrade secondary
  if (primaryIsKey && secondaryIsKey) {
    // Try to move secondary to an adjacent available date
    const movedDate = findNearestAvailableDate(date, availableDates);
    if (movedDate) {
      return {
        date,
        primaryWorkout: primary,
        secondaryWorkout: secondary,
        action: 'move_secondary',
        movedToDate: movedDate,
        reason: `Two key workouts on same day. Moving ${secondary.workout_type} to ${movedDate} to preserve both quality sessions.`,
      };
    }

    // No available day — downgrade secondary
    if (fitness && fitness.tsb < TSB_MODERATE_FATIGUE) {
      return {
        date,
        primaryWorkout: primary,
        secondaryWorkout: secondary,
        action: 'skip_secondary',
        reason: `Two key workouts conflict and no adjacent day available. Moderate fatigue (TSB: ${fitness.tsb}) — skipping secondary.`,
      };
    }

    return {
      date,
      primaryWorkout: primary,
      secondaryWorkout: secondary,
      action: 'downgrade_secondary',
      replacementWorkoutId: getRecoveryWorkoutForSport(secondary.plan_sport_type),
      reason: `Two key workouts conflict and no adjacent day available. Downgrading ${secondary.workout_type} to recovery.`,
    };
  }

  // Combined TSS too high
  if (combinedTSS >= MAX_DAILY_TSS) {
    const movedDate = findNearestAvailableDate(date, availableDates);
    if (movedDate) {
      return {
        date,
        primaryWorkout: primary,
        secondaryWorkout: secondary,
        action: 'move_secondary',
        movedToDate: movedDate,
        reason: `Combined TSS (${combinedTSS}) exceeds daily limit. Moving secondary to ${movedDate}.`,
      };
    }

    return {
      date,
      primaryWorkout: primary,
      secondaryWorkout: secondary,
      action: 'downgrade_secondary',
      replacementWorkoutId: getRecoveryWorkoutForSport(secondary.plan_sport_type),
      reason: `Combined TSS (${combinedTSS}) exceeds daily limit. Downgrading secondary to recovery.`,
    };
  }

  // Default: keep both
  return {
    date,
    primaryWorkout: primary,
    secondaryWorkout: secondary,
    action: 'keep_both',
    reason: 'No significant conflict detected. Both workouts can be performed.',
  };
}

/**
 * Find the nearest available date (within ±2 days) that doesn't have a workout conflict.
 */
function findNearestAvailableDate(
  dateStr: string,
  availableDates: Set<string>,
): string | null {
  const date = new Date(dateStr + 'T00:00:00');

  // Check ±1 day, then ±2 days
  for (const offset of [1, -1, 2, -2]) {
    const candidate = new Date(date);
    candidate.setDate(candidate.getDate() + offset);
    const candidateStr = formatDate(candidate);
    if (availableDates.has(candidateStr)) {
      return candidateStr;
    }
  }

  return null;
}

/**
 * Format a Date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// WEEKLY LOAD ANALYSIS
// ============================================================

/**
 * Analyze combined weekly training load across all plans.
 */
export function analyzeWeeklyLoad(
  allWorkouts: PlannedWorkoutDB[],
  fitness: FitnessSnapshot | null,
): WeeklyLoadAnalysis[] {
  // Group workouts by ISO week
  const weekMap = new Map<string, PlannedWorkoutDB[]>();

  for (const w of allWorkouts) {
    if (w.completed) continue;
    const weekStart = getWeekStart(w.scheduled_date);
    const existing = weekMap.get(weekStart) || [];
    existing.push(w);
    weekMap.set(weekStart, existing);
  }

  // Estimated weekly capacity from CTL (or default)
  const capacityTSS = fitness ? Math.round(fitness.ctl * 1.1) : 400;

  const analyses: WeeklyLoadAnalysis[] = [];

  for (const [weekStart, workouts] of weekMap) {
    const combinedTSS = workouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
    const isOverloaded = combinedTSS > capacityTSS;
    const overloadPercentage = capacityTSS > 0
      ? Math.round(((combinedTSS - capacityTSS) / capacityTSS) * 100)
      : 0;

    let recommendation = '';
    if (isOverloaded) {
      if (overloadPercentage > 30) {
        recommendation = `Combined load is ${overloadPercentage}% over capacity. Consider skipping secondary plan workouts this week.`;
      } else if (overloadPercentage > 15) {
        recommendation = `Combined load is ${overloadPercentage}% over capacity. Consider downgrading one secondary key workout to recovery.`;
      } else {
        recommendation = `Combined load is slightly over capacity. Monitor fatigue closely.`;
      }
    } else {
      recommendation = 'Combined load is within capacity. Both plans can proceed as planned.';
    }

    analyses.push({
      weekStart,
      combinedTSS,
      capacityTSS,
      isOverloaded,
      overloadPercentage: Math.max(0, overloadPercentage),
      recommendation,
    });
  }

  return analyses.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Get the Monday of the week for a given date string.
 */
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return formatDate(date);
}

// ============================================================
// MAIN RESOLVER
// ============================================================

/**
 * Resolve all conflicts between primary and secondary plan workouts.
 *
 * @param primaryWorkouts - Workouts from the primary plan
 * @param secondaryWorkouts - Workouts from the secondary plan
 * @param primarySportType - Sport type of the primary plan
 * @param secondarySportType - Sport type of the secondary plan
 * @param fitness - Latest fitness snapshot (CTL/ATL/TSB)
 * @param preferences - User scheduling preferences
 * @returns Full conflict report with resolutions and weekly load analysis
 */
export function resolveConflicts(
  primaryWorkouts: PlannedWorkoutDB[],
  secondaryWorkouts: PlannedWorkoutDB[],
  primarySportType: SportType | null,
  secondarySportType: SportType | null,
  fitness: FitnessSnapshot | null,
  preferences?: Partial<ConflictUserPreferences>,
): PlanConflictReport {
  const conflicts = detectConflicts(
    primaryWorkouts,
    secondaryWorkouts,
    primarySportType,
    secondarySportType,
  );

  // Build set of dates that DON'T have any workout (available for moving)
  const allDates = new Set<string>();
  const occupiedDates = new Set<string>();

  for (const w of [...primaryWorkouts, ...secondaryWorkouts]) {
    occupiedDates.add(w.scheduled_date);
    // Add surrounding dates as candidates
    const d = new Date(w.scheduled_date + 'T00:00:00');
    for (let offset = -3; offset <= 3; offset++) {
      const candidate = new Date(d);
      candidate.setDate(candidate.getDate() + offset);
      allDates.add(formatDate(candidate));
    }
  }

  // Available dates = all candidate dates minus occupied dates minus blocked days
  const blockedDays = new Set(preferences?.blockedDays || []);
  const availableDates = new Set<string>();
  for (const dateStr of allDates) {
    if (!occupiedDates.has(dateStr)) {
      const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
      if (!blockedDays.has(dayOfWeek)) {
        availableDates.add(dateStr);
      }
    }
  }

  // Resolve each conflict
  const resolutions: ConflictResolution[] = [];
  for (const [date, { primary, secondary }] of conflicts) {
    const resolution = resolveDayConflict(date, primary, secondary, fitness, availableDates);
    resolutions.push(resolution);

    // If we moved a workout, mark the new date as occupied
    if (resolution.movedToDate) {
      availableDates.delete(resolution.movedToDate);
      occupiedDates.add(resolution.movedToDate);
    }
  }

  // Analyze weekly load across all plans
  const weeklyLoadAnalysis = analyzeWeeklyLoad(
    [...primaryWorkouts, ...secondaryWorkouts],
    fitness,
  );

  // Categorize resolutions
  const autoResolvable = resolutions.filter(
    r => r.action === 'keep_both' || r.action === 'move_secondary'
  ).length;
  const needsUserInput = resolutions.filter(
    r => r.action === 'downgrade_secondary' || r.action === 'skip_secondary'
  ).length;

  return {
    conflicts: resolutions.sort((a, b) => a.date.localeCompare(b.date)),
    weeklyLoadAnalysis,
    totalConflicts: resolutions.length,
    autoResolvable,
    needsUserInput,
  };
}

/**
 * Get TSB-based recommendation for the current training week.
 */
export function getTSBRecommendation(tsb: number): {
  level: 'deep_fatigue' | 'moderate_fatigue' | 'neutral' | 'fresh' | 'very_fresh';
  secondaryPlanGuidance: string;
} {
  if (tsb < TSB_DEEP_FATIGUE) {
    return {
      level: 'deep_fatigue',
      secondaryPlanGuidance: 'Skip ALL secondary plan key workouts this week. Keep only easy/recovery sessions.',
    };
  }
  if (tsb < TSB_MODERATE_FATIGUE) {
    return {
      level: 'moderate_fatigue',
      secondaryPlanGuidance: 'Downgrade secondary plan key workouts to easier alternatives. Prioritize primary plan recovery.',
    };
  }
  if (tsb < TSB_FRESH) {
    return {
      level: 'neutral',
      secondaryPlanGuidance: 'Proceed with both plans as scheduled. Monitor how you feel during key sessions.',
    };
  }
  if (tsb <= 20) {
    return {
      level: 'fresh',
      secondaryPlanGuidance: 'Good form. Both plans can proceed at full intensity.',
    };
  }
  return {
    level: 'very_fresh',
    secondaryPlanGuidance: 'Very fresh — consider adding intensity to secondary plan workouts if feeling strong.',
  };
}
