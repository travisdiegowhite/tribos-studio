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
  // Default to start of current week (Monday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return {
    activePlanId: null,
    planStartDate: null,
    planDurationWeeks: 0,
    currentPhase: 'base',

    focusedWeekStart: monday.toISOString().split('T')[0],
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
 * Get date string in YYYY-MM-DD format
 */
const formatDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Add days to a date string
 */
const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateString(date);
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

        set((state) => ({
          plannedWorkouts: {
            ...state.plannedWorkouts,
            [date]: {
              id: generateId(),
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
            },
          },
          hasUnsavedChanges: true,
        }));
      },

      moveWorkout: (fromDate: string, toDate: string) => {
        if (fromDate === toDate) return;

        set((state) => {
          const workout = state.plannedWorkouts[fromDate];
          if (!workout) return state;

          const targetWorkout = state.plannedWorkouts[toDate];
          const newPlannedWorkouts = { ...state.plannedWorkouts };

          if (targetWorkout) {
            // Swap workouts
            newPlannedWorkouts[toDate] = { ...workout, scheduledDate: toDate };
            newPlannedWorkouts[fromDate] = { ...targetWorkout, scheduledDate: fromDate };
          } else {
            // Just move
            newPlannedWorkouts[toDate] = { ...workout, scheduledDate: toDate };
            delete newPlannedWorkouts[fromDate];
          }

          return {
            plannedWorkouts: newPlannedWorkouts,
            hasUnsavedChanges: true,
          };
        });
      },

      removeWorkout: (date: string) => {
        set((state) => {
          const newPlannedWorkouts = { ...state.plannedWorkouts };
          delete newPlannedWorkouts[date];
          return {
            plannedWorkouts: newPlannedWorkouts,
            hasUnsavedChanges: true,
          };
        });
      },

      updateWorkout: (date: string, updates: Partial<PlannerWorkout>) => {
        set((state) => {
          const workout = state.plannedWorkouts[date];
          if (!workout) return state;

          return {
            plannedWorkouts: {
              ...state.plannedWorkouts,
              [date]: { ...workout, ...updates },
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
          // Collect week data
          const weekWorkouts: PlannerWorkout[] = [];
          for (let i = 0; i < 7; i++) {
            const date = addDays(weekStart, i);
            const workout = state.plannedWorkouts[date];
            if (workout) {
              weekWorkouts.push(workout);
            }
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

          // Convert to store format
          const workoutsMap: Record<string, PlannerWorkout> = {};
          for (const w of workouts || []) {
            if (w.workout_type === 'rest') continue; // Skip rest days

            workoutsMap[w.scheduled_date] = {
              id: w.id,
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
              workout: w.workout_id ? getWorkoutById(w.workout_id) : undefined,
            };
          }

          set({
            planStartDate: plan.started_at?.split('T')[0] || null,
            planDurationWeeks: plan.duration_weeks || 0,
            plannedWorkouts: workoutsMap,
            isLoading: false,
            hasUnsavedChanges: false,
          });
        } catch (error) {
          console.error('Failed to load plan:', error);
          set({ isLoading: false });
        }
      },

      loadWorkoutsForDateRange: async (startDate: string, endDate: string) => {
        const state = get();
        if (!state.activePlanId) return;

        try {
          const { data: workouts, error } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', state.activePlanId)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate);

          if (error) throw error;

          const newWorkouts: Record<string, PlannerWorkout> = {};
          for (const w of workouts || []) {
            if (w.workout_type === 'rest') continue;

            newWorkouts[w.scheduled_date] = {
              id: w.id,
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
              workout: w.workout_id ? getWorkoutById(w.workout_id) : undefined,
            };
          }

          set((state) => ({
            plannedWorkouts: { ...state.plannedWorkouts, ...newWorkouts },
          }));
        } catch (error) {
          console.error('Failed to load workouts for date range:', error);
        }
      },

      savePendingChanges: async () => {
        const state = get();
        if (!state.hasUnsavedChanges || !state.activePlanId) return;

        set({ isSaving: true });

        try {
          // Get all workouts that need saving
          const workouts = Object.values(state.plannedWorkouts);

          for (const workout of workouts) {
            if (workout.id.includes('-')) {
              // New workout (has generated ID)
              await supabase.from('planned_workouts').insert({
                plan_id: state.activePlanId,
                scheduled_date: workout.scheduledDate,
                workout_id: workout.workoutId,
                workout_type: workout.workoutType,
                target_tss: workout.targetTSS,
                target_duration: workout.targetDuration,
                notes: workout.notes,
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
      // INITIALIZATION
      // ============================================================

      initializeFromActivePlan: (
        planId: string,
        startDate: string,
        durationWeeks: number,
        workouts: PlannerWorkout[]
      ) => {
        const workoutsMap: Record<string, PlannerWorkout> = {};
        for (const w of workouts) {
          workoutsMap[w.scheduledDate] = w;
        }

        set({
          activePlanId: planId,
          planStartDate: startDate,
          planDurationWeeks: durationWeeks,
          plannedWorkouts: workoutsMap,
          hasUnsavedChanges: false,
        });
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
