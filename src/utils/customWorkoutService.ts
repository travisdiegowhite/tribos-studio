/**
 * customWorkoutService — entering a workout a human coach prescribed.
 *
 * Two steps, deliberately separate: read the rider's description into a
 * structure (server-side, via Claude), then persist it. Parsing is the
 * expensive, fallible half — keeping it apart means a rider can see what was
 * read before anything is written, and a bad read never silently becomes a
 * scheduled workout.
 *
 * A coach's workout is stored as a `workout_templates` row the rider owns, and
 * scheduling it writes a `planned_workouts` row pointing at it. The session a
 * coach repeats weekly is therefore one template scheduled several times,
 * rather than a structure copied onto every date.
 */

import { supabase } from '../lib/supabase';
import type { WorkoutDefinition, WorkoutStructure } from '../types/training';
import { workoutDefinitionFromRow } from './customWorkoutRow';

/** What the parser returns for a description it could read. */
export interface ParsedWorkout {
  name: string;
  category: string;
  structure: WorkoutStructure;
  terrainType: 'flat' | 'rolling' | 'hilly';
  focusArea: string | null;
  intensityFactor: number | null;
  estimatedTSS: number | null;
}

export type ParseResult =
  | { ok: true; workout: ParsedWorkout; description: string }
  /**
   * The description was too vague to structure. `message` is the model's own
   * account of what's missing — worth showing verbatim, since guessing would
   * produce a route built for a workout the rider never described.
   */
  | { ok: false; needsDetail: boolean; message: string };

async function accessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Read a free-text workout description into a structure. */
export async function parseWorkoutDescription(input: {
  description: string;
  name?: string | null;
}): Promise<ParseResult> {
  const token = await accessToken();
  if (!token) {
    return { ok: false, needsDetail: false, message: 'Sign in to add a workout.' };
  }

  try {
    const res = await fetch('/api/parse-workout-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description: input.description, name: input.name ?? null }),
    });
    const data = await res.json().catch(() => null);

    if (data?.success && data.workout) {
      return { ok: true, workout: data.workout as ParsedWorkout, description: data.description };
    }
    return {
      ok: false,
      needsDetail: !!data?.needsDetail,
      message: data?.error || "That workout couldn't be read. Try describing the intervals.",
    };
  } catch (err) {
    console.error('[customWorkout] parse failed', err);
    return { ok: false, needsDetail: false, message: 'Could not reach the workout parser.' };
  }
}

export interface SaveResult {
  ok: boolean;
  workout?: WorkoutDefinition;
  plannedWorkoutId?: string;
  message?: string;
}

/**
 * Persist a parsed workout and schedule it.
 *
 * `plan_id` is left unset: it is nullable, and Postgres treats NULLs as
 * distinct in the `(plan_id, scheduled_date)` unique constraint — so a rider
 * with no active training plan is not a special case and an ad-hoc workout
 * never collides with a planned one.
 */
export async function saveCustomWorkout(input: {
  userId: string;
  workout: ParsedWorkout;
  description: string;
  scheduledDate: string;
}): Promise<SaveResult> {
  const { userId, workout, description, scheduledDate } = input;

  const durationMinutes = Math.max(1, Math.round(estimateMinutes(workout.structure)));

  const { data: template, error: templateError } = await supabase
    .from('workout_templates')
    .insert({
      user_id: userId,
      name: workout.name,
      description,
      workout_type: workout.category,
      duration_minutes: durationMinutes,
      expected_tss: workout.estimatedTSS,
      expected_if: workout.intensityFactor,
      // The structure plus the hints that steer routing. `intervals` is NOT
      // NULL on this table, so this is always populated.
      intervals: {
        structure: workout.structure,
        terrainType: workout.terrainType,
        focusArea: workout.focusArea,
        intensityFactor: workout.intensityFactor,
      },
    })
    .select()
    .single();

  if (templateError || !template) {
    console.error('[customWorkout] template insert failed', templateError);
    return { ok: false, message: 'Could not save that workout.' };
  }

  const { data: planned, error: plannedError } = await supabase
    .from('planned_workouts')
    .insert({
      user_id: userId,
      scheduled_date: scheduledDate,
      name: workout.name,
      description,
      workout_type: workout.category,
      template_id: template.id,
      duration_minutes: durationMinutes,
      target_duration: durationMinutes,
      // Dual-write canonical and legacy per the metrics freeze policy.
      target_rss: workout.estimatedTSS,
      target_tss: workout.estimatedTSS,
      // Vocabulary from migration 101 — this workout came from a coach.
      source: 'coach',
      completed: false,
    })
    .select('*, workout_templates(*)')
    .single();

  if (plannedError || !planned) {
    console.error('[customWorkout] planned insert failed', plannedError);
    return { ok: false, message: 'Saved the workout, but could not schedule it.' };
  }

  const definition = workoutDefinitionFromRow(planned);
  if (!definition) {
    return { ok: false, message: 'Saved, but the workout could not be read back.' };
  }
  return { ok: true, workout: definition, plannedWorkoutId: planned.id };
}

/** Total minutes a structure implies. Mirrors durationFromStructure. */
function estimateMinutes(structure: WorkoutStructure): number {
  const seg = (s: { duration?: number } | null | undefined) =>
    Number.isFinite(Number(s?.duration)) ? Number(s?.duration) : 0;
  let total = seg(structure.warmup) + seg(structure.cooldown);
  for (const node of structure.main ?? []) {
    const block = node as {
      type?: string;
      sets?: number;
      work?: { duration?: number };
      rest?: { duration?: number };
      duration?: number;
    };
    if (block.type === 'repeat') {
      const sets = Number(block.sets) > 0 ? Number(block.sets) : 1;
      total += sets * (seg(block.work) + seg(block.rest));
    } else {
      total += seg(block);
    }
  }
  return total;
}
