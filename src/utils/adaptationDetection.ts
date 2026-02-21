/**
 * Adaptation Detection Service
 *
 * Analyzes completed activities against planned workouts to detect and classify
 * training adaptations. This is the core intelligence for understanding how
 * athletes deviate from their training plans.
 */

import {
  isRunningActivity,
} from '../types/training';
import type {
  PlannedWorkoutDB,
  ActivitySummary,
  AdaptationType,
  AdaptationAssessment,
  StimulusAnalysis,
  StimulusBreakdown,
  WorkoutCategory,
  DetectAdaptationInput,
  WorkoutAdaptationDB,
  TrainingPhase,
} from '../types/training';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/**
 * Thresholds for classifying adaptations
 */
const ADAPTATION_THRESHOLDS = {
  // Duration thresholds (percentage of planned)
  DURATION_EXACT_MATCH: 0.1, // Within 10% = completed as planned
  DURATION_TRUNCATED: -0.15, // More than 15% shorter
  DURATION_EXTENDED: 0.15, // More than 15% longer

  // TSS thresholds (percentage of planned)
  TSS_EXACT_MATCH: 0.15, // Within 15% = completed as planned
  TSS_SIGNIFICANT_UNDER: -0.25, // More than 25% under
  TSS_SIGNIFICANT_OVER: 0.25, // More than 25% over

  // Intensity Factor thresholds
  IF_UPGRADE_THRESHOLD: 0.05, // IF more than 0.05 higher = upgraded
  IF_DOWNGRADE_THRESHOLD: -0.05, // IF more than 0.05 lower = downgraded
};

/**
 * Workout category intensity rankings (higher = more intense)
 * Used to determine if an adaptation was an upgrade or downgrade
 */
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

/**
 * Categories that are considered "similar" for substitution purposes
 */
const SIMILAR_CATEGORIES: Record<string, string[]> = {
  recovery: ['endurance', 'flexibility'],
  endurance: ['recovery', 'tempo'],
  tempo: ['endurance', 'sweet_spot'],
  sweet_spot: ['tempo', 'threshold'],
  threshold: ['sweet_spot', 'vo2max'],
  vo2max: ['threshold', 'anaerobic'],
  anaerobic: ['vo2max', 'racing'],
  climbing: ['threshold', 'sweet_spot'],
};

// ============================================================================
// CORE DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect the type of adaptation that occurred when comparing planned vs actual workout
 */
export function detectAdaptationType(input: DetectAdaptationInput): AdaptationType {
  const { plannedWorkout, activity } = input;

  // Handle skipped workouts (no activity provided)
  if (!activity) {
    return 'skipped';
  }

  // Get planned and actual metrics
  const plannedDuration = plannedWorkout.target_duration || 0;
  const actualDuration = activity.duration || 0;
  const plannedTss = plannedWorkout.target_tss || 0;
  const actualTss = activity.tss || 0;
  const plannedType = plannedWorkout.workout_type || 'endurance';
  const actualType = inferWorkoutCategory(activity, input.userFtp);

  // Calculate deltas
  const durationDelta = plannedDuration > 0 ? (actualDuration - plannedDuration) / plannedDuration : 0;
  const tssDelta = plannedTss > 0 ? (actualTss - plannedTss) / plannedTss : 0;

  // Check if workout type changed significantly
  const typeChanged = plannedType !== actualType && !isSimilarCategory(plannedType, actualType);
  const intensityRankDelta = getIntensityRankDelta(plannedType, actualType);

  // Decision tree for adaptation classification
  // 1. Check for exact match first
  if (
    Math.abs(durationDelta) <= ADAPTATION_THRESHOLDS.DURATION_EXACT_MATCH &&
    Math.abs(tssDelta) <= ADAPTATION_THRESHOLDS.TSS_EXACT_MATCH &&
    !typeChanged
  ) {
    return 'completed_as_planned';
  }

  // 2. Check for time truncation (same type, shorter)
  if (
    durationDelta < ADAPTATION_THRESHOLDS.DURATION_TRUNCATED &&
    !typeChanged &&
    Math.abs(intensityRankDelta) <= 1
  ) {
    return 'time_truncated';
  }

  // 3. Check for time extension (same type, longer)
  if (
    durationDelta > ADAPTATION_THRESHOLDS.DURATION_EXTENDED &&
    !typeChanged &&
    Math.abs(intensityRankDelta) <= 1
  ) {
    return 'time_extended';
  }

  // 4. Check for intensity swap (different type but similar total stress)
  if (typeChanged && Math.abs(tssDelta) <= ADAPTATION_THRESHOLDS.TSS_EXACT_MATCH) {
    return 'intensity_swap';
  }

  // 5. Check for upgrade (higher intensity than planned)
  if (intensityRankDelta > 0 || tssDelta > ADAPTATION_THRESHOLDS.TSS_SIGNIFICANT_OVER) {
    return 'upgraded';
  }

  // 6. Check for downgrade (lower intensity than planned)
  if (intensityRankDelta < 0 || tssDelta < ADAPTATION_THRESHOLDS.TSS_SIGNIFICANT_UNDER) {
    return 'downgraded';
  }

  // Default: treat significant deviations as intensity swaps
  return 'intensity_swap';
}

/**
 * Infer the workout category from a running activity using pace
 * Uses average pace relative to threshold pace to classify
 */
function inferRunningWorkoutCategory(
  activity: ActivitySummary & { averagePace?: number | null },
  thresholdPaceSec?: number
): WorkoutCategory {
  // If we have pace and threshold pace, calculate intensity
  if (activity.averagePace && thresholdPaceSec && thresholdPaceSec > 0) {
    // For running, slower = easier. Ratio > 1 means easier than threshold
    const paceRatio = activity.averagePace / thresholdPaceSec;

    if (paceRatio > 1.40) return 'recovery';
    if (paceRatio > 1.20) return 'endurance';
    if (paceRatio > 1.08) return 'tempo';
    if (paceRatio > 0.98) return 'threshold';
    if (paceRatio > 0.90) return 'vo2max';
    return 'anaerobic';
  }

  // Fall back to pace estimation from distance and duration
  if (activity.distance > 0 && activity.duration > 0) {
    const paceMinPerKm = activity.duration / activity.distance;

    // Very rough classification without knowing the runner's fitness
    // These thresholds represent a broad intermediate runner
    if (paceMinPerKm > 7.0) return 'recovery';
    if (paceMinPerKm > 5.5) return 'endurance';
    if (paceMinPerKm > 4.8) return 'tempo';
    if (paceMinPerKm > 4.3) return 'threshold';
    if (paceMinPerKm > 3.8) return 'vo2max';
    return 'anaerobic';
  }

  // Fall back to TSS-based estimation
  if (activity.tss && activity.duration) {
    const tssPerHour = activity.tss / (activity.duration / 60);
    if (tssPerHour < 35) return 'recovery';
    if (tssPerHour < 55) return 'endurance';
    if (tssPerHour < 75) return 'tempo';
    if (tssPerHour < 95) return 'threshold';
    return 'vo2max';
  }

  return 'endurance';
}

/**
 * Infer the workout category from activity metrics
 * Uses Intensity Factor (IF) and power data for cycling,
 * or pace data for running activities
 */
export function inferWorkoutCategory(
  activity: ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null; averagePace?: number | null },
  userFtp?: number,
  thresholdPaceSec?: number
): WorkoutCategory {
  // Route to running-specific classification for running activities
  if (activity.type && isRunningActivity(activity.type)) {
    return inferRunningWorkoutCategory(activity, thresholdPaceSec);
  }

  // Cycling classification below — uses power-based IF

  // If we have IF directly, use it
  let intensityFactor = activity.intensityFactor;

  // Calculate IF from normalized power and FTP if not provided
  if (!intensityFactor && activity.normalizedPower && userFtp && userFtp > 0) {
    intensityFactor = activity.normalizedPower / userFtp;
  }

  // If we still don't have IF, try to estimate from average power
  if (!intensityFactor && activity.averagePower && userFtp && userFtp > 0) {
    // Average power is typically ~5% lower than normalized power for steady rides
    // and can be significantly lower for variable rides
    intensityFactor = activity.averagePower / userFtp;
  }

  // If we have no power data, estimate based on TSS and duration
  if (!intensityFactor && activity.tss && activity.duration) {
    // TSS = (duration_hours * IF^2 * 100)
    // IF = sqrt(TSS / (duration_hours * 100))
    const durationHours = activity.duration / 60;
    if (durationHours > 0) {
      intensityFactor = Math.sqrt(activity.tss / (durationHours * 100));
    }
  }

  // Classify based on IF using standard power zones
  if (!intensityFactor) {
    // Default to endurance if we can't determine
    return 'endurance';
  }

  if (intensityFactor < 0.55) {
    return 'recovery';
  } else if (intensityFactor < 0.75) {
    return 'endurance';
  } else if (intensityFactor < 0.87) {
    return 'tempo';
  } else if (intensityFactor < 0.94) {
    return 'sweet_spot';
  } else if (intensityFactor < 1.05) {
    return 'threshold';
  } else if (intensityFactor < 1.2) {
    return 'vo2max';
  } else {
    return 'anaerobic';
  }
}

/**
 * Check if two workout categories are considered similar
 */
export function isSimilarCategory(category1: string, category2: string): boolean {
  if (category1 === category2) return true;

  const similar1 = SIMILAR_CATEGORIES[category1] || [];
  const similar2 = SIMILAR_CATEGORIES[category2] || [];

  return similar1.includes(category2) || similar2.includes(category1);
}

/**
 * Get the intensity rank difference between two categories
 * Positive = actual is more intense, Negative = actual is less intense
 */
export function getIntensityRankDelta(plannedType: string, actualType: string): number {
  const plannedRank = CATEGORY_INTENSITY_RANK[plannedType] ?? 3;
  const actualRank = CATEGORY_INTENSITY_RANK[actualType] ?? 3;
  return actualRank - plannedRank;
}

// ============================================================================
// STIMULUS ANALYSIS
// ============================================================================

/**
 * Calculate stimulus achieved percentage
 * This represents what % of the planned training stimulus was actually achieved
 */
export function calculateStimulusAchieved(
  planned: { tss: number | null; duration: number | null },
  actual: { tss: number | null; duration: number | null }
): number {
  // Primary metric is TSS if available
  if (planned.tss && planned.tss > 0 && actual.tss) {
    return Math.round((actual.tss / planned.tss) * 100);
  }

  // Fall back to duration
  if (planned.duration && planned.duration > 0 && actual.duration) {
    return Math.round((actual.duration / planned.duration) * 100);
  }

  // Can't calculate
  return 0;
}

/**
 * Analyze the stimulus change in detail
 * Identifies what training stimulus was lost and what was gained
 */
export function analyzeStimulusDelta(input: {
  plannedType: string;
  plannedDuration: number;
  plannedTss: number;
  actualType: string;
  actualDuration: number;
  actualTss: number;
}): StimulusAnalysis {
  const { plannedType, plannedDuration, plannedTss, actualType, actualDuration, actualTss } = input;

  const missing: StimulusAnalysis['missing'] = {};
  const gained: StimulusAnalysis['gained'] = {};

  // Calculate what was lost
  if (plannedType === actualType) {
    // Same type - just duration/TSS difference
    if (actualDuration < plannedDuration) {
      missing[plannedType] = plannedDuration - actualDuration;
    }
    if (actualTss < plannedTss) {
      missing.tss = plannedTss - actualTss;
    }

    // What was gained (if extended)
    if (actualDuration > plannedDuration) {
      gained[actualType] = actualDuration - plannedDuration;
    }
    if (actualTss > plannedTss) {
      gained.tss = actualTss - plannedTss;
    }
  } else {
    // Different type - lost entire planned stimulus
    missing[plannedType] = plannedDuration;
    missing.tss = plannedTss;

    // Gained different stimulus
    gained[actualType] = actualDuration;
    gained.tss = actualTss;
  }

  // Determine net assessment
  const netAssessment = assessStimulusChange(input);

  return {
    missing,
    gained,
    net_assessment: netAssessment,
  };
}

/**
 * Assess the overall impact of a stimulus change
 */
function assessStimulusChange(input: {
  plannedType: string;
  plannedDuration: number;
  plannedTss: number;
  actualType: string;
  actualDuration: number;
  actualTss: number;
}): AdaptationAssessment {
  const { plannedType, plannedTss, actualType, actualTss } = input;

  const tssDelta = actualTss - plannedTss;
  const tssPercent = plannedTss > 0 ? (tssDelta / plannedTss) * 100 : 0;
  const intensityDelta = getIntensityRankDelta(plannedType, actualType);

  // Beneficial: Did more than planned, or intelligently swapped to similar intensity
  if (tssPercent > 10 && intensityDelta >= 0) {
    return 'beneficial';
  }

  // Acceptable: Within reasonable bounds
  if (Math.abs(tssPercent) <= 20 && Math.abs(intensityDelta) <= 1) {
    return 'acceptable';
  }

  // Minor concern: Noticeable deviation but not problematic
  if (Math.abs(tssPercent) <= 40 || Math.abs(intensityDelta) <= 2) {
    return 'minor_concern';
  }

  // Concerning: Significant deviation from plan
  return 'concerning';
}

// ============================================================================
// FULL ADAPTATION DETECTION
// ============================================================================

/**
 * Perform full adaptation detection and create a WorkoutAdaptation record
 * This is the main entry point for the detection service
 */
export function detectAdaptation(input: DetectAdaptationInput): Omit<WorkoutAdaptationDB, 'id' | 'user_id' | 'created_at'> {
  const { plannedWorkout, activity, userFtp, trainingContext } = input;

  // Detect adaptation type
  const adaptationType = detectAdaptationType(input);

  // Get metrics
  const plannedDuration = plannedWorkout.target_duration || 0;
  const plannedTss = plannedWorkout.target_tss || 0;
  const plannedType = plannedWorkout.workout_type || 'endurance';

  const actualDuration = activity?.duration || 0;
  const actualTss = activity?.tss || 0;
  const actualType = activity ? inferWorkoutCategory(activity, userFtp) : null;
  const actualIf = activity?.intensityFactor ?? null;
  const actualNp = activity?.normalizedPower ?? null;

  // Calculate deltas
  const tssDelta = actualTss - plannedTss;
  const durationDelta = actualDuration - plannedDuration;

  // Calculate stimulus achieved
  const stimulusAchievedPct =
    adaptationType === 'skipped'
      ? 0
      : calculateStimulusAchieved(
          { tss: plannedTss, duration: plannedDuration },
          { tss: actualTss, duration: actualDuration }
        );

  // Analyze stimulus
  const stimulusAnalysis =
    adaptationType === 'skipped'
      ? {
          missing: { [plannedType]: plannedDuration, tss: plannedTss },
          gained: {},
          net_assessment: 'concerning' as AdaptationAssessment,
        }
      : analyzeStimulusDelta({
          plannedType,
          plannedDuration,
          plannedTss,
          actualType: actualType || plannedType,
          actualDuration,
          actualTss,
        });

  // Generate initial AI assessment
  const { assessment, explanation } = generateInitialAssessment(
    adaptationType,
    stimulusAnalysis,
    trainingContext
  );

  return {
    planned_workout_id: plannedWorkout.id,
    activity_id: activity?.id || null,

    adaptation_type: adaptationType,

    planned_workout_type: plannedType,
    planned_tss: plannedTss || null,
    planned_duration: plannedDuration || null,
    planned_intensity_factor: null, // Would need workout library lookup

    actual_workout_type: actualType,
    actual_tss: actualTss || null,
    actual_duration: actualDuration || null,
    actual_intensity_factor: actualIf,
    actual_normalized_power: actualNp,

    tss_delta: tssDelta,
    duration_delta: durationDelta,
    stimulus_achieved_pct: stimulusAchievedPct,
    stimulus_analysis: stimulusAnalysis,

    user_reason: null,
    user_notes: null,

    ai_assessment: assessment,
    ai_explanation: explanation,
    ai_recommendations: null, // Will be populated by AI analysis later

    week_number: trainingContext?.weekNumber ?? plannedWorkout.week_number,
    training_phase: trainingContext?.trainingPhase ?? null,
    ctg_at_time: trainingContext?.ctl ?? null,
    atl_at_time: trainingContext?.atl ?? null,
    tsb_at_time: trainingContext?.tsb ?? null,

    detected_at: new Date().toISOString(),
  };
}

/**
 * Generate an initial rule-based assessment (before AI analysis)
 */
function generateInitialAssessment(
  adaptationType: AdaptationType,
  stimulusAnalysis: StimulusAnalysis,
  context?: { trainingPhase?: TrainingPhase; tsb?: number }
): { assessment: AdaptationAssessment; explanation: string } {
  switch (adaptationType) {
    case 'completed_as_planned':
      return {
        assessment: 'acceptable',
        explanation: 'Workout completed as planned. Great consistency!',
      };

    case 'time_truncated':
      const truncatedPct = stimulusAnalysis.missing.tss
        ? Math.round((stimulusAnalysis.missing.tss / (stimulusAnalysis.missing.tss + (stimulusAnalysis.gained.tss || 0))) * 100)
        : 0;
      if (truncatedPct <= 20) {
        return {
          assessment: 'acceptable',
          explanation: `Workout shortened by ~${truncatedPct}%. Minor reduction in training stimulus.`,
        };
      } else if (truncatedPct <= 35) {
        return {
          assessment: 'minor_concern',
          explanation: `Workout shortened by ~${truncatedPct}%. Consider adding volume later in the week to compensate.`,
        };
      } else {
        return {
          assessment: 'concerning',
          explanation: `Workout significantly shortened by ~${truncatedPct}%. May need to adjust weekly targets.`,
        };
      }

    case 'time_extended':
      return {
        assessment: context?.trainingPhase === 'recovery' || context?.trainingPhase === 'taper' ? 'minor_concern' : 'beneficial',
        explanation:
          context?.trainingPhase === 'recovery' || context?.trainingPhase === 'taper'
            ? 'Extended workout during recovery/taper phase. Monitor fatigue levels.'
            : 'Extended workout duration. Extra training stimulus achieved.',
      };

    case 'intensity_swap':
      return {
        assessment: stimulusAnalysis.net_assessment,
        explanation: `Swapped workout type. ${
          stimulusAnalysis.net_assessment === 'acceptable'
            ? 'Similar training load achieved.'
            : 'Training stimulus changed - may affect weekly balance.'
        }`,
      };

    case 'upgraded':
      const upgradedAssessment: AdaptationAssessment =
        context?.tsb !== undefined && context.tsb < -20 ? 'concerning' : 'acceptable';
      return {
        assessment: upgradedAssessment,
        explanation:
          upgradedAssessment === 'concerning'
            ? 'Upgraded to harder workout while fatigued (TSB < -20). Risk of overtraining.'
            : 'Upgraded to harder workout. Extra intensity achieved.',
      };

    case 'downgraded':
      const wasPlannedIntense = Object.keys(stimulusAnalysis.missing).some((k) =>
        ['threshold', 'vo2max', 'anaerobic'].includes(k)
      );
      return {
        assessment: wasPlannedIntense ? 'minor_concern' : 'acceptable',
        explanation: wasPlannedIntense
          ? 'Downgraded from high-intensity workout. Key session stimulus missed.'
          : 'Downgraded workout intensity. May be appropriate based on fatigue.',
      };

    case 'skipped':
      return {
        assessment: 'concerning',
        explanation: 'Workout skipped. Planned training stimulus not achieved.',
      };

    case 'unplanned':
      return {
        assessment: 'acceptable',
        explanation: 'Unplanned activity completed. Consider how it fits into your training load.',
      };

    default:
      return {
        assessment: 'acceptable',
        explanation: 'Workout completed with some variation from plan.',
      };
  }
}

// ============================================================================
// BATCH DETECTION FOR WEEK ANALYSIS
// ============================================================================

/**
 * Detect adaptations for multiple planned workouts in a date range
 * Useful for analyzing a full week of training
 */
export function detectWeekAdaptations(
  plannedWorkouts: PlannedWorkoutDB[],
  activities: (ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null })[],
  userFtp?: number,
  trainingContext?: { weekNumber?: number; trainingPhase?: TrainingPhase; ctl?: number; atl?: number; tsb?: number }
): Array<Omit<WorkoutAdaptationDB, 'id' | 'user_id' | 'created_at'>> {
  const adaptations: Array<Omit<WorkoutAdaptationDB, 'id' | 'user_id' | 'created_at'>> = [];
  const usedActivityIds = new Set<string>();

  // Sort workouts by date
  const sortedWorkouts = [...plannedWorkouts].sort((a, b) =>
    a.scheduled_date.localeCompare(b.scheduled_date)
  );

  for (const workout of sortedWorkouts) {
    // Skip rest days
    if (workout.workout_type === 'rest' || !workout.workout_id) {
      continue;
    }

    // Find best matching activity
    const matchingActivity = findBestMatchingActivity(workout, activities, usedActivityIds);

    if (matchingActivity) {
      usedActivityIds.add(matchingActivity.id);
    }

    // Detect adaptation
    const adaptation = detectAdaptation({
      plannedWorkout: workout,
      activity: matchingActivity || ({} as ActivitySummary),
      userFtp,
      trainingContext,
    });

    // Handle case where no activity was found
    if (!matchingActivity) {
      adaptation.adaptation_type = 'skipped';
      adaptation.activity_id = null;
      adaptation.actual_workout_type = null;
      adaptation.actual_tss = null;
      adaptation.actual_duration = null;
      adaptation.stimulus_achieved_pct = 0;
      adaptation.ai_assessment = 'concerning';
      adaptation.ai_explanation = 'Workout skipped. Planned training stimulus not achieved.';
    }

    adaptations.push(adaptation);
  }

  // Check for unplanned activities
  const unplannedActivities = activities.filter((a) => !usedActivityIds.has(a.id));
  for (const activity of unplannedActivities) {
    adaptations.push({
      planned_workout_id: null,
      activity_id: activity.id,
      adaptation_type: 'unplanned',
      planned_workout_type: null,
      planned_tss: null,
      planned_duration: null,
      planned_intensity_factor: null,
      actual_workout_type: inferWorkoutCategory(activity, userFtp),
      actual_tss: activity.tss,
      actual_duration: activity.duration,
      actual_intensity_factor: activity.intensityFactor ?? null,
      actual_normalized_power: activity.normalizedPower ?? null,
      tss_delta: null,
      duration_delta: null,
      stimulus_achieved_pct: null,
      stimulus_analysis: null,
      user_reason: null,
      user_notes: null,
      ai_assessment: 'acceptable',
      ai_explanation: 'Unplanned activity completed. Consider how it fits into your training load.',
      ai_recommendations: null,
      week_number: trainingContext?.weekNumber ?? null,
      training_phase: trainingContext?.trainingPhase ?? null,
      ctg_at_time: trainingContext?.ctl ?? null,
      atl_at_time: trainingContext?.atl ?? null,
      tsb_at_time: trainingContext?.tsb ?? null,
      detected_at: new Date().toISOString(),
    });
  }

  return adaptations;
}

/**
 * Find the best matching activity for a planned workout
 */
function findBestMatchingActivity(
  workout: PlannedWorkoutDB,
  activities: (ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null })[],
  usedIds: Set<string>
): (ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null }) | null {
  const workoutDate = new Date(workout.scheduled_date);
  let bestMatch: (ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null }) | null = null;
  let bestScore = 0;

  for (const activity of activities) {
    if (usedIds.has(activity.id)) continue;

    const activityDate = new Date(activity.date);
    const daysDiff = Math.abs(
      (activityDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only consider activities within 1 day of scheduled date
    if (daysDiff > 1) continue;

    // Calculate match score
    let score = 0;

    // Date proximity (max 40 points)
    score += 40 * (1 - daysDiff);

    // Duration match (max 30 points)
    if (workout.target_duration && activity.duration) {
      const durationRatio = Math.min(activity.duration, workout.target_duration) /
        Math.max(activity.duration, workout.target_duration);
      score += 30 * durationRatio;
    }

    // TSS match (max 30 points)
    if (workout.target_tss && activity.tss) {
      const tssRatio = Math.min(activity.tss, workout.target_tss) /
        Math.max(activity.tss, workout.target_tss);
      score += 30 * tssRatio;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = activity;
    }
  }

  // Require minimum score of 40 (at least same day)
  return bestScore >= 40 ? bestMatch : null;
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export const WORKOUT_CATEGORY_INTENSITY = CATEGORY_INTENSITY_RANK;
export const SIMILAR_WORKOUT_CATEGORIES = SIMILAR_CATEGORIES;
