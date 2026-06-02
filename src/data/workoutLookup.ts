/**
 * workoutLookup — the single place that knows about both the cycling
 * (`WORKOUT_LIBRARY`) and running (`RUNNING_WORKOUT_LIBRARY`) workout libraries.
 *
 * A `planned_workouts.workout_id` is sport-agnostic; which library holds it is
 * how its sport is determined. Resolve cycling-first, then running.
 */

import { WORKOUT_LIBRARY } from './workoutLibrary';
import { RUNNING_WORKOUT_LIBRARY } from './runningWorkoutLibrary';
import type { WorkoutDefinition } from '../types/training';

export function getAnyWorkoutById(id: string | null | undefined): WorkoutDefinition | null {
  if (!id) return null;
  return WORKOUT_LIBRARY[id] ?? RUNNING_WORKOUT_LIBRARY[id] ?? null;
}

export function getCyclingWorkouts(): WorkoutDefinition[] {
  return Object.values(WORKOUT_LIBRARY);
}

export function getRunningWorkouts(): WorkoutDefinition[] {
  return Object.values(RUNNING_WORKOUT_LIBRARY);
}
