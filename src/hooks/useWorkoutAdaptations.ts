/**
 * useWorkoutAdaptations Hook
 * Manages workout adaptation detection, storage, and analysis
 *
 * Features:
 * - Detect adaptations when activities are linked to workouts
 * - Fetch and manage adaptation history
 * - Aggregate weekly/monthly adaptation summaries
 * - Update user feedback on adaptations
 * - Fetch and manage training insights
 */

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  detectAdaptation,
  detectWeekAdaptations,
  inferWorkoutCategory,
} from '../utils/adaptationDetection';
import type {
  WorkoutAdaptationDB,
  WorkoutAdaptation,
  TrainingInsightDB,
  TrainingInsight,
  PlannedWorkoutDB,
  ActivitySummary,
  AdaptationType,
  AdaptationReason,
  InsightStatus,
  WeekAdaptationsSummary,
  UserTrainingPatternsDB,
  UserTrainingPatterns,
  TrainingPhase,
} from '../types/training';

// ============================================================================
// TYPES
// ============================================================================

interface UseWorkoutAdaptationsOptions {
  userId: string | null;
}

interface DetectAdaptationOptions {
  plannedWorkout: PlannedWorkoutDB;
  activity: ActivitySummary & {
    intensityFactor?: number | null;
    normalizedPower?: number | null;
  };
  userFtp?: number;
  trainingContext?: {
    weekNumber?: number;
    trainingPhase?: TrainingPhase;
    ctl?: number;
    atl?: number;
    tsb?: number;
  };
}

interface UseWorkoutAdaptationsReturn {
  // State
  adaptations: WorkoutAdaptation[];
  insights: TrainingInsight[];
  userPatterns: UserTrainingPatterns | null;
  loading: boolean;
  error: string | null;

  // Adaptation operations
  detectAndSaveAdaptation: (options: DetectAdaptationOptions) => Promise<WorkoutAdaptation | null>;
  detectWeeklyAdaptations: (
    plannedWorkouts: PlannedWorkoutDB[],
    activities: (ActivitySummary & { intensityFactor?: number | null; normalizedPower?: number | null })[],
    userFtp?: number,
    trainingContext?: {
      weekNumber?: number;
      trainingPhase?: TrainingPhase;
      ctl?: number;
      atl?: number;
      tsb?: number;
    }
  ) => Promise<WorkoutAdaptation[]>;
  updateAdaptationFeedback: (
    adaptationId: string,
    feedback: { reason?: AdaptationReason; notes?: string }
  ) => Promise<boolean>;
  fetchAdaptations: (options?: {
    weekStart?: string;
    weekEnd?: string;
    limit?: number;
  }) => Promise<void>;
  getWeekSummary: (weekStart: string) => Promise<WeekAdaptationsSummary | null>;

  // Insight operations
  fetchInsights: (options?: { status?: InsightStatus; limit?: number }) => Promise<void>;
  dismissInsight: (insightId: string, reason?: string) => Promise<boolean>;
  applyInsight: (insightId: string) => Promise<boolean>;
  rateInsightOutcome: (insightId: string, rating: number, notes?: string) => Promise<boolean>;

  // Pattern operations
  fetchUserPatterns: () => Promise<void>;
  updateUserPatterns: () => Promise<void>;

  // Utilities
  getAdaptationForWorkout: (workoutId: string) => WorkoutAdaptation | null;
  getAdaptationsForWeek: (weekNumber: number) => WorkoutAdaptation[];
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

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

/**
 * Convert database insight to frontend model
 */
function toTrainingInsight(db: TrainingInsightDB): TrainingInsight {
  return {
    id: db.id,
    scope: db.insight_scope,
    planId: db.plan_id,
    weekStart: db.week_start,
    weekNumber: db.week_number,
    type: db.insight_type,
    priority: db.priority,
    title: db.title,
    message: db.message,
    suggestedAction: db.suggested_action,
    relatedWorkoutIds: db.related_workout_ids || [],
    relatedAdaptationIds: db.related_adaptation_ids || [],
    status: db.status,
    appliedAt: db.applied_at,
    dismissedAt: db.dismissed_at,
    outcomeRating: db.outcome_rating,
    createdAt: db.created_at,
  };
}

/**
 * Convert database patterns to frontend model
 */
function toUserTrainingPatterns(db: UserTrainingPatternsDB): UserTrainingPatterns {
  return {
    avgWeeklyCompliance: db.avg_weekly_compliance,
    complianceTrend: db.compliance_trend,
    totalWorkoutsTracked: db.total_workouts_tracked,
    complianceByDay: db.compliance_by_day || {},
    preferredWorkoutDays: db.preferred_workout_days || [],
    problematicDays: db.problematic_days || [],
    commonAdaptations: db.common_adaptations || [],
    adaptationReasons: db.adaptation_reasons || {},
    workoutTypeCompliance: db.workout_type_compliance || {},
    preferredWorkoutTypes: db.preferred_workout_types || [],
    avoidedWorkoutTypes: db.avoided_workout_types || [],
    insightsAppliedRate: db.insights_applied_rate,
    tendsToOverreach: db.tends_to_overreach,
    tendsToUndertrain: db.tends_to_undertrain,
    avgTssAchievementPct: db.avg_tss_achievement_pct,
    patternConfidence: db.pattern_confidence,
    hasEnoughData: db.total_workouts_tracked >= db.min_data_for_predictions,
  };
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useWorkoutAdaptations({
  userId,
}: UseWorkoutAdaptationsOptions): UseWorkoutAdaptationsReturn {
  const [adaptations, setAdaptations] = useState<WorkoutAdaptation[]>([]);
  const [insights, setInsights] = useState<TrainingInsight[]>([]);
  const [userPatterns, setUserPatterns] = useState<UserTrainingPatterns | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // ADAPTATION OPERATIONS
  // ============================================================================

  /**
   * Detect an adaptation and save it to the database
   */
  const detectAndSaveAdaptation = useCallback(
    async (options: DetectAdaptationOptions): Promise<WorkoutAdaptation | null> => {
      if (!userId) return null;

      try {
        setError(null);

        // Detect the adaptation
        const adaptationData = detectAdaptation(options);

        // Save to database
        const { data, error: insertError } = await supabase
          .from('workout_adaptations')
          .insert({
            user_id: userId,
            ...adaptationData,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const adaptation = toWorkoutAdaptation(data as WorkoutAdaptationDB);

        // Update local state
        setAdaptations((prev) => [adaptation, ...prev]);

        return adaptation;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to detect adaptation';
        setError(message);
        console.error('Error detecting adaptation:', err);
        return null;
      }
    },
    [userId]
  );

  /**
   * Detect adaptations for a full week of planned workouts
   */
  const detectWeeklyAdaptations = useCallback(
    async (
      plannedWorkouts: PlannedWorkoutDB[],
      activities: (ActivitySummary & {
        intensityFactor?: number | null;
        normalizedPower?: number | null;
      })[],
      userFtp?: number,
      trainingContext?: {
        weekNumber?: number;
        trainingPhase?: TrainingPhase;
        ctl?: number;
        atl?: number;
        tsb?: number;
      }
    ): Promise<WorkoutAdaptation[]> => {
      if (!userId) return [];

      try {
        setLoading(true);
        setError(null);

        // Detect all adaptations
        const adaptationDataList = detectWeekAdaptations(
          plannedWorkouts,
          activities,
          userFtp,
          trainingContext
        );

        // Save all to database
        const { data, error: insertError } = await supabase
          .from('workout_adaptations')
          .insert(
            adaptationDataList.map((a) => ({
              user_id: userId,
              ...a,
            }))
          )
          .select();

        if (insertError) throw insertError;

        const savedAdaptations = (data as WorkoutAdaptationDB[]).map(toWorkoutAdaptation);

        // Update local state
        setAdaptations((prev) => [...savedAdaptations, ...prev]);

        return savedAdaptations;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to detect weekly adaptations';
        setError(message);
        console.error('Error detecting weekly adaptations:', err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  /**
   * Update user feedback on an adaptation
   */
  const updateAdaptationFeedback = useCallback(
    async (
      adaptationId: string,
      feedback: { reason?: AdaptationReason; notes?: string }
    ): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { error: updateError } = await supabase
          .from('workout_adaptations')
          .update({
            user_reason: feedback.reason,
            user_notes: feedback.notes,
          })
          .eq('id', adaptationId)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        // Update local state
        setAdaptations((prev) =>
          prev.map((a) =>
            a.id === adaptationId
              ? {
                  ...a,
                  userFeedback: {
                    reason: feedback.reason ?? a.userFeedback.reason,
                    notes: feedback.notes ?? a.userFeedback.notes,
                  },
                }
              : a
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update feedback';
        setError(message);
        console.error('Error updating adaptation feedback:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Fetch adaptations from the database
   */
  const fetchAdaptations = useCallback(
    async (options?: { weekStart?: string; weekEnd?: string; limit?: number }): Promise<void> => {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('workout_adaptations')
          .select('*')
          .eq('user_id', userId)
          .order('detected_at', { ascending: false });

        if (options?.weekStart) {
          query = query.gte('detected_at', options.weekStart);
        }
        if (options?.weekEnd) {
          query = query.lte('detected_at', options.weekEnd);
        }
        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        setAdaptations((data as WorkoutAdaptationDB[]).map(toWorkoutAdaptation));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch adaptations';
        setError(message);
        console.error('Error fetching adaptations:', err);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  /**
   * Get a summary of adaptations for a specific week
   */
  const getWeekSummary = useCallback(
    async (weekStart: string): Promise<WeekAdaptationsSummary | null> => {
      if (!userId) return null;

      try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const { data, error: fetchError } = await supabase
          .from('workout_adaptations')
          .select('*')
          .eq('user_id', userId)
          .gte('detected_at', weekStart)
          .lt('detected_at', weekEnd.toISOString());

        if (fetchError) throw fetchError;

        const weekAdaptations = data as WorkoutAdaptationDB[];

        if (weekAdaptations.length === 0) {
          return null;
        }

        // Calculate summary
        const totalPlanned = weekAdaptations.filter((a) => a.planned_workout_id).length;
        const totalCompleted = weekAdaptations.filter((a) => a.activity_id).length;
        const totalAdapted = weekAdaptations.filter(
          (a) =>
            a.adaptation_type !== 'completed_as_planned' &&
            a.adaptation_type !== 'skipped' &&
            a.adaptation_type !== 'unplanned'
        ).length;
        const totalSkipped = weekAdaptations.filter((a) => a.adaptation_type === 'skipped').length;

        const stimulusValues = weekAdaptations
          .map((a) => a.stimulus_achieved_pct)
          .filter((v): v is number => v !== null);
        const avgStimulusAchieved =
          stimulusValues.length > 0
            ? stimulusValues.reduce((sum, v) => sum + v, 0) / stimulusValues.length
            : null;

        const adaptationTypes = weekAdaptations.reduce(
          (acc, a) => {
            acc[a.adaptation_type] = (acc[a.adaptation_type] || 0) + 1;
            return acc;
          },
          {} as Record<AdaptationType, number>
        );

        const tssPlanned = weekAdaptations.reduce((sum, a) => sum + (a.planned_tss || 0), 0);
        const tssActual = weekAdaptations.reduce((sum, a) => sum + (a.actual_tss || 0), 0);
        const tssAchievementPct = tssPlanned > 0 ? Math.round((tssActual / tssPlanned) * 100) : 0;

        return {
          weekStart,
          totalPlanned,
          totalCompleted,
          totalAdapted,
          totalSkipped,
          avgStimulusAchieved,
          adaptationTypes,
          tssPlanned,
          tssActual,
          tssAchievementPct,
        };
      } catch (err) {
        console.error('Error getting week summary:', err);
        return null;
      }
    },
    [userId]
  );

  // ============================================================================
  // INSIGHT OPERATIONS
  // ============================================================================

  /**
   * Fetch training insights
   */
  const fetchInsights = useCallback(
    async (options?: { status?: InsightStatus; limit?: number }): Promise<void> => {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('training_insights')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (options?.status) {
          query = query.eq('status', options.status);
        }
        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        setInsights((data as TrainingInsightDB[]).map(toTrainingInsight));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch insights';
        setError(message);
        console.error('Error fetching insights:', err);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  /**
   * Dismiss an insight
   */
  const dismissInsight = useCallback(
    async (insightId: string, reason?: string): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { error: updateError } = await supabase
          .from('training_insights')
          .update({
            status: 'dismissed',
            dismissed_at: new Date().toISOString(),
            dismissed_reason: reason,
          })
          .eq('id', insightId)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        // Update local state
        setInsights((prev) =>
          prev.map((i) =>
            i.id === insightId
              ? { ...i, status: 'dismissed' as InsightStatus, dismissedAt: new Date().toISOString() }
              : i
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to dismiss insight';
        setError(message);
        console.error('Error dismissing insight:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Mark an insight as applied
   */
  const applyInsight = useCallback(
    async (insightId: string): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { error: updateError } = await supabase
          .from('training_insights')
          .update({
            status: 'applied',
            applied_at: new Date().toISOString(),
          })
          .eq('id', insightId)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        // Update local state
        setInsights((prev) =>
          prev.map((i) =>
            i.id === insightId
              ? { ...i, status: 'applied' as InsightStatus, appliedAt: new Date().toISOString() }
              : i
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply insight';
        setError(message);
        console.error('Error applying insight:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Rate the outcome of an applied insight
   */
  const rateInsightOutcome = useCallback(
    async (insightId: string, rating: number, notes?: string): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { error: updateError } = await supabase
          .from('training_insights')
          .update({
            outcome_rating: rating,
            outcome_notes: notes,
          })
          .eq('id', insightId)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        // Update local state
        setInsights((prev) =>
          prev.map((i) => (i.id === insightId ? { ...i, outcomeRating: rating } : i))
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rate insight';
        setError(message);
        console.error('Error rating insight:', err);
        return false;
      }
    },
    [userId]
  );

  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================

  /**
   * Fetch user training patterns
   */
  const fetchUserPatterns = useCallback(async (): Promise<void> => {
    if (!userId) return;

    try {
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_training_patterns')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        setUserPatterns(toUserTrainingPatterns(data as UserTrainingPatternsDB));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch patterns';
      setError(message);
      console.error('Error fetching user patterns:', err);
    }
  }, [userId]);

  /**
   * Recalculate and update user training patterns
   * This aggregates all historical adaptations to identify patterns
   */
  const updateUserPatterns = useCallback(async (): Promise<void> => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all adaptations for pattern analysis
      const { data: allAdaptations, error: fetchError } = await supabase
        .from('workout_adaptations')
        .select('*')
        .eq('user_id', userId)
        .order('detected_at', { ascending: false });

      if (fetchError) throw fetchError;

      const adaptationsList = allAdaptations as WorkoutAdaptationDB[];

      if (adaptationsList.length === 0) {
        return;
      }

      // Calculate patterns
      const totalWorkouts = adaptationsList.length;
      const completedAsPlanned = adaptationsList.filter(
        (a) => a.adaptation_type === 'completed_as_planned'
      ).length;
      const avgCompliance = (completedAsPlanned / totalWorkouts) * 100;

      // Compliance by day of week
      const byDay: Record<number, { total: number; completed: number }> = {};
      for (const a of adaptationsList) {
        const date = new Date(a.detected_at);
        const day = date.getDay();
        if (!byDay[day]) byDay[day] = { total: 0, completed: 0 };
        byDay[day].total++;
        if (a.adaptation_type === 'completed_as_planned') {
          byDay[day].completed++;
        }
      }

      const complianceByDay: Record<string, number> = {};
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (const [day, stats] of Object.entries(byDay)) {
        complianceByDay[dayNames[parseInt(day)]] = stats.total > 0 ? stats.completed / stats.total : 0;
      }

      // Find preferred and problematic days
      const sortedDays = Object.entries(complianceByDay).sort((a, b) => b[1] - a[1]);
      const preferredDays = sortedDays.slice(0, 3).map(([day]) => dayNames.indexOf(day));
      const problematicDays = sortedDays
        .slice(-2)
        .filter(([, compliance]) => compliance < 0.5)
        .map(([day]) => dayNames.indexOf(day));

      // Adaptation type frequencies
      const adaptationCounts: Record<string, number> = {};
      for (const a of adaptationsList) {
        adaptationCounts[a.adaptation_type] = (adaptationCounts[a.adaptation_type] || 0) + 1;
      }

      const commonAdaptations = Object.entries(adaptationCounts)
        .filter(([type]) => type !== 'completed_as_planned')
        .map(([type, count]) => ({
          type: type as AdaptationType,
          frequency: count / totalWorkouts,
          avgDelta: 0, // Would need more calculation
        }))
        .sort((a, b) => b.frequency - a.frequency);

      // Reason frequencies
      const reasonCounts: Record<string, number> = {};
      const withReasons = adaptationsList.filter((a) => a.user_reason);
      for (const a of withReasons) {
        if (a.user_reason) {
          reasonCounts[a.user_reason] = (reasonCounts[a.user_reason] || 0) + 1;
        }
      }

      const adaptationReasons: Record<string, number> = {};
      for (const [reason, count] of Object.entries(reasonCounts)) {
        adaptationReasons[reason] = withReasons.length > 0 ? count / withReasons.length : 0;
      }

      // TSS achievement
      const withTss = adaptationsList.filter((a) => a.planned_tss && a.actual_tss);
      const avgTssAchievement =
        withTss.length > 0
          ? withTss.reduce((sum, a) => sum + (a.actual_tss! / a.planned_tss!) * 100, 0) / withTss.length
          : null;

      // Determine tendencies
      const tendsToUndertrain = avgTssAchievement !== null && avgTssAchievement < 85;
      const tendsToOverreach = avgTssAchievement !== null && avgTssAchievement > 115;

      // Calculate pattern confidence (more data = higher confidence)
      const patternConfidence = Math.min(1, totalWorkouts / 50); // Max confidence at 50 workouts

      // Upsert patterns
      const { error: upsertError } = await supabase.from('user_training_patterns').upsert(
        {
          user_id: userId,
          avg_weekly_compliance: avgCompliance,
          compliance_trend: 'stable', // Would need historical comparison
          total_workouts_tracked: totalWorkouts,
          total_adaptations_tracked: totalWorkouts - completedAsPlanned,
          compliance_by_day: complianceByDay,
          preferred_workout_days: preferredDays,
          problematic_days: problematicDays,
          common_adaptations: commonAdaptations,
          adaptation_reasons: adaptationReasons,
          avg_tss_achievement_pct: avgTssAchievement,
          tends_to_overreach: tendsToOverreach,
          tends_to_undertrain: tendsToUndertrain,
          pattern_confidence: patternConfidence,
          last_updated_at: new Date().toISOString(),
          first_tracked_at:
            adaptationsList.length > 0
              ? adaptationsList[adaptationsList.length - 1].detected_at
              : new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (upsertError) throw upsertError;

      // Refresh patterns
      await fetchUserPatterns();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update patterns';
      setError(message);
      console.error('Error updating user patterns:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, fetchUserPatterns]);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Get adaptation for a specific workout
   */
  const getAdaptationForWorkout = useCallback(
    (workoutId: string): WorkoutAdaptation | null => {
      return adaptations.find((a) => a.plannedWorkoutId === workoutId) || null;
    },
    [adaptations]
  );

  /**
   * Get all adaptations for a specific week
   */
  const getAdaptationsForWeek = useCallback(
    (weekNumber: number): WorkoutAdaptation[] => {
      return adaptations.filter((a) => a.context.weekNumber === weekNumber);
    },
    [adaptations]
  );

  return {
    // State
    adaptations,
    insights,
    userPatterns,
    loading,
    error,

    // Adaptation operations
    detectAndSaveAdaptation,
    detectWeeklyAdaptations,
    updateAdaptationFeedback,
    fetchAdaptations,
    getWeekSummary,

    // Insight operations
    fetchInsights,
    dismissInsight,
    applyInsight,
    rateInsightOutcome,

    // Pattern operations
    fetchUserPatterns,
    updateUserPatterns,

    // Utilities
    getAdaptationForWorkout,
    getAdaptationsForWeek,
  };
}
