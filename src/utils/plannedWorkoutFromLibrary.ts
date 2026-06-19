/**
 * Helpers for adding a library workout to a training plan day.
 *
 * Extracted from TrainingCalendar's `handleAddFromLibrary` so the row shape and
 * week-number math can be unit-tested independently of the component / Supabase.
 */

import { formatLocalDate } from './dateUtils';

/** Minimal shape of a workout-library definition needed to build a row. */
export interface LibraryWorkoutLike {
  category: string;
  name?: string;
  duration?: number;
  targetTSS?: number;
}

/**
 * Plan week number (1-based) for a target date, measured from the plan start.
 * Both dates are normalized to local midnight so DST / time-of-day can't shift
 * the week boundary.
 */
export function computeWeekNumber(planStartDate: Date, targetDate: Date): number {
  const start = new Date(planStartDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const daysSinceStart = Math.floor((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.floor(daysSinceStart / 7) + 1;
}

export interface BuildLibraryWorkoutRowArgs {
  workout: LibraryWorkoutLike;
  workoutId: string;
  planId: string;
  userId: string;
  planStartDate: Date;
  targetDate: Date;
}

/**
 * Build the `planned_workouts` insert row for a library workout dropped on a day.
 * Dual-writes `target_rss` AND `target_tss` per the CLAUDE.md metrics-freeze
 * policy (canonical + legacy on every write).
 */
export function buildLibraryWorkoutRow({
  workout,
  workoutId,
  planId,
  userId,
  planStartDate,
  targetDate,
}: BuildLibraryWorkoutRowArgs) {
  const targetRss = workout.targetTSS || 0;
  return {
    plan_id: planId,
    user_id: userId,
    week_number: computeWeekNumber(planStartDate, targetDate),
    day_of_week: targetDate.getDay(),
    scheduled_date: formatLocalDate(targetDate),
    workout_type: workout.category,
    workout_id: workoutId,
    name: workout.name || `${workout.category} Workout`,
    duration_minutes: workout.duration || 0,
    target_duration: workout.duration || 0,
    target_rss: targetRss,
    target_tss: targetRss,
    completed: false,
  };
}
