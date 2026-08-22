/**
 * workoutResolution — turn a `planned_workouts` row into a library workout
 * whose `structure` can actually be painted.
 *
 * A plan row names a library workout in `workout_id`, and everything that
 * needs a workout's *shape* (the RB2 interval overlay, the workout picker,
 * the calendar's detail modal) resolves through that column. But only the
 * static template plans populate it: the AI-arc generator
 * (`api/utils/arcBuilder.js` `arcSessionToRow`) writes `workout_id: null` and
 * describes the session with `workout_type` + a target duration instead. Rows
 * from those plans therefore carry a prescription with no structure attached,
 * and every shape-consuming surface silently renders nothing.
 *
 * This module closes that gap on the read side: when the row names no library
 * workout, match the closest one by category and length, so a 75-minute
 * `vo2max` day paints as the library's 4x8min VO2 Max. The match is flagged
 * `inferred` so callers can say it is a stand-in rather than the prescription.
 *
 * Cycling-first (RB2 is a cycling surface): inference only ever picks from
 * `WORKOUT_LIBRARY`. An explicit `workout_id` still resolves against either
 * library via `getAnyWorkoutById`, so running rows keep working.
 */

import { WORKOUT_LIBRARY } from './workoutLibrary';
import { getAnyWorkoutById } from './workoutLookup';
import { WORKOUT_TYPES } from '../utils/trainingPlans';
import type { WorkoutCategory, WorkoutDefinition } from '../types/training';

/** The subset of a `planned_workouts` row this module reads. */
export interface PlannedWorkoutShape {
  workout_id?: string | null;
  workout_type?: string | null;
  /** Arc rows also carry the sequencer's own session vocabulary. */
  session_type?: string | null;
  target_duration?: number | null;
  duration_minutes?: number | null;
}

export interface ResolvedWorkout {
  workout: WorkoutDefinition;
  /**
   * True when the plan named no library workout and this is the closest
   * match by type + length rather than the prescribed session itself.
   */
  inferred: boolean;
}

/** Length used when a row gives no duration at all. */
const FALLBACK_TARGET_MIN = 60;

/**
 * `planned_workouts.workout_type` (and the arc's `session_type`) → the
 * library category to draw a stand-in from. Types with no on-bike shape to
 * paint (rest, off-bike work) map to null.
 */
const TYPE_TO_CATEGORY: Record<string, WorkoutCategory | null> = {
  // planned_workouts.workout_type
  rest: null,
  recovery: 'recovery',
  endurance: 'endurance',
  long_ride: 'endurance',
  tempo: 'tempo',
  sweet_spot: 'sweet_spot',
  threshold: 'threshold',
  vo2max: 'vo2max',
  anaerobic: 'anaerobic',
  racing: 'racing',
  climbing: 'climbing',
  hill_repeats: 'climbing',
  // "Mixed intervals" has no category of its own; threshold work is the
  // library's centre of gravity for it (same call workoutTypeToGoal makes).
  intervals: 'threshold',
  // arc session_type vocabulary (api/utils/arcBuilder.js SESSION_TYPE_TO_WORKOUT_TYPE)
  z1: 'recovery',
  z2: 'endurance',
  vo2: 'vo2max',
  race_sim: 'racing',
  opener: 'recovery',
};

/** Library category a plan type should draw its stand-in from, if any. */
export function workoutCategoryForPlanType(
  planType: string | null | undefined,
): WorkoutCategory | null {
  if (!planType) return null;
  return TYPE_TO_CATEGORY[planType.toLowerCase()] ?? null;
}

/** Only workouts with a structure can be scaled into cues. */
function isPaintable(workout: WorkoutDefinition): boolean {
  return !!workout.structure;
}

/**
 * The closest library workout to a plan type of a given length.
 *
 * Ranks the category's paintable workouts by how far their length is from the
 * target, breaking ties toward the gentler session. Returns null for types
 * with nothing to paint (rest days, off-bike work, unknown types).
 */
export function inferWorkoutForType(
  planType: string | null | undefined,
  durationMinutes?: number | null,
): WorkoutDefinition | null {
  const category = workoutCategoryForPlanType(planType);
  if (!category) return null;

  const targetMin =
    durationMinutes && durationMinutes > 0
      ? durationMinutes
      : WORKOUT_TYPES[(planType ?? '').toLowerCase()]?.defaultDuration || FALLBACK_TARGET_MIN;

  let best: WorkoutDefinition | null = null;
  let bestDelta = Infinity;
  for (const workout of Object.values(WORKOUT_LIBRARY)) {
    if (workout.category !== category || !isPaintable(workout)) continue;
    const delta = Math.abs(workout.duration - targetMin);
    if (delta < bestDelta || (delta === bestDelta && best && workout.targetTSS < best.targetTSS)) {
      best = workout;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Resolve a plan row to a paintable workout: the one it names, or the closest
 * stand-in for its type and length. Null when neither is available.
 */
export function resolvePlannedWorkout(
  row: PlannedWorkoutShape | null | undefined,
): ResolvedWorkout | null {
  if (!row) return null;

  const named = getAnyWorkoutById(row.workout_id);
  if (named) return { workout: named, inferred: false };

  const minutes = row.target_duration ?? row.duration_minutes ?? null;
  const inferred =
    inferWorkoutForType(row.workout_type, minutes) ??
    inferWorkoutForType(row.session_type, minutes);
  return inferred ? { workout: inferred, inferred: true } : null;
}
