/**
 * useTrainingPlan Hook
 * Centralized state management for training plans
 *
 * Features:
 * - Load and manage active training plan
 * - Plan operations (activate, pause, resume, complete)
 * - Progress calculation and tracking
 * - Workout management
 * - Activity auto-linking
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getPlanTemplate } from '../data/trainingPlanTemplates';
import { WORKOUT_LIBRARY, getWorkoutById } from '../data/workoutLibrary';
import {
  findOptimalSupplementDays,
  getSupplementWorkouts,
  type PlannedWorkoutInfo,
  type SuggestedPlacement,
} from '../utils/trainingPlans';
import type {
  TrainingPlanDB,
  PlannedWorkoutDB,
  TrainingPlanTemplate,
  PlanProgress,
  WeeklyStats,
  TrainingPhase,
  PlannedWorkoutWithDetails,
  ActivePlan,
  PlanStatus,
  DayOfWeek,
} from '../types/training';
import type { PlannedWorkoutInsert, TrainingPlanInsert } from '../types/database';

// Day mapping for workout generation
const DAY_MAP: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface UseTrainingPlanOptions {
  userId: string | null;
  autoLoad?: boolean;
}

interface UseTrainingPlanReturn {
  // State
  activePlan: ActivePlan | null;
  plannedWorkouts: PlannedWorkoutWithDetails[];
  loading: boolean;
  error: string | null;

  // Progress
  progress: PlanProgress | null;
  currentWeek: number;
  currentPhase: TrainingPhase | null;
  compliancePercent: number;

  // Operations
  loadActivePlan: () => Promise<void>;
  activatePlan: (templateId: string, startDate: Date) => Promise<ActivePlan | null>;
  pausePlan: () => Promise<boolean>;
  resumePlan: () => Promise<boolean>;
  completePlan: () => Promise<boolean>;
  cancelPlan: () => Promise<boolean>;

  // Workout operations
  loadPlannedWorkouts: (weekNumbers?: number[]) => Promise<void>;
  toggleWorkoutCompletion: (workoutId: string, completed: boolean) => Promise<boolean>;
  linkActivityToWorkout: (workoutId: string, activityId: string) => Promise<boolean>;
  getWorkoutsForDate: (date: Date) => PlannedWorkoutWithDetails[];
  getWorkoutsForWeek: (weekNumber: number) => PlannedWorkoutWithDetails[];

  // Supplement workout operations
  addSupplementWorkout: (workoutId: string, scheduledDate: Date, notes?: string) => Promise<boolean>;
  getSuggestedSupplementDays: (workoutId: string, weeksAhead?: number) => SuggestedPlacement[];
  getAvailableSupplementWorkouts: () => string[];

  // Utilities
  refreshPlan: () => Promise<void>;
  getPlanStartDate: () => Date | null;
  getDaysRemaining: () => number;
}

export function useTrainingPlan({
  userId,
  autoLoad = true,
}: UseTrainingPlanOptions): UseTrainingPlanReturn {
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // LOAD ACTIVE PLAN
  // ============================================================
  const loadActivePlan = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine
        throw fetchError;
      }

      if (data) {
        // Attach template if available
        const template = data.template_id ? getPlanTemplate(data.template_id) : undefined;
        setActivePlan({ ...data, template });
      } else {
        setActivePlan(null);
      }
    } catch (err: any) {
      console.error('Error loading active plan:', err);
      setError(err.message || 'Failed to load training plan');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // LOAD PLANNED WORKOUTS
  // ============================================================
  const loadPlannedWorkouts = useCallback(
    async (weekNumbers?: number[]) => {
      if (!activePlan) {
        setPlannedWorkouts([]);
        return;
      }

      try {
        let query = supabase
          .from('planned_workouts')
          .select('*')
          .eq('plan_id', activePlan.id)
          .order('scheduled_date', { ascending: true });

        if (weekNumbers && weekNumbers.length > 0) {
          query = query.in('week_number', weekNumbers);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        // Enrich with workout details
        const enrichedWorkouts: PlannedWorkoutWithDetails[] = (data || []).map((workout) => ({
          ...workout,
          workout: workout.workout_id ? getWorkoutById(workout.workout_id) || undefined : undefined,
        }));

        setPlannedWorkouts(enrichedWorkouts);
      } catch (err: any) {
        console.error('Error loading planned workouts:', err);
        setError(err.message || 'Failed to load planned workouts');
      }
    },
    [activePlan]
  );

  // ============================================================
  // ACTIVATE PLAN
  // ============================================================
  const activatePlan = useCallback(
    async (templateId: string, startDate: Date): Promise<ActivePlan | null> => {
      if (!userId) return null;

      const template = getPlanTemplate(templateId);
      if (!template) {
        setError('Training plan template not found');
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        // Mark any existing active plan as completed
        await supabase
          .from('training_plans')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');

        // Calculate total workouts
        let totalWorkouts = 0;
        for (const weekNum of Object.keys(template.weekTemplates)) {
          const week = template.weekTemplates[Number(weekNum)];
          for (const day of Object.values(week)) {
            if (day.workout) totalWorkouts++;
          }
        }

        // Create new plan
        const planInsert: TrainingPlanInsert = {
          user_id: userId,
          template_id: templateId,
          name: template.name,
          duration_weeks: template.duration,
          methodology: template.methodology,
          goal: template.goal,
          fitness_level: template.fitnessLevel,
          status: 'active',
          started_at: startDate.toISOString(),
          current_week: 1,
          workouts_completed: 0,
          workouts_total: totalWorkouts,
          compliance_percentage: 0,
          auto_adjust_enabled: false,
        };

        const { data: newPlan, error: planError } = await supabase
          .from('training_plans')
          .insert(planInsert)
          .select()
          .single();

        if (planError) throw planError;

        // Generate planned workouts
        const workoutsToInsert: PlannedWorkoutInsert[] = [];

        for (let weekNum = 1; weekNum <= template.duration; weekNum++) {
          const weekTemplate = template.weekTemplates[weekNum];
          if (!weekTemplate) continue;

          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayName = DAY_MAP[dayIndex];
            const dayPlan = weekTemplate[dayName];

            // Calculate the scheduled date
            const scheduledDate = new Date(startDate);
            scheduledDate.setDate(scheduledDate.getDate() + (weekNum - 1) * 7 + dayIndex);

            // Get workout details if specified
            const workout = dayPlan.workout ? getWorkoutById(dayPlan.workout) : null;

            workoutsToInsert.push({
              plan_id: newPlan.id,
              week_number: weekNum,
              day_of_week: dayIndex,
              scheduled_date: scheduledDate.toISOString().split('T')[0],
              workout_type: workout?.category || (dayPlan.workout ? null : 'rest'),
              workout_id: dayPlan.workout || null,
              target_tss: workout?.targetTSS || null,
              target_duration: workout?.duration || null,
              completed: false,
              notes: dayPlan.notes || null,
            });
          }
        }

        // Insert all workouts
        const { error: workoutsError } = await supabase
          .from('planned_workouts')
          .insert(workoutsToInsert);

        if (workoutsError) throw workoutsError;

        // Set the active plan with template
        const activePlanWithTemplate: ActivePlan = {
          ...newPlan,
          template,
        };

        setActivePlan(activePlanWithTemplate);
        return activePlanWithTemplate;
      } catch (err: any) {
        console.error('Error activating plan:', err);
        setError(err.message || 'Failed to activate training plan');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  // ============================================================
  // PAUSE PLAN
  // ============================================================
  const pausePlan = useCallback(async (): Promise<boolean> => {
    if (!activePlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
        })
        .eq('id', activePlan.id);

      if (updateError) throw updateError;

      setActivePlan((prev) => (prev ? { ...prev, status: 'paused' } : null));
      return true;
    } catch (err: any) {
      console.error('Error pausing plan:', err);
      setError(err.message || 'Failed to pause plan');
      return false;
    }
  }, [activePlan]);

  // ============================================================
  // RESUME PLAN
  // ============================================================
  const resumePlan = useCallback(async (): Promise<boolean> => {
    if (!activePlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'active',
          paused_at: null,
        })
        .eq('id', activePlan.id);

      if (updateError) throw updateError;

      setActivePlan((prev) => (prev ? { ...prev, status: 'active', paused_at: null } : null));
      return true;
    } catch (err: any) {
      console.error('Error resuming plan:', err);
      setError(err.message || 'Failed to resume plan');
      return false;
    }
  }, [activePlan]);

  // ============================================================
  // COMPLETE PLAN
  // ============================================================
  const completePlan = useCallback(async (): Promise<boolean> => {
    if (!activePlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', activePlan.id);

      if (updateError) throw updateError;

      setActivePlan(null);
      setPlannedWorkouts([]);
      return true;
    } catch (err: any) {
      console.error('Error completing plan:', err);
      setError(err.message || 'Failed to complete plan');
      return false;
    }
  }, [activePlan]);

  // ============================================================
  // CANCEL PLAN
  // ============================================================
  const cancelPlan = useCallback(async (): Promise<boolean> => {
    if (!activePlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'cancelled',
          ended_at: new Date().toISOString(),
        })
        .eq('id', activePlan.id);

      if (updateError) throw updateError;

      setActivePlan(null);
      setPlannedWorkouts([]);
      return true;
    } catch (err: any) {
      console.error('Error cancelling plan:', err);
      setError(err.message || 'Failed to cancel plan');
      return false;
    }
  }, [activePlan]);

  // ============================================================
  // TOGGLE WORKOUT COMPLETION
  // ============================================================
  const toggleWorkoutCompletion = useCallback(
    async (workoutId: string, completed: boolean): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('planned_workouts')
          .update({
            completed,
            completed_at: completed ? new Date().toISOString() : null,
          })
          .eq('id', workoutId);

        if (updateError) throw updateError;

        // Update local state
        setPlannedWorkouts((prev) =>
          prev.map((w) =>
            w.id === workoutId
              ? { ...w, completed, completed_at: completed ? new Date().toISOString() : null }
              : w
          )
        );

        // Refresh plan to get updated compliance
        await loadActivePlan();

        return true;
      } catch (err: any) {
        console.error('Error toggling workout completion:', err);
        setError(err.message || 'Failed to update workout');
        return false;
      }
    },
    [loadActivePlan]
  );

  // ============================================================
  // LINK ACTIVITY TO WORKOUT
  // ============================================================
  const linkActivityToWorkout = useCallback(
    async (workoutId: string, activityId: string): Promise<boolean> => {
      try {
        // Get activity details
        const { data: activity, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('id', activityId)
          .single();

        if (activityError) throw activityError;

        // Update workout with activity data
        const { error: updateError } = await supabase
          .from('planned_workouts')
          .update({
            activity_id: activityId,
            completed: true,
            completed_at: activity.start_date,
            actual_tss: activity.tss,
            actual_duration: Math.round(activity.duration_seconds / 60),
            actual_distance_km: activity.distance_meters ? activity.distance_meters / 1000 : null,
          })
          .eq('id', workoutId);

        if (updateError) throw updateError;

        // Refresh workouts and plan
        await loadPlannedWorkouts();
        await loadActivePlan();

        return true;
      } catch (err: any) {
        console.error('Error linking activity:', err);
        setError(err.message || 'Failed to link activity');
        return false;
      }
    },
    [loadPlannedWorkouts, loadActivePlan]
  );

  // ============================================================
  // GET WORKOUTS FOR DATE
  // ============================================================
  const getWorkoutsForDate = useCallback(
    (date: Date): PlannedWorkoutWithDetails[] => {
      const dateStr = date.toISOString().split('T')[0];
      return plannedWorkouts.filter((w) => w.scheduled_date === dateStr);
    },
    [plannedWorkouts]
  );

  // ============================================================
  // GET WORKOUTS FOR WEEK
  // ============================================================
  const getWorkoutsForWeek = useCallback(
    (weekNumber: number): PlannedWorkoutWithDetails[] => {
      return plannedWorkouts.filter((w) => w.week_number === weekNumber);
    },
    [plannedWorkouts]
  );

  // ============================================================
  // SUPPLEMENT WORKOUT OPERATIONS
  // ============================================================

  /**
   * Add a supplement workout (strength, core, flexibility) to the active plan
   */
  const addSupplementWorkout = useCallback(
    async (workoutId: string, scheduledDate: Date, notes?: string): Promise<boolean> => {
      if (!activePlan) {
        setError('No active plan to add supplement workout to');
        return false;
      }

      const workout = getWorkoutById(workoutId);
      if (!workout) {
        setError('Supplement workout not found');
        return false;
      }

      try {
        // Calculate week number based on plan start date
        const startDate = new Date(activePlan.started_at);
        const diffTime = scheduledDate.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNumber = Math.floor(diffDays / 7) + 1;
        const dayOfWeek = scheduledDate.getDay(); // 0-6 (Sunday = 0)

        // Check if date is within plan duration
        if (weekNumber < 1 || weekNumber > activePlan.duration_weeks) {
          setError('Selected date is outside the plan duration');
          return false;
        }

        // Insert the supplement workout
        const workoutInsert: PlannedWorkoutInsert = {
          plan_id: activePlan.id,
          week_number: weekNumber,
          day_of_week: dayOfWeek,
          scheduled_date: scheduledDate.toISOString().split('T')[0],
          workout_type: workout.category,
          workout_id: workoutId,
          target_tss: workout.targetTSS || 0,
          target_duration: workout.duration,
          completed: false,
          notes: notes || `Supplement: ${workout.name}`,
        };

        const { error: insertError } = await supabase
          .from('planned_workouts')
          .insert(workoutInsert);

        if (insertError) throw insertError;

        // Update workout total in the plan
        const { error: updateError } = await supabase
          .from('training_plans')
          .update({
            workouts_total: (activePlan.workouts_total || 0) + 1,
          })
          .eq('id', activePlan.id);

        if (updateError) {
          console.warn('Failed to update workout count:', updateError);
        }

        // Refresh workouts and plan
        await loadPlannedWorkouts();
        await loadActivePlan();

        return true;
      } catch (err: any) {
        console.error('Error adding supplement workout:', err);
        setError(err.message || 'Failed to add supplement workout');
        return false;
      }
    },
    [activePlan, loadPlannedWorkouts, loadActivePlan]
  );

  /**
   * Get suggested days for placing a supplement workout
   * Uses smart placement logic to avoid conflicts with hard bike days
   */
  const getSuggestedSupplementDays = useCallback(
    (workoutId: string, weeksAhead: number = 4): SuggestedPlacement[] => {
      if (!activePlan) return [];

      // Convert planned workouts to the format expected by findOptimalSupplementDays
      const workoutInfos: PlannedWorkoutInfo[] = plannedWorkouts.map((w) => ({
        date: w.scheduled_date,
        workoutType: w.workout_type,
        workoutId: w.workout_id,
      }));

      const today = new Date();
      return findOptimalSupplementDays(workoutId, workoutInfos, today, weeksAhead);
    },
    [activePlan, plannedWorkouts]
  );

  /**
   * Get list of available supplement workout IDs
   */
  const getAvailableSupplementWorkouts = useCallback((): string[] => {
    return getSupplementWorkouts();
  }, []);

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  const getPlanStartDate = useCallback((): Date | null => {
    if (!activePlan?.started_at) return null;
    return new Date(activePlan.started_at);
  }, [activePlan]);

  const getDaysRemaining = useCallback((): number => {
    if (!activePlan?.started_at || !activePlan?.duration_weeks) return 0;

    const startDate = new Date(activePlan.started_at);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + activePlan.duration_weeks * 7);

    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }, [activePlan]);

  const refreshPlan = useCallback(async () => {
    await loadActivePlan();
    await loadPlannedWorkouts();
  }, [loadActivePlan, loadPlannedWorkouts]);

  // ============================================================
  // CALCULATED VALUES
  // ============================================================
  const currentWeek = useMemo((): number => {
    if (!activePlan?.started_at) return 1;

    const startDate = new Date(activePlan.started_at);
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7) + 1;

    return Math.max(1, Math.min(weekNum, activePlan.duration_weeks || 1));
  }, [activePlan]);

  const currentPhase = useMemo((): TrainingPhase | null => {
    if (!activePlan?.template) return null;

    const template = activePlan.template;
    for (const phase of template.phases) {
      if (phase.weeks.includes(currentWeek)) {
        return phase.phase;
      }
    }

    return 'base';
  }, [activePlan, currentWeek]);

  const compliancePercent = useMemo((): number => {
    return activePlan?.compliance_percentage || 0;
  }, [activePlan]);

  const progress = useMemo((): PlanProgress | null => {
    if (!activePlan) return null;

    // Calculate weekly stats
    const weeklyStats: WeeklyStats[] = [];
    for (let week = 1; week <= (activePlan.duration_weeks || 1); week++) {
      const weekWorkouts = plannedWorkouts.filter((w) => w.week_number === week);
      const completed = weekWorkouts.filter((w) => w.completed);

      weeklyStats.push({
        weekNumber: week,
        plannedTSS: weekWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0),
        actualTSS: completed.reduce((sum, w) => sum + (w.actual_tss || w.target_tss || 0), 0),
        plannedDuration: weekWorkouts.reduce((sum, w) => sum + (w.target_duration || 0), 0),
        actualDuration: completed.reduce((sum, w) => sum + (w.actual_duration || w.target_duration || 0), 0),
        workoutsPlanned: weekWorkouts.filter((w) => w.workout_id).length,
        workoutsCompleted: completed.length,
        compliancePercent:
          weekWorkouts.length > 0
            ? Math.round((completed.length / weekWorkouts.filter((w) => w.workout_id).length) * 100)
            : 100,
      });
    }

    // Find next workout
    const today = new Date().toISOString().split('T')[0];
    const upcomingWorkouts = plannedWorkouts
      .filter((w) => w.scheduled_date >= today && !w.completed && w.workout_id)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

    return {
      currentWeek,
      totalWeeks: activePlan.duration_weeks || 0,
      currentPhase: currentPhase || 'base',
      overallCompliance: compliancePercent,
      weeklyStats,
      daysRemaining: getDaysRemaining(),
      nextWorkout: upcomingWorkouts[0] || null,
    };
  }, [activePlan, plannedWorkouts, currentWeek, currentPhase, compliancePercent, getDaysRemaining]);

  // ============================================================
  // AUTO-LOAD ON MOUNT
  // ============================================================
  useEffect(() => {
    if (autoLoad && userId) {
      loadActivePlan();
    }
  }, [autoLoad, userId, loadActivePlan]);

  // Load workouts when plan changes
  useEffect(() => {
    if (activePlan) {
      loadPlannedWorkouts();
    }
  }, [activePlan?.id, loadPlannedWorkouts]);

  return {
    // State
    activePlan,
    plannedWorkouts,
    loading,
    error,

    // Progress
    progress,
    currentWeek,
    currentPhase,
    compliancePercent,

    // Operations
    loadActivePlan,
    activatePlan,
    pausePlan,
    resumePlan,
    completePlan,
    cancelPlan,

    // Workout operations
    loadPlannedWorkouts,
    toggleWorkoutCompletion,
    linkActivityToWorkout,
    getWorkoutsForDate,
    getWorkoutsForWeek,

    // Supplement workout operations
    addSupplementWorkout,
    getSuggestedSupplementDays,
    getAvailableSupplementWorkouts,

    // Utilities
    refreshPlan,
    getPlanStartDate,
    getDaysRemaining,
  };
}

export default useTrainingPlan;
