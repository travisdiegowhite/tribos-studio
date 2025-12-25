/**
 * Training Planner Zustand Store
 * State management for the drag-and-drop training planner
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
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
    immer((set, get) => ({
      ...getInitialState(),

      // ============================================================
      // NAVIGATION
      // ============================================================

      setFocusedWeek: (date: string) => {
        set((state) => {
          state.focusedWeekStart = date;
        });
      },

      selectDate: (date: string | null) => {
        set((state) => {
          state.selectedDate = date;
        });
      },

      navigateWeeks: (direction: 'prev' | 'next') => {
        set((state) => {
          const offset = direction === 'next' ? 14 : -14; // Move 2 weeks
          state.focusedWeekStart = addDays(state.focusedWeekStart, offset);
        });
      },

      // ============================================================
      // WORKOUT OPERATIONS
      // ============================================================

      addWorkoutToDate: (date: string, workoutId: string) => {
        const workout = getWorkoutById(workoutId);
        if (!workout) return;

        set((state) => {
          state.plannedWorkouts[date] = {
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
          };
          state.hasUnsavedChanges = true;
        });
      },

      moveWorkout: (fromDate: string, toDate: string) => {
        if (fromDate === toDate) return;

        set((state) => {
          const workout = state.plannedWorkouts[fromDate];
          if (!workout) return;

          // Check if target date has a workout - if so, swap
          const targetWorkout = state.plannedWorkouts[toDate];

          if (targetWorkout) {
            // Swap workouts
            state.plannedWorkouts[toDate] = {
              ...workout,
              scheduledDate: toDate,
            };
            state.plannedWorkouts[fromDate] = {
              ...targetWorkout,
              scheduledDate: fromDate,
            };
          } else {
            // Just move
            state.plannedWorkouts[toDate] = {
              ...workout,
              scheduledDate: toDate,
            };
            delete state.plannedWorkouts[fromDate];
          }

          state.hasUnsavedChanges = true;
        });
      },

      removeWorkout: (date: string) => {
        set((state) => {
          delete state.plannedWorkouts[date];
          state.hasUnsavedChanges = true;
        });
      },

      updateWorkout: (date: string, updates: Partial<PlannerWorkout>) => {
        set((state) => {
          const workout = state.plannedWorkouts[date];
          if (workout) {
            state.plannedWorkouts[date] = { ...workout, ...updates };
            state.hasUnsavedChanges = true;
          }
        });
      },

      // ============================================================
      // DRAG OPERATIONS
      // ============================================================

      startDrag: (source: DragSource, workoutId: string, sourceDate?: string) => {
        set((state) => {
          state.draggedWorkout = {
            source,
            workoutId,
            sourceDate,
          };
        });
      },

      setDropTarget: (date: string | null) => {
        set((state) => {
          state.dropTargetDate = date;
        });
      },

      endDrag: () => {
        set((state) => {
          state.draggedWorkout = null;
          state.dropTargetDate = null;
        });
      },

      // ============================================================
      // SIDEBAR
      // ============================================================

      setSidebarFilter: (filter: Partial<SidebarFilter>) => {
        set((state) => {
          state.sidebarFilter = { ...state.sidebarFilter, ...filter };
        });
      },

      clearSidebarFilter: () => {
        set((state) => {
          state.sidebarFilter = {
            category: null,
            searchQuery: '',
            difficulty: null,
          };
        });
      },

      // ============================================================
      // AI HINTS
      // ============================================================

      requestWeekReview: async (weekStart: string) => {
        const state = get();
        if (state.isReviewingWeek) return;

        set((state) => {
          state.isReviewingWeek = true;
        });

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
              // TODO: Add user context (FTP, CTL, ATL, TSB)
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get week review');
          }

          const result = await response.json();

          set((state) => {
            // Add hints with generated IDs
            state.aiHints = (result.insights || []).map((hint: Omit<AIHint, 'id' | 'dismissed'>) => ({
              ...hint,
              id: generateId(),
              dismissed: false,
            }));
            state.isReviewingWeek = false;
          });
        } catch (error) {
          console.error('Week review failed:', error);
          set((state) => {
            state.isReviewingWeek = false;
          });
        }
      },

      dismissHint: (hintId: string) => {
        set((state) => {
          const hint = state.aiHints.find((h) => h.id === hintId);
          if (hint) {
            hint.dismissed = true;
          }
        });
      },

      applyHint: (hintId: string) => {
        const state = get();
        const hint = state.aiHints.find((h) => h.id === hintId);

        if (hint?.suggestedWorkoutId && hint.targetDate) {
          // Apply the suggestion
          get().addWorkoutToDate(hint.targetDate, hint.suggestedWorkoutId);

          set((state) => {
            const hintToUpdate = state.aiHints.find((h) => h.id === hintId);
            if (hintToUpdate) {
              hintToUpdate.appliedAt = new Date().toISOString();
              hintToUpdate.dismissed = true;
            }
          });
        }
      },

      clearHints: () => {
        set((state) => {
          state.aiHints = [];
        });
      },

      // ============================================================
      // GOALS
      // ============================================================

      addGoal: (goal: Omit<PlannerGoal, 'id' | 'createdAt'>) => {
        set((state) => {
          state.goals.push({
            ...goal,
            id: generateId(),
            createdAt: new Date().toISOString(),
          });
          state.hasUnsavedChanges = true;
        });
      },

      updateGoal: (id: string, updates: Partial<PlannerGoal>) => {
        set((state) => {
          const goal = state.goals.find((g) => g.id === id);
          if (goal) {
            Object.assign(goal, updates);
            state.hasUnsavedChanges = true;
          }
        });
      },

      removeGoal: (id: string) => {
        set((state) => {
          state.goals = state.goals.filter((g) => g.id !== id);
          state.hasUnsavedChanges = true;
        });
      },

      // ============================================================
      // PERSISTENCE
      // ============================================================

      loadPlan: async (planId: string) => {
        set((state) => {
          state.isLoading = true;
          state.activePlanId = planId;
        });

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

          set((state) => {
            state.planStartDate = plan.started_at?.split('T')[0] || null;
            state.planDurationWeeks = plan.duration_weeks || 0;
            state.plannedWorkouts = workoutsMap;
            state.isLoading = false;
            state.hasUnsavedChanges = false;
          });
        } catch (error) {
          console.error('Failed to load plan:', error);
          set((state) => {
            state.isLoading = false;
          });
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

          set((state) => {
            for (const w of workouts || []) {
              if (w.workout_type === 'rest') continue;

              state.plannedWorkouts[w.scheduled_date] = {
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
          });
        } catch (error) {
          console.error('Failed to load workouts for date range:', error);
        }
      },

      savePendingChanges: async () => {
        const state = get();
        if (!state.hasUnsavedChanges || !state.activePlanId) return;

        set((state) => {
          state.isSaving = true;
        });

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

          set((state) => {
            state.isSaving = false;
            state.hasUnsavedChanges = false;
          });
        } catch (error) {
          console.error('Failed to save changes:', error);
          set((state) => {
            state.isSaving = false;
          });
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

        set((state) => {
          state.activePlanId = planId;
          state.planStartDate = startDate;
          state.planDurationWeeks = durationWeeks;
          state.plannedWorkouts = workoutsMap;
          state.hasUnsavedChanges = false;
        });
      },

      // ============================================================
      // RESET
      // ============================================================

      reset: () => {
        set(getInitialState());
      },
    })),
    { name: 'training-planner' }
  )
);

export default useTrainingPlannerStore;
