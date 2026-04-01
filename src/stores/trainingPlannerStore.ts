/**
 * Training Planner Zustand Store
 * State management for the drag-and-drop training planner
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { getWorkoutById } from '../data/workoutLibrary';
import type {
  TrainingPlannerStore,
  TrainingPlannerState,
  PlannerWorkout,
  PlannerGoal,
  AIHint,
  SidebarFilter,
  DragSource,
} from '../types/planner';

// ============================================================
// INITIAL STATE
// ============================================================

const getInitialState = (): TrainingPlannerState => {
  // Default to start of current week (Monday) using LOCAL timezone
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  // Format as local date (YYYY-MM-DD)
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  const mondayStr = `${year}-${month}-${day}`;

  return {
    activePlanId: null,
    loadedPlanIds: [],
    planStartDate: null,
    planDurationWeeks: 0,
    currentPhase: 'base',

    focusedWeekStart: mondayStr,
    selectedDate: null,

    plannedWorkouts: {},
    goals: [],
    aiHints: [],

    sidebarFilter: {
      category: null,
      searchQuery: '',
      difficulty: null,
    },

    draggedWorkout: null,
    dropTargetDate: null,

    isLoading: false,
    isSaving: false,
    isReviewingWeek: false,

    hasUnsavedChanges: false,
  };
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate a unique ID
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get date string in YYYY-MM-DD format using LOCAL timezone
 */
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse YYYY-MM-DD string as LOCAL date (not UTC)
 */
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Add days to a date string (using local timezone)
 */
const addDays = (dateStr: string, days: number): string => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
};

// ============================================================
// STORE CREATION
// ============================================================

export const useTrainingPlannerStore = create<TrainingPlannerStore>()(
  devtools(
    (set, get) => ({
      ...getInitialState(),

      // ============================================================
      // NAVIGATION
      // ============================================================

      setFocusedWeek: (date: string) => {
        set({ focusedWeekStart: date });
      },

      selectDate: (date: string | null) => {
        set({ selectedDate: date });
      },

      navigateWeeks: (direction: 'prev' | 'next') => {
        const offset = direction === 'next' ? 14 : -14; // Move 2 weeks
        set((state) => ({
          focusedWeekStart: addDays(state.focusedWeekStart, offset),
        }));
      },

      // ============================================================
      // WORKOUT OPERATIONS
      // ============================================================

      addWorkoutToDate: (date: string, workoutId: string) => {
        const workout = getWorkoutById(workoutId);
        if (!workout) return;

        set((state) => {
          const existing = state.plannedWorkouts[date] || [];
          const newWorkout: PlannerWorkout = {
            id: generateId(),
            planId: state.activePlanId || '',
            sportType: null, // Will be enriched from plan
            planPriority: 'primary',
            scheduledDate: date,
            workoutId: workoutId,
            workoutType: workout.category,
            targetTSS: workout.targetTSS,
            targetDuration: workout.duration,
            notes: '',
            completed: false,
            completedAt: null,
            activityId: null,
            actualTSS: null,
            actualDuration: null,
            workout: workout,
          };
          return {
            plannedWorkouts: {
              ...state.plannedWorkouts,
              [date]: [...existing, newWorkout],
            },
            hasUnsavedChanges: true,
          };
        });
      },

      moveWorkout: (fromDate: string, toDate: string) => {
        if (fromDate === toDate) return;

        set((state) => {
          const fromWorkouts = state.plannedWorkouts[fromDate] || [];
          // Move the first workout from the active plan (or first workout if no plan selected)
          const workoutIndex = fromWorkouts.findIndex(w => w.planId === state.activePlanId) ?? 0;
          const workout = fromWorkouts[workoutIndex];
          if (!workout) return state;

          const newPlannedWorkouts = { ...state.plannedWorkouts };
          const toWorkouts = [...(newPlannedWorkouts[toDate] || [])];

          // Add to target date
          toWorkouts.push({ ...workout, scheduledDate: toDate });
          newPlannedWorkouts[toDate] = toWorkouts;

          // Remove from source date
          const remainingFrom = fromWorkouts.filter((_, i) => i !== workoutIndex);
          if (remainingFrom.length > 0) {
            newPlannedWorkouts[fromDate] = remainingFrom;
          } else {
            delete newPlannedWorkouts[fromDate];
          }

          return {
            plannedWorkouts: newPlannedWorkouts,
            hasUnsavedChanges: true,
          };
        });
      },

      removeWorkout: (date: string, planId?: string) => {
        set((state) => {
          const workouts = state.plannedWorkouts[date] || [];
          const targetPlanId = planId || state.activePlanId;
          const remaining = targetPlanId
            ? workouts.filter(w => w.planId !== targetPlanId)
            : []; // Remove all if no plan specified

          const newPlannedWorkouts = { ...state.plannedWorkouts };
          if (remaining.length > 0) {
            newPlannedWorkouts[date] = remaining;
          } else {
            delete newPlannedWorkouts[date];
          }

          return {
            plannedWorkouts: newPlannedWorkouts,
            hasUnsavedChanges: true,
          };
        });
      },

      updateWorkout: (date: string, updates: Partial<PlannerWorkout>, planId?: string) => {
        set((state) => {
          const workouts = state.plannedWorkouts[date] || [];
          const targetPlanId = planId || state.activePlanId;
          const updated = workouts.map(w =>
            w.planId === targetPlanId ? { ...w, ...updates } : w
          );

          return {
            plannedWorkouts: {
              ...state.plannedWorkouts,
              [date]: updated,
            },
            hasUnsavedChanges: true,
          };
        });
      },

      // ============================================================
      // DRAG OPERATIONS
      // ============================================================

      startDrag: (source: DragSource, workoutId: string, sourceDate?: string) => {
        set({
          draggedWorkout: {
            source,
            workoutId,
            sourceDate,
          },
        });
      },

      setDropTarget: (date: string | null) => {
        set({ dropTargetDate: date });
      },

      endDrag: () => {
        set({
          draggedWorkout: null,
          dropTargetDate: null,
        });
      },

      // ============================================================
      // SIDEBAR
      // ============================================================

      setSidebarFilter: (filter: Partial<SidebarFilter>) => {
        set((state) => ({
          sidebarFilter: { ...state.sidebarFilter, ...filter },
        }));
      },

      clearSidebarFilter: () => {
        set({
          sidebarFilter: {
            category: null,
            searchQuery: '',
            difficulty: null,
          },
        });
      },

      // ============================================================
      // AI HINTS
      // ============================================================

      requestWeekReview: async (weekStart: string) => {
        const state = get();
        if (state.isReviewingWeek) return;

        set({ isReviewingWeek: true });

        try {
          // Collect week data (flatten all plans' workouts for the week)
          const weekWorkouts: PlannerWorkout[] = [];
          for (let i = 0; i < 7; i++) {
            const date = addDays(weekStart, i);
            const workoutsForDate = state.plannedWorkouts[date] || [];
            weekWorkouts.push(...workoutsForDate);
          }

          // Call the review endpoint
          const response = await fetch('/api/review-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekStart,
              plannedWorkouts: weekWorkouts,
              goals: state.goals,
              // TODO: Add user context (FTP, CTL, ATL, TSB)
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get week review');
          }

          const result = await response.json();

          set({
            aiHints: (result.insights || []).map((hint: Omit<AIHint, 'id' | 'dismissed'>) => ({
              ...hint,
              id: generateId(),
              dismissed: false,
            })),
            isReviewingWeek: false,
          });
        } catch (error) {
          console.error('Week review failed:', error);
          set({ isReviewingWeek: false });
        }
      },

      dismissHint: (hintId: string) => {
        set((state) => ({
          aiHints: state.aiHints.map((h) =>
            h.id === hintId ? { ...h, dismissed: true } : h
          ),
        }));
      },

      applyHint: (hintId: string) => {
        const state = get();
        const hint = state.aiHints.find((h) => h.id === hintId);

        if (hint?.suggestedWorkoutId && hint.targetDate) {
          // Apply the suggestion
          get().addWorkoutToDate(hint.targetDate, hint.suggestedWorkoutId);

          set((state) => ({
            aiHints: state.aiHints.map((h) =>
              h.id === hintId
                ? { ...h, appliedAt: new Date().toISOString(), dismissed: true }
                : h
            ),
          }));
        }
      },

      clearHints: () => {
        set({ aiHints: [] });
      },

      // ============================================================
      // GOALS
      // ============================================================

      addGoal: (goal: Omit<PlannerGoal, 'id' | 'createdAt'>) => {
        set((state) => ({
          goals: [
            ...state.goals,
            {
              ...goal,
              id: generateId(),
              createdAt: new Date().toISOString(),
            },
          ],
          hasUnsavedChanges: true,
        }));
      },

      updateGoal: (id: string, updates: Partial<PlannerGoal>) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
          hasUnsavedChanges: true,
        }));
      },

      removeGoal: (id: string) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          hasUnsavedChanges: true,
        }));
      },

      // ============================================================
      // PERSISTENCE
      // ============================================================

      loadPlan: async (planId: string) => {
        set({ isLoading: true, activePlanId: planId });

        try {
          // Load plan details
          const { data: plan, error: planError } = await supabase
            .from('training_plans')
            .select('*')
            .eq('id', planId)
            .single();

          if (planError) throw planError;

          // Load planned workouts
          const { data: workouts, error: workoutsError } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', planId)
            .order('scheduled_date');

          if (workoutsError) throw workoutsError;

          // Convert to store format — merge into existing workouts (multi-plan aware)
          const currentState = get();
          const newWorkoutsMap: Record<string, PlannerWorkout[]> = { ...currentState.plannedWorkouts };

          // Remove any existing workouts for this plan (refresh)
          for (const date of Object.keys(newWorkoutsMap)) {
            newWorkoutsMap[date] = (newWorkoutsMap[date] || []).filter(w => w.planId !== planId);
            if (newWorkoutsMap[date].length === 0) delete newWorkoutsMap[date];
          }

          // Add workouts from this plan
          for (const w of workouts || []) {
            if (w.workout_type === 'rest') continue;

            const plannerWorkout: PlannerWorkout = {
              id: w.id,
              planId: planId,
              sportType: plan.sport_type || null,
              planPriority: plan.priority || 'primary',
              scheduledDate: w.scheduled_date,
              workoutId: w.workout_id,
              workoutType: w.workout_type,
              targetTSS: w.target_tss || 0,
              targetDuration: w.target_duration || 0,
              notes: w.notes || '',
              completed: w.completed || false,
              completedAt: w.completed_at,
              activityId: w.activity_id,
              actualTSS: w.actual_tss,
              actualDuration: w.actual_duration,
              workout: w.workout_id ? (getWorkoutById(w.workout_id) ?? undefined) : undefined,
              originalScheduledDate: w.original_scheduled_date || null,
              originalWorkoutId: w.original_workout_id || null,
            };

            if (!newWorkoutsMap[w.scheduled_date]) {
              newWorkoutsMap[w.scheduled_date] = [];
            }
            newWorkoutsMap[w.scheduled_date].push(plannerWorkout);
          }

          // Track loaded plan IDs
          const loadedPlanIds = currentState.loadedPlanIds.includes(planId)
            ? currentState.loadedPlanIds
            : [...currentState.loadedPlanIds, planId];

          set({
            loadedPlanIds,
            planStartDate: plan.started_at?.split('T')[0] || null,
            planDurationWeeks: plan.duration_weeks || 0,
            plannedWorkouts: newWorkoutsMap,
            isLoading: false,
            hasUnsavedChanges: false,
          });
        } catch (error) {
          console.error('Failed to load plan:', error);
          set({ isLoading: false });
        }
      },

      unloadPlan: (planId: string) => {
        set((state) => {
          const newWorkoutsMap: Record<string, PlannerWorkout[]> = {};
          for (const [date, workouts] of Object.entries(state.plannedWorkouts)) {
            const remaining = workouts.filter(w => w.planId !== planId);
            if (remaining.length > 0) {
              newWorkoutsMap[date] = remaining;
            }
          }

          return {
            loadedPlanIds: state.loadedPlanIds.filter(id => id !== planId),
            plannedWorkouts: newWorkoutsMap,
          };
        });
      },

      loadAllActivePlans: async (userId: string, preferredActivePlanId?: string) => {
        set({ isLoading: true });

        try {
          // Load all active plans
          const { data: plans, error: plansError } = await supabase
            .from('training_plans')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('priority', { ascending: true });

          if (plansError) throw plansError;
          if (!plans || plans.length === 0) {
            set({ isLoading: false });
            return;
          }

          // Load workouts for all plans at once
          const planIds = plans.map(p => p.id);
          const { data: allWorkouts, error: workoutsError } = await supabase
            .from('planned_workouts')
            .select('*')
            .in('plan_id', planIds)
            .order('scheduled_date');

          if (workoutsError) throw workoutsError;

          // Build a plan lookup for sport type and priority
          const planLookup = new Map(plans.map(p => [p.id, p]));

          // Convert to store format
          const workoutsMap: Record<string, PlannerWorkout[]> = {};
          for (const w of allWorkouts || []) {
            if (w.workout_type === 'rest') continue;
            const plan = planLookup.get(w.plan_id);

            const plannerWorkout: PlannerWorkout = {
              id: w.id,
              planId: w.plan_id,
              sportType: plan?.sport_type || null,
              planPriority: plan?.priority || 'primary',
              scheduledDate: w.scheduled_date,
              workoutId: w.workout_id,
              workoutType: w.workout_type,
              targetTSS: w.target_tss || 0,
              targetDuration: w.target_duration || 0,
              notes: w.notes || '',
              completed: w.completed || false,
              completedAt: w.completed_at,
              activityId: w.activity_id,
              actualTSS: w.actual_tss,
              actualDuration: w.actual_duration,
              workout: w.workout_id ? (getWorkoutById(w.workout_id) ?? undefined) : undefined,
              originalScheduledDate: w.original_scheduled_date || null,
              originalWorkoutId: w.original_workout_id || null,
            };

            if (!workoutsMap[w.scheduled_date]) {
              workoutsMap[w.scheduled_date] = [];
            }
            workoutsMap[w.scheduled_date].push(plannerWorkout);
          }

          // Use preferred plan if valid, otherwise default to primary plan
          const preferredPlan = preferredActivePlanId
            ? plans.find(p => p.id === preferredActivePlanId)
            : null;
          const selectedPlan = preferredPlan || plans.find(p => p.priority === 'primary') || plans[0];

          set({
            activePlanId: selectedPlan.id,
            loadedPlanIds: planIds,
            planStartDate: selectedPlan.started_at?.split('T')[0] || null,
            planDurationWeeks: selectedPlan.duration_weeks || 0,
            plannedWorkouts: workoutsMap,
            isLoading: false,
            hasUnsavedChanges: false,
          });
        } catch (error) {
          console.error('Failed to load all active plans:', error);
          set({ isLoading: false });
        }
      },

      loadWorkoutsForDateRange: async (startDate: string, endDate: string) => {
        const state = get();
        if (!state.activePlanId) return;

        try {
          // Load workouts for ALL loaded plans in this date range
          const planIds = state.loadedPlanIds.length > 0 ? state.loadedPlanIds : [state.activePlanId];
          const { data: workouts, error } = await supabase
            .from('planned_workouts')
            .select('*')
            .in('plan_id', planIds)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate);

          if (error) throw error;

          // Merge into existing workouts for the date range
          const newWorkouts: Record<string, PlannerWorkout[]> = {};
          for (const w of workouts || []) {
            if (w.workout_type === 'rest') continue;

            const plannerWorkout: PlannerWorkout = {
              id: w.id,
              planId: w.plan_id,
              sportType: null, // Will be enriched from plan context
              planPriority: 'primary',
              scheduledDate: w.scheduled_date,
              workoutId: w.workout_id,
              workoutType: w.workout_type,
              targetTSS: w.target_tss || 0,
              targetDuration: w.target_duration || 0,
              notes: w.notes || '',
              completed: w.completed || false,
              completedAt: w.completed_at,
              activityId: w.activity_id,
              actualTSS: w.actual_tss,
              actualDuration: w.actual_duration,
              workout: w.workout_id ? (getWorkoutById(w.workout_id) ?? undefined) : undefined,
              originalScheduledDate: w.original_scheduled_date || null,
              originalWorkoutId: w.original_workout_id || null,
            };

            if (!newWorkouts[w.scheduled_date]) {
              newWorkouts[w.scheduled_date] = [];
            }
            newWorkouts[w.scheduled_date].push(plannerWorkout);
          }

          set((state) => {
            const merged = { ...state.plannedWorkouts };
            for (const [date, dateWorkouts] of Object.entries(newWorkouts)) {
              merged[date] = dateWorkouts;
            }
            return { plannedWorkouts: merged };
          });
        } catch (error) {
          console.error('Failed to load workouts for date range:', error);
        }
      },

      savePendingChanges: async () => {
        const state = get();
        if (!state.hasUnsavedChanges || !state.activePlanId) return;

        set({ isSaving: true });

        try {
          // Get all workouts that need saving (flatten arrays)
          const allWorkouts = Object.values(state.plannedWorkouts).flat();

          for (const workout of allWorkouts) {
            // Only save workouts belonging to the active plan
            if (workout.planId !== state.activePlanId) continue;

            if (workout.id.includes('-')) {
              // New workout (has generated ID)
              const { data: { user } } = await supabase.auth.getUser();
              await supabase.from('planned_workouts').insert({
                plan_id: state.activePlanId,
                user_id: user?.id,
                scheduled_date: workout.scheduledDate,
                workout_id: workout.workoutId,
                workout_type: workout.workoutType,
                name: workout.workoutId || 'Workout',
                target_tss: workout.targetTSS,
                target_duration: workout.targetDuration,
                duration_minutes: workout.targetDuration || 0,
                completed: workout.completed,
                week_number: 1, // TODO: Calculate properly
                day_of_week: new Date(workout.scheduledDate).getDay(),
              });
            } else {
              // Existing workout
              await supabase
                .from('planned_workouts')
                .update({
                  scheduled_date: workout.scheduledDate,
                  workout_id: workout.workoutId,
                  workout_type: workout.workoutType,
                  target_tss: workout.targetTSS,
                  target_duration: workout.targetDuration,
                  notes: workout.notes,
                  completed: workout.completed,
                })
                .eq('id', workout.id);
            }
          }

          set({ isSaving: false, hasUnsavedChanges: false });
        } catch (error) {
          console.error('Failed to save changes:', error);
          set({ isSaving: false });
        }
      },

      syncWithDatabase: async () => {
        const state = get();
        if (state.activePlanId) {
          await get().loadPlan(state.activePlanId);
        }
      },

      // ============================================================
      // MULTI-PLAN MANAGEMENT
      // ============================================================

      setActivePlan: (planId: string) => {
        set({ activePlanId: planId });
      },

      // ============================================================
      // INITIALIZATION
      // ============================================================

      initializeFromActivePlan: (
        planId: string,
        startDate: string,
        durationWeeks: number,
        workouts: PlannerWorkout[]
      ) => {
        const workoutsMap: Record<string, PlannerWorkout[]> = {};
        for (const w of workouts) {
          if (!workoutsMap[w.scheduledDate]) {
            workoutsMap[w.scheduledDate] = [];
          }
          workoutsMap[w.scheduledDate].push(w);
        }

        set({
          activePlanId: planId,
          loadedPlanIds: [planId],
          planStartDate: startDate,
          planDurationWeeks: durationWeeks,
          plannedWorkouts: workoutsMap,
          hasUnsavedChanges: false,
        });
      },

      // ============================================================
      // COMPATIBILITY HELPERS
      // ============================================================

      getWorkoutForDate: (date: string): PlannerWorkout | null => {
        const state = get();
        const workouts = state.plannedWorkouts[date] || [];
        // Return the active plan's workout, or the first one
        return workouts.find(w => w.planId === state.activePlanId) || workouts[0] || null;
      },

      getWorkoutsForDate: (date: string): PlannerWorkout[] => {
        const state = get();
        return state.plannedWorkouts[date] || [];
      },

      getWorkoutsForPlan: (planId: string, date: string): PlannerWorkout | null => {
        const state = get();
        const workouts = state.plannedWorkouts[date] || [];
        return workouts.find(w => w.planId === planId) || null;
      },

      // ============================================================
      // RESET
      // ============================================================

      reset: () => {
        set(getInitialState());
      },
    }),
    { name: 'training-planner' }
  )
);

export default useTrainingPlannerStore;
