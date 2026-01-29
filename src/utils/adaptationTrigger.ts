/**
 * Adaptation Trigger Service
 *
 * Integrates workout adaptation detection with the activity sync flow.
 * Called when activities are linked to planned workouts to automatically
 * detect and record adaptations.
 */

import { supabase } from '../lib/supabase';
import {
  detectAdaptation,
  inferWorkoutCategory,
} from './adaptationDetection';
import type {
  PlannedWorkoutDB,
  WorkoutAdaptation,
  WorkoutAdaptationDB,
  TrainingPhase,
} from '../types/training';

// ============================================================================
// TYPES
// ============================================================================

interface Activity {
  id: string;
  name: string;
  type: string;
  start_date: string;
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  distance: number; // meters
  total_elevation_gain: number;
  average_watts: number | null;
  normalized_power: number | null;
  kilojoules: number | null;
  tss: number | null;
  intensity_factor: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
}

interface TrainingContext {
  weekNumber?: number;
  trainingPhase?: TrainingPhase;
  ctl?: number;
  atl?: number;
  tsb?: number;
  userFtp?: number;
}

interface AdaptationTriggerResult {
  success: boolean;
  adaptation: WorkoutAdaptation | null;
  error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert activity from database format to the format expected by detection
 */
function activityToSummary(activity: Activity) {
  return {
    id: activity.id,
    name: activity.name,
    date: activity.start_date,
    duration: Math.round(activity.moving_time / 60), // Convert seconds to minutes
    distance: activity.distance / 1000, // Convert meters to km
    tss: activity.tss,
    elevationGain: activity.total_elevation_gain,
    averagePower: activity.average_watts,
    normalizedPower: activity.normalized_power,
    intensityFactor: activity.intensity_factor,
  };
}

/**
 * Convert database adaptation to frontend model
 */
function toWorkoutAdaptation(db: WorkoutAdaptationDB): WorkoutAdaptation {
  return {
    id: db.id,
    plannedWorkoutId: db.planned_workout_id,
    activityId: db.activity_id,
    adaptationType: db.adaptation_type,
    planned: {
      workoutType: db.planned_workout_type,
      tss: db.planned_tss,
      duration: db.planned_duration,
      intensityFactor: db.planned_intensity_factor,
    },
    actual: {
      workoutType: db.actual_workout_type,
      tss: db.actual_tss,
      duration: db.actual_duration,
      intensityFactor: db.actual_intensity_factor,
      normalizedPower: db.actual_normalized_power,
    },
    analysis: {
      tssDelta: db.tss_delta,
      durationDelta: db.duration_delta,
      stimulusAchievedPct: db.stimulus_achieved_pct,
      stimulusAnalysis: db.stimulus_analysis,
    },
    userFeedback: {
      reason: db.user_reason,
      notes: db.user_notes,
    },
    aiAssessment: {
      assessment: db.ai_assessment,
      explanation: db.ai_explanation,
      recommendations: db.ai_recommendations,
    },
    context: {
      weekNumber: db.week_number,
      trainingPhase: db.training_phase,
      ctl: db.ctg_at_time,
      atl: db.atl_at_time,
      tsb: db.tsb_at_time,
    },
    detectedAt: db.detected_at,
  };
}

// ============================================================================
// MAIN TRIGGER FUNCTIONS
// ============================================================================

/**
 * Trigger adaptation detection when an activity is linked to a workout
 *
 * This is the main entry point called from linkActivityToWorkout
 */
export async function triggerAdaptationDetection(
  userId: string,
  workoutId: string,
  activityId: string,
  context?: TrainingContext
): Promise<AdaptationTriggerResult> {
  try {
    // Fetch the planned workout
    const { data: workout, error: workoutError } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('id', workoutId)
      .single();

    if (workoutError) {
      throw new Error(`Failed to fetch workout: ${workoutError.message}`);
    }

    // Fetch the activity
    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .single();

    if (activityError) {
      throw new Error(`Failed to fetch activity: ${activityError.message}`);
    }

    // Check if an adaptation already exists for this workout
    const { data: existingAdaptation } = await supabase
      .from('workout_adaptations')
      .select('id')
      .eq('planned_workout_id', workoutId)
      .single();

    if (existingAdaptation) {
      // Update existing adaptation instead of creating new one
      return await updateExistingAdaptation(
        userId,
        existingAdaptation.id,
        workout as PlannedWorkoutDB,
        activity as Activity,
        context
      );
    }

    // Detect the adaptation
    const adaptationData = detectAdaptation({
      plannedWorkout: workout as PlannedWorkoutDB,
      activity: activityToSummary(activity as Activity),
      userFtp: context?.userFtp,
      trainingContext: context,
    });

    // Save to database
    const { data: savedAdaptation, error: insertError } = await supabase
      .from('workout_adaptations')
      .insert({
        user_id: userId,
        ...adaptationData,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to save adaptation: ${insertError.message}`);
    }

    return {
      success: true,
      adaptation: toWorkoutAdaptation(savedAdaptation as WorkoutAdaptationDB),
    };
  } catch (error) {
    console.error('Error in triggerAdaptationDetection:', error);
    return {
      success: false,
      adaptation: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update an existing adaptation record
 */
async function updateExistingAdaptation(
  userId: string,
  adaptationId: string,
  workout: PlannedWorkoutDB,
  activity: Activity,
  context?: TrainingContext
): Promise<AdaptationTriggerResult> {
  try {
    const adaptationData = detectAdaptation({
      plannedWorkout: workout,
      activity: activityToSummary(activity),
      userFtp: context?.userFtp,
      trainingContext: context,
    });

    const { data: updatedAdaptation, error: updateError } = await supabase
      .from('workout_adaptations')
      .update({
        activity_id: activity.id,
        adaptation_type: adaptationData.adaptation_type,
        actual_workout_type: adaptationData.actual_workout_type,
        actual_tss: adaptationData.actual_tss,
        actual_duration: adaptationData.actual_duration,
        actual_intensity_factor: adaptationData.actual_intensity_factor,
        actual_normalized_power: adaptationData.actual_normalized_power,
        tss_delta: adaptationData.tss_delta,
        duration_delta: adaptationData.duration_delta,
        stimulus_achieved_pct: adaptationData.stimulus_achieved_pct,
        stimulus_analysis: adaptationData.stimulus_analysis,
        ai_assessment: adaptationData.ai_assessment,
        ai_explanation: adaptationData.ai_explanation,
        detected_at: new Date().toISOString(),
      })
      .eq('id', adaptationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update adaptation: ${updateError.message}`);
    }

    return {
      success: true,
      adaptation: toWorkoutAdaptation(updatedAdaptation as WorkoutAdaptationDB),
    };
  } catch (error) {
    console.error('Error in updateExistingAdaptation:', error);
    return {
      success: false,
      adaptation: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch user's training context (CTL, ATL, TSB, FTP)
 */
export async function fetchTrainingContext(userId: string): Promise<TrainingContext> {
  try {
    // Fetch user's FTP
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ftp')
      .eq('id', userId)
      .single();

    // Fetch latest fitness snapshot
    const { data: snapshot } = await supabase
      .from('fitness_snapshots')
      .select('ctl, atl, tsb')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    // Fetch active plan info
    const { data: plan } = await supabase
      .from('training_plans')
      .select('current_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    return {
      userFtp: profile?.ftp ?? undefined,
      ctl: snapshot?.ctl ?? undefined,
      atl: snapshot?.atl ?? undefined,
      tsb: snapshot?.tsb ?? undefined,
      weekNumber: plan?.current_week ?? undefined,
    };
  } catch (error) {
    console.error('Error fetching training context:', error);
    return {};
  }
}

/**
 * Check if an adaptation warrants showing a feedback prompt
 *
 * Returns true for significant adaptations where user feedback would be valuable
 */
export function shouldPromptForFeedback(adaptation: WorkoutAdaptation): boolean {
  // Always prompt for skipped workouts
  if (adaptation.adaptationType === 'skipped') {
    return true;
  }

  // Prompt for significant deviations
  if (
    adaptation.adaptationType === 'time_truncated' ||
    adaptation.adaptationType === 'downgraded' ||
    adaptation.adaptationType === 'intensity_swap'
  ) {
    // Only prompt if stimulus achieved is less than 80%
    if (
      adaptation.analysis.stimulusAchievedPct !== null &&
      adaptation.analysis.stimulusAchievedPct < 80
    ) {
      return true;
    }
  }

  // Prompt for concerning assessments
  if (
    adaptation.aiAssessment.assessment === 'concerning' ||
    adaptation.aiAssessment.assessment === 'minor_concern'
  ) {
    return true;
  }

  return false;
}

/**
 * Get a human-readable summary of an adaptation
 */
export function getAdaptationSummary(adaptation: WorkoutAdaptation): string {
  const { adaptationType, planned, actual, analysis } = adaptation;

  switch (adaptationType) {
    case 'completed_as_planned':
      return `Completed as planned (${actual.tss} TSS)`;

    case 'time_truncated':
      return `Shortened from ${planned.duration}min to ${actual.duration}min (${analysis.stimulusAchievedPct}% stimulus)`;

    case 'time_extended':
      return `Extended from ${planned.duration}min to ${actual.duration}min`;

    case 'intensity_swap':
      return `Swapped ${planned.workoutType} for ${actual.workoutType}`;

    case 'upgraded':
      return `Upgraded from ${planned.workoutType} to ${actual.workoutType} (+${analysis.tssDelta} TSS)`;

    case 'downgraded':
      return `Downgraded from ${planned.workoutType} to ${actual.workoutType} (${analysis.tssDelta} TSS)`;

    case 'skipped':
      return `Skipped planned ${planned.workoutType} workout (${planned.tss} TSS missed)`;

    case 'unplanned':
      return `Unplanned ${actual.workoutType} activity (${actual.tss} TSS)`;

    default:
      return `Activity completed with adaptation`;
  }
}

/**
 * Get the color associated with an adaptation assessment
 */
export function getAssessmentColor(assessment: string | null): string {
  switch (assessment) {
    case 'beneficial':
      return 'green';
    case 'acceptable':
      return 'blue';
    case 'minor_concern':
      return 'yellow';
    case 'concerning':
      return 'orange';
    default:
      return 'gray';
  }
}

/**
 * Get the icon name associated with an adaptation type
 */
export function getAdaptationIcon(adaptationType: string): string {
  switch (adaptationType) {
    case 'completed_as_planned':
      return 'check';
    case 'time_truncated':
      return 'clock-minus';
    case 'time_extended':
      return 'clock-plus';
    case 'intensity_swap':
      return 'arrows-exchange';
    case 'upgraded':
      return 'trending-up';
    case 'downgraded':
      return 'trending-down';
    case 'skipped':
      return 'x';
    case 'unplanned':
      return 'plus';
    default:
      return 'activity';
  }
}
