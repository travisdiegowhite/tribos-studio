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
  redistributeWorkouts,
  reshuffleActivePlan as reshuffleActivePlanUtil,
  type PlannedWorkoutInfo,
  type SuggestedPlacement,
  type WorkoutForRedistribution,
} from '../utils/trainingPlans';
import {
  triggerAdaptationDetection,
  fetchTrainingContext,
} from '../utils/adaptationTrigger';
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
  PlanPriority,
  DayOfWeek,
  DayAvailability,
  WorkoutRedistributionResult,
  SportType,
} from '../types/training';
import type { PlannedWorkoutInsert, TrainingPlanInsert } from '../types/database';
import { compressPlan, type CompressionOptions } from '../utils/planCompression';
import { formatLocalDate, getTodayString } from '../utils/dateUtils';
import { fetchPlannedSessions, fetchSessionOn } from '../lib/calendar/readPlannedSessions';
import {
  insertSessions, createEntry, moveEntry, updateEntry, deleteEntry,
  setEntryStatus, linkEntryToActivity,
} from '../lib/calendar/calendarMutations';
import type { EntryDraft } from '../lib/calendar/calendarMutations';

// Day mapping for workout generation
const DAY_MAP: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface UseTrainingPlanOptions {
  userId: string | null;
  autoLoad?: boolean;
}

/**
 * Options for activating a plan with availability awareness
 */
interface ActivatePlanWithAvailabilityOptions {
  templateId: string;
  startDate: Date;
  weeklyAvailability: DayAvailability[];
  dateOverrides?: Map<string, { status: 'available' | 'blocked' | 'preferred' }>;
  preferences?: {
    maxWorkoutsPerWeek: number | null;
    preferWeekendLongRides: boolean;
  };
}

/**
 * Options for activating a plan with target date compression
 */
interface ActivatePlanOptions {
  templateId: string;
  startDate: Date;
  /** If set, plan will be compressed to fit this target event date */
  targetDate?: Date;
  /** Override priority (defaults to 'primary' if no other active plan, 'secondary' otherwise) */
  priority?: PlanPriority;
}

interface UseTrainingPlanReturn {
  // State — multi-plan aware
  activePlan: ActivePlan | null; // Currently selected plan (backward compat)
  activePlans: ActivePlan[]; // All active plans
  selectedPlanId: string | null; // ID of the currently selected plan
  primaryPlan: ActivePlan | null; // The primary plan (if any)
  plannedWorkouts: PlannedWorkoutWithDetails[];
  loading: boolean;
  error: string | null;

  // Progress (for selected plan)
  progress: PlanProgress | null;
  currentWeek: number;
  currentPhase: TrainingPhase | null;
  compliancePercent: number;

  // Operations
  loadActivePlan: () => Promise<void>;
  selectPlan: (planId: string | null) => void;
  setPlanPriority: (planId: string, priority: PlanPriority) => Promise<boolean>;
  activatePlan: (templateIdOrOptions: string | ActivatePlanOptions, startDate?: Date) => Promise<ActivePlan | null>;
  activatePlanWithAvailability: (options: ActivatePlanWithAvailabilityOptions) => Promise<{
    plan: ActivePlan | null;
    redistributions: WorkoutRedistributionResult[];
  }>;
  pausePlan: (planId?: string) => Promise<boolean>;
  resumePlan: (planId?: string) => Promise<boolean>;
  completePlan: (planId?: string) => Promise<boolean>;
  cancelPlan: (planId?: string) => Promise<boolean>;
  reshufflePlan: (options: {
    weeklyAvailability: DayAvailability[];
    dateOverrides?: Map<string, { status: 'available' | 'blocked' | 'preferred' }>;
    preferences?: { maxWorkoutsPerWeek: number | null; preferWeekendLongRides: boolean };
  }) => Promise<{ success: boolean; redistributions: WorkoutRedistributionResult[] }>;

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
  const [activePlans, setActivePlans] = useState<ActivePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutWithDetails[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  // Derived: currently selected plan (backward compatible with single-plan consumers)
  const activePlan = useMemo((): ActivePlan | null => {
    if (selectedPlanId) {
      return activePlans.find(p => p.id === selectedPlanId) || activePlans[0] || null;
    }
    // Default: select the primary plan, or the first plan
    return activePlans.find(p => p.priority === 'primary') || activePlans[0] || null;
  }, [activePlans, selectedPlanId]);

  // Derived: primary plan
  const primaryPlan = useMemo((): ActivePlan | null => {
    return activePlans.find(p => p.priority === 'primary') || null;
  }, [activePlans]);

  // Select a specific plan to view/manage
  const selectPlan = useCallback((planId: string | null) => {
    setSelectedPlanId(planId);
  }, []);

  // ============================================================
  // SET PLAN PRIORITY
  // ============================================================
  const setPlanPriority = useCallback(async (planId: string, priority: PlanPriority): Promise<boolean> => {
    if (!userId) return false;

    try {
      // If setting to primary, demote any existing primary plan of the same sport type
      if (priority === 'primary') {
        const targetPlan = activePlans.find(p => p.id === planId);
        if (targetPlan) {
          const existingPrimary = activePlans.find(
            p => p.id !== planId && p.priority === 'primary' && p.sport_type === targetPlan.sport_type
          );
          if (existingPrimary) {
            await supabase
              .from('training_plans')
              .update({ priority: 'secondary' })
              .eq('id', existingPrimary.id);
          }
        }
      }

      const { error: updateError } = await supabase
        .from('training_plans')
        .update({ priority })
        .eq('id', planId);

      if (updateError) throw updateError;

      // Update local state
      setActivePlans(prev => prev.map(p => {
        if (p.id === planId) return { ...p, priority };
        // Demote same sport type if we promoted this one
        const targetPlan = prev.find(plan => plan.id === planId);
        if (priority === 'primary' && p.priority === 'primary' && p.sport_type === targetPlan?.sport_type) {
          return { ...p, priority: 'secondary' as PlanPriority };
        }
        return p;
      }));

      return true;
    } catch (err: any) {
      console.error('Error setting plan priority:', err);
      setError(err.message || 'Failed to set plan priority');
      return false;
    }
  }, [userId, activePlans]);

  // ============================================================
  // LOAD ACTIVE PLANS (supports multiple)
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
        .order('priority', { ascending: true }) // 'primary' sorts before 'secondary'
        .order('started_at', { ascending: false });

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        const plans: ActivePlan[] = data.map(plan => {
          const template = plan.template_id ? getPlanTemplate(plan.template_id) : undefined;
          return { ...plan, template };
        });
        setActivePlans(plans);

        // Auto-select primary plan if nothing is selected
        if (!selectedPlanId || !plans.find(p => p.id === selectedPlanId)) {
          const primary = plans.find(p => p.priority === 'primary');
          setSelectedPlanId(primary?.id || plans[0].id);
        }
      } else {
        setActivePlans([]);
        setSelectedPlanId(null);
      }
    } catch (err: any) {
      console.error('Error loading active plans:', err);
      setError(err.message || 'Failed to load training plans');
    } finally {
      setLoading(false);
    }
  }, [userId, selectedPlanId]);

  // ============================================================
  // LOAD PLANNED WORKOUTS
  // ============================================================
  const loadPlannedWorkouts = useCallback(
    async (weekNumbers?: number[]) => {
      if (!userId) {
        setPlannedWorkouts([]);
        return;
      }

      try {
        // ATHLETE-scoped, not plan-scoped. The old query filtered on
        // `plan_id = activePlan.id`, so an entry the coach or the calendar
        // created — which carries no plan_id — was invisible to every consumer
        // of this hook, and an athlete with no active plan got an empty list
        // even with a full week scheduled.
        //
        // `week_number` is derived from the plan's start date by the adapter,
        // so the optional weekNumbers filter is applied here rather than in SQL.
        const rows = await fetchPlannedSessions(userId, {
          planStart: activePlan?.started_at ?? null,
        });
        const scoped =
          weekNumbers && weekNumbers.length > 0
            ? rows.filter((r) => r.week_number != null && weekNumbers.includes(r.week_number))
            : rows;

        // Enrich with workout details
        const enrichedWorkouts = scoped.map((workout) => ({
          ...workout,
          workout: workout.workout_id ? getWorkoutById(workout.workout_id) || undefined : undefined,
        })) as unknown as PlannedWorkoutWithDetails[];

        setPlannedWorkouts(enrichedWorkouts);
      } catch (err: any) {
        console.error('Error loading planned workouts:', err);
        setError(err.message || 'Failed to load planned workouts');
      }
    },
    [activePlan, userId]
  );

  // ============================================================
  // ACTIVATE PLAN (multi-plan aware, with optional compression)
  // ============================================================
  const activatePlan = useCallback(
    async (templateIdOrOptions: string | ActivatePlanOptions, startDateArg?: Date): Promise<ActivePlan | null> => {
      if (!userId) return null;

      // Support both old signature (templateId, startDate) and new options object
      const options: ActivatePlanOptions = typeof templateIdOrOptions === 'string'
        ? { templateId: templateIdOrOptions, startDate: startDateArg! }
        : templateIdOrOptions;

      const { templateId, startDate, targetDate, priority: requestedPriority } = options;

      let template = getPlanTemplate(templateId);
      if (!template) {
        setError('Training plan template not found');
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        // Apply plan compression if target date is set and plan is too long
        let compressedFrom: number | null = null;
        if (targetDate) {
          const compressionResult = compressPlan(template, {
            targetDate,
            startDate,
            fitnessLevel: template.fitnessLevel,
          });
          if (compressionResult.wasCompressed) {
            template = compressionResult.template;
            compressedFrom = compressionResult.originalDuration;
          }
        }

        // Determine priority: use requested, or auto-detect
        let priority: PlanPriority = requestedPriority || 'primary';
        if (!requestedPriority) {
          // Check if there's already a primary plan of the same sport type
          const existingPrimary = activePlans.find(
            p => p.priority === 'primary' && p.sport_type === (template!.sportType || 'cycling')
          );
          if (existingPrimary) {
            priority = 'secondary';
          }
        }

        // Calculate total workouts
        let totalWorkouts = 0;
        for (const weekNum of Object.keys(template.weekTemplates)) {
          const week = template.weekTemplates[Number(weekNum)];
          for (const day of Object.values(week)) {
            if (day.workout) totalWorkouts++;
          }
        }

        // Create new plan (no longer auto-completing existing plans)
        const planInsert = {
          user_id: userId,
          template_id: templateId,
          name: template.name,
          sport_type: template.sportType || 'cycling',
          duration_weeks: template.duration,
          methodology: template.methodology,
          goal: template.goal,
          fitness_level: template.fitnessLevel,
          status: 'active',
          priority,
          target_event_date: targetDate ? formatLocalDate(targetDate) : null,
          start_date: startDate.toISOString(),
          current_week: 1,
          workouts_completed: 0,
          workouts_total: totalWorkouts,
          compliance_percentage: 0,
        };

        const { data: newPlan, error: planError } = await supabase
          .from('training_plans')
          .insert(planInsert)
          .select()
          .single();

        if (planError) throw planError;

        // Generate planned workouts
        const workoutsToInsert: Array<EntryDraft & { date: string }> = [];

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
              date: formatLocalDate(scheduledDate),
              type: dayPlan.workout ? 'workout' : 'rest',
              title: workout?.name || dayPlan.workout || 'Workout',
              workout_id: dayPlan.workout || null,
              workout_type: workout?.category || (dayPlan.workout ? null : 'rest'),
              target_load: workout?.targetTSS ?? null,
              target_duration_min: workout?.duration ?? null,
            });
          }
        }

        // Write the template onto the CALENDAR. Days the athlete has already
        // filled are skipped rather than overwritten, so activating a plan can
        // never bury a race or a session they scheduled themselves. The plan id
        // rides along as provenance; nothing reads an entry through it.
        const written = await insertSessions(userId, workoutsToInsert, {
          source: 'plan',
          planId: newPlan.id,
        });
        if (!written.success) throw new Error(written.error);

        // Set the active plan with template
        const activePlanWithTemplate: ActivePlan = {
          ...newPlan,
          template,
        };

        // Add to active plans list (don't replace)
        setActivePlans(prev => [...prev, activePlanWithTemplate]);
        setSelectedPlanId(newPlan.id);

        // Track activation step for first plan
        try {
          const { data: activation } = await supabase
            .from('user_activation')
            .select('steps')
            .eq('user_id', userId)
            .single();

          if (activation && !activation.steps?.first_plan?.completed) {
            const steps = { ...activation.steps };
            steps.first_plan = { completed: true, completed_at: new Date().toISOString() };
            await supabase
              .from('user_activation')
              .update({ steps, updated_at: new Date().toISOString() })
              .eq('user_id', userId);
          }
        } catch {
          // Non-critical - don't break plan activation
        }

        return activePlanWithTemplate;
      } catch (err: any) {
        console.error('Error activating plan:', err);
        setError(err.message || 'Failed to activate training plan');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userId, activePlans]
  );

  // ============================================================
  // ACTIVATE PLAN WITH AVAILABILITY
  // ============================================================
  const activatePlanWithAvailability = useCallback(
    async (options: ActivatePlanWithAvailabilityOptions): Promise<{
      plan: ActivePlan | null;
      redistributions: WorkoutRedistributionResult[];
    }> => {
      const {
        templateId,
        startDate,
        weeklyAvailability,
        dateOverrides = new Map(),
        preferences = { maxWorkoutsPerWeek: null, preferWeekendLongRides: true },
      } = options;

      if (!userId) return { plan: null, redistributions: [] };

      const template = getPlanTemplate(templateId);
      if (!template) {
        setError('Training plan template not found');
        return { plan: null, redistributions: [] };
      }

      try {
        setLoading(true);
        setError(null);

        // Determine priority for the new plan
        const existingPrimary = activePlans.find(
          p => p.priority === 'primary' && p.sport_type === (template!.sportType || 'cycling')
        );
        const priority: PlanPriority = existingPrimary ? 'secondary' : 'primary';

        // Generate initial workout schedule
        const initialWorkouts: WorkoutForRedistribution[] = [];

        for (let weekNum = 1; weekNum <= template.duration; weekNum++) {
          const weekTemplate = template.weekTemplates[weekNum];
          if (!weekTemplate) continue;

          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayName = DAY_MAP[dayIndex];
            const dayPlan = weekTemplate[dayName];

            // Calculate the scheduled date
            const scheduledDate = new Date(startDate);
            scheduledDate.setDate(scheduledDate.getDate() + (weekNum - 1) * 7 + dayIndex);

            const workout = dayPlan.workout ? getWorkoutById(dayPlan.workout) : null;

            initialWorkouts.push({
              originalDate: formatLocalDate(scheduledDate),
              dayOfWeek: dayIndex,
              weekNumber: weekNum,
              workoutId: dayPlan.workout || null,
              workoutType: workout?.category || (dayPlan.workout ? null : 'rest'),
              targetTSS: workout?.targetTSS || null,
              targetDuration: workout?.duration || null,
            });
          }
        }

        // Redistribute workouts based on availability
        const redistributions = redistributeWorkouts(
          initialWorkouts,
          weeklyAvailability,
          dateOverrides,
          preferences
        );

        // Create a map of redistributions for quick lookup
        const redistributionMap = new Map<string, string>();
        for (const r of redistributions) {
          if (r.originalDate !== r.newDate) {
            redistributionMap.set(r.originalDate, r.newDate);
          }
        }

        // Calculate total workouts
        let totalWorkouts = 0;
        for (const w of initialWorkouts) {
          if (w.workoutId) totalWorkouts++;
        }

        // Create new plan (multi-plan aware — no longer auto-completing existing plans)
        const planInsert = {
          user_id: userId,
          template_id: templateId,
          name: template.name,
          sport_type: template.sportType || 'cycling',
          duration_weeks: template.duration,
          methodology: template.methodology,
          goal: template.goal,
          fitness_level: template.fitnessLevel,
          status: 'active',
          priority,
          start_date: startDate.toISOString(),
          current_week: 1,
          workouts_completed: 0,
          workouts_total: totalWorkouts,
          compliance_percentage: 0,
        };

        const { data: newPlan, error: planError } = await supabase
          .from('training_plans')
          .insert(planInsert)
          .select()
          .single();

        if (planError) throw planError;

        // Generate planned workouts with redistributed dates
        const workoutsToInsert: Array<EntryDraft & { date: string }> = [];

        for (const w of initialWorkouts) {
          // Check if this workout was redistributed
          const newDate = redistributionMap.get(w.originalDate) || w.originalDate;
          workoutsToInsert.push({
            date: newDate,
            type: w.workoutType === 'rest' ? 'rest' : 'workout',
            title: w.workoutId || 'Workout',
            workout_id: w.workoutId,
            workout_type: w.workoutType,
            target_load: w.targetTSS,
            target_duration_min: w.targetDuration,
          });
        }

        // Write the template onto the CALENDAR. Days the athlete has already
        // filled are skipped rather than overwritten, so activating a plan can
        // never bury a race or a session they scheduled themselves. The plan id
        // rides along as provenance; nothing reads an entry through it.
        const written = await insertSessions(userId, workoutsToInsert, {
          source: 'plan',
          planId: newPlan.id,
        });
        if (!written.success) throw new Error(written.error);

        // Set the active plan with template
        const activePlanWithTemplate: ActivePlan = {
          ...newPlan,
          template,
        };

        // Add to active plans list (don't replace)
        setActivePlans(prev => [...prev, activePlanWithTemplate]);
        setSelectedPlanId(newPlan.id);
        return {
          plan: activePlanWithTemplate,
          redistributions: redistributions.filter((r) => r.originalDate !== r.newDate),
        };
      } catch (err: any) {
        console.error('Error activating plan with availability:', err);
        setError(err.message || 'Failed to activate training plan');
        return { plan: null, redistributions: [] };
      } finally {
        setLoading(false);
      }
    },
    [userId, activePlans]
  );

  // ============================================================
  // PAUSE PLAN
  // ============================================================
  const pausePlan = useCallback(async (planId?: string): Promise<boolean> => {
    const targetPlan = planId ? activePlans.find(p => p.id === planId) : activePlan;
    if (!targetPlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
        })
        .eq('id', targetPlan.id);

      if (updateError) throw updateError;

      setActivePlans(prev => prev.map(p =>
        p.id === targetPlan.id ? { ...p, status: 'paused' as PlanStatus } : p
      ));
      return true;
    } catch (err: any) {
      console.error('Error pausing plan:', err);
      setError(err.message || 'Failed to pause plan');
      return false;
    }
  }, [activePlan, activePlans]);

  // ============================================================
  // RESUME PLAN
  // ============================================================
  const resumePlan = useCallback(async (planId?: string): Promise<boolean> => {
    const targetPlan = planId ? activePlans.find(p => p.id === planId) : activePlan;
    if (!targetPlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'active',
          paused_at: null,
        })
        .eq('id', targetPlan.id);

      if (updateError) throw updateError;

      setActivePlans(prev => prev.map(p =>
        p.id === targetPlan.id ? { ...p, status: 'active' as PlanStatus, paused_at: null } : p
      ));
      return true;
    } catch (err: any) {
      console.error('Error resuming plan:', err);
      setError(err.message || 'Failed to resume plan');
      return false;
    }
  }, [activePlan, activePlans]);

  // ============================================================
  // COMPLETE PLAN
  // ============================================================
  const completePlan = useCallback(async (planId?: string): Promise<boolean> => {
    const targetPlan = planId ? activePlans.find(p => p.id === planId) : activePlan;
    if (!targetPlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', targetPlan.id);

      if (updateError) throw updateError;

      setActivePlans(prev => prev.filter(p => p.id !== targetPlan.id));
      // If we just completed the selected plan, auto-select another
      if (selectedPlanId === targetPlan.id) {
        const remaining = activePlans.filter(p => p.id !== targetPlan.id);
        setSelectedPlanId(remaining[0]?.id || null);
      }
      if (activePlans.length <= 1) {
        setPlannedWorkouts([]);
      }
      return true;
    } catch (err: any) {
      console.error('Error completing plan:', err);
      setError(err.message || 'Failed to complete plan');
      return false;
    }
  }, [activePlan, activePlans, selectedPlanId]);

  // ============================================================
  // CANCEL PLAN
  // ============================================================
  const cancelPlan = useCallback(async (planId?: string): Promise<boolean> => {
    const targetPlan = planId ? activePlans.find(p => p.id === planId) : activePlan;
    if (!targetPlan) return false;

    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          status: 'cancelled',
          ended_at: new Date().toISOString(),
        })
        .eq('id', targetPlan.id);

      if (updateError) throw updateError;

      setActivePlans(prev => prev.filter(p => p.id !== targetPlan.id));
      if (selectedPlanId === targetPlan.id) {
        const remaining = activePlans.filter(p => p.id !== targetPlan.id);
        setSelectedPlanId(remaining[0]?.id || null);
      }
      if (activePlans.length <= 1) {
        setPlannedWorkouts([]);
      }
      return true;
    } catch (err: any) {
      console.error('Error cancelling plan:', err);
      setError(err.message || 'Failed to cancel plan');
      return false;
    }
  }, [activePlan, activePlans, selectedPlanId]);

  // ============================================================
  // RESHUFFLE PLAN (when availability changes)
  // ============================================================
  const reshufflePlan = useCallback(
    async (options: {
      weeklyAvailability: DayAvailability[];
      dateOverrides?: Map<string, { status: 'available' | 'blocked' | 'preferred' }>;
      preferences?: { maxWorkoutsPerWeek: number | null; preferWeekendLongRides: boolean };
    }): Promise<{ success: boolean; redistributions: WorkoutRedistributionResult[] }> => {
      if (!activePlan) {
        return { success: false, redistributions: [] };
      }

      const {
        weeklyAvailability,
        dateOverrides = new Map(),
        preferences = { maxWorkoutsPerWeek: null, preferWeekendLongRides: true },
      } = options;

      try {
        setLoading(true);
        setError(null);

        // Convert planned workouts to redistribution format
        const workoutsForRedistribution: WorkoutForRedistribution[] = plannedWorkouts.map((w) => ({
          originalDate: w.scheduled_date,
          dayOfWeek: w.day_of_week,
          weekNumber: w.week_number,
          workoutId: w.workout_id,
          workoutType: w.workout_type,
          targetTSS: w.target_tss,
          targetDuration: w.target_duration,
        }));

        // Get redistributions
        const redistributions = reshuffleActivePlanUtil(
          workoutsForRedistribution,
          weeklyAvailability,
          dateOverrides,
          preferences
        );

        // Apply redistributions to the database
        for (const r of redistributions) {
          if (r.originalDate !== r.newDate) {
            const workoutToUpdate = plannedWorkouts.find(
              (w) => w.scheduled_date === r.originalDate && w.workout_id === r.workoutId
            );
            if (!workoutToUpdate) continue;

            // Clear the target day of the rest entry that usually sits there.
            // Read live rather than from state, which goes stale after the
            // first move — and athlete-scoped rather than plan-scoped, so a
            // day held by a coach- or calendar-created entry is seen too.
            const displaced = await fetchSessionOn(userId!, r.newDate, { includeRaces: true });

            // A rest day carries nothing worth keeping; anything else is the
            // athlete's and is left alone, so the move is skipped instead.
            if (displaced) {
              if (displaced.entry_type === 'rest' || displaced.workout_type === 'rest') {
                await deleteEntry(userId!, displaced.id);
              } else {
                console.warn(
                  `reshuffle: ${r.newDate} already holds "${displaced.name}" — leaving it, not moving onto it.`,
                );
                continue;
              }
            }

            // Move the workout to the now-vacant target date. moveEntry
            // allocates the slot and records the origin in provenance.
            const moved = await moveEntry(userId!, workoutToUpdate.id, r.newDate);
            if (moved.success) {
              await updateEntry(userId!, workoutToUpdate.id, {
                notes: `${workoutToUpdate.notes || ''}\nMoved from ${r.originalDate} (availability change)`.trim(),
              });
            }
            const updateError = moved.success ? null : { message: moved.error };

            if (updateError) {
              console.error('Error updating workout:', updateError);
            }
          }
        }

        // Reload workouts
        await loadPlannedWorkouts();

        return {
          success: true,
          redistributions: redistributions.filter((r) => r.originalDate !== r.newDate),
        };
      } catch (err: any) {
        console.error('Error reshuffling plan:', err);
        setError(err.message || 'Failed to reshuffle plan');
        return { success: false, redistributions: [] };
      } finally {
        setLoading(false);
      }
    },
    [activePlan, plannedWorkouts, loadPlannedWorkouts]
  );

  // ============================================================
  // TOGGLE WORKOUT COMPLETION
  // ============================================================
  const toggleWorkoutCompletion = useCallback(
    async (workoutId: string, completed: boolean): Promise<boolean> => {
      try {
        const result = await setEntryStatus(userId!, workoutId, completed ? 'done' : 'planned');
        if (!result.success) throw new Error(result.error);

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

        // The calendar has ONE load column, so the canonical/legacy dual-write
        // the old table needed does not arise here. Readers still see both
        // names — the adapter emits target_rss and target_tss from it.
        // activities.distance is METRES per the unit convention.
        const linked = await linkEntryToActivity(userId!, workoutId, {
          activityId,
          actualLoad: activity.rss ?? activity.tss,
          actualDurationMin: Math.round(activity.moving_time / 60),
          actualDistanceKm: activity.distance ? activity.distance / 1000 : null,
          completedAt: activity.start_date,
        });

        if (!linked.success) throw new Error(linked.error);

        // Set reverse pointer so EFI computation can find the linked workout
        await supabase
          .from('activities')
          .update({ matched_planned_workout_id: workoutId })
          .eq('id', activityId);

        // Trigger adaptation detection (async, non-blocking)
        if (userId) {
          fetchTrainingContext(userId).then((context) => {
            triggerAdaptationDetection(userId, workoutId, activityId, context)
              .then((result) => {
                if (result.success && result.adaptation) {
                  console.log('Adaptation detected:', result.adaptation.adaptationType);
                }
              })
              .catch((err) => {
                console.error('Error detecting adaptation:', err);
              });
          });
        }

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
    [userId, loadPlannedWorkouts, loadActivePlan]
  );

  // ============================================================
  // GET WORKOUTS FOR DATE
  // ============================================================
  const getWorkoutsForDate = useCallback(
    (date: Date): PlannedWorkoutWithDetails[] => {
      const dateStr = formatLocalDate(date);
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

        // A supplement is just another entry. createEntry rather than
        // insertSessions, because this one SHOULD stack onto an occupied day —
        // that is what a double day is — and it is an athlete act, so it pins.
        const created = await createEntry(activePlan.user_id, formatLocalDate(scheduledDate), {
          type: 'workout',
          title: workout.name || `${workout.category} workout`,
          workout_id: workoutId,
          workout_type: workout.category,
          target_load: workout.targetTSS || 0,
          target_duration_min: workout.duration,
          notes: notes || `Supplement: ${workout.name}`,
          source: 'manual',
          plan_id: activePlan.id,
        });

        if (!created.success) throw new Error(created.error);

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
        // Prefer canonical actual_rss (spec §2); fall back to legacy
        // actual_tss for pre-cut-over rows, and to target_tss if neither
        // completed value is present. target_tss stays as the planned
        // fallback until its own writer cut-over lands.
        actualTSS: completed.reduce((sum, w) => sum + (w.actual_rss ?? w.actual_tss ?? w.target_tss ?? 0), 0),
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
    const today = getTodayString();
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
    // State — multi-plan aware
    activePlan,
    activePlans,
    selectedPlanId,
    primaryPlan,
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
    selectPlan,
    setPlanPriority,
    activatePlan,
    activatePlanWithAvailability,
    pausePlan,
    resumePlan,
    completePlan,
    cancelPlan,
    reshufflePlan,

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
