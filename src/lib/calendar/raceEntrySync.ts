/**
 * raceEntrySync — keeps a race's `calendar_entries` row in step with its
 * `race_goals` row.
 *
 * WHY THIS EXISTS
 * ---------------
 * A race lives in two tables. `race_goals` owns the Race tab (priority, goal
 * time, results); `calendar_entries` owns the calendar (migration 115 copied
 * every race across, CARRYING ITS ID, and the coach's generate_block writes
 * races there directly). The calendar renders races from `calendar_entries`
 * first and only falls back to `race_goals` for a date it does not cover.
 *
 * `RaceGoalModal` used to write `race_goals` alone. Deleting a race therefore
 * removed the Race-tab row, toasted "removed", and left the calendar row —
 * the calendar was reading the table nobody had touched. Editing a race's date
 * had the same shape: the toast said updated, the calendar did not move.
 *
 * THE LINK IS THE ID. Migration 115 carried `race_goals.id` across as
 * `calendar_entries.id`, so the same uuid names the race in both tables. New
 * races keep that invariant: the race_goals row is inserted first and its id
 * is reused for the calendar row. A coach-created race that has no
 * `race_goals` row at all is still reachable here by that same id.
 *
 * The column mapping below mirrors migration 115's race branch, so a row
 * written here is indistinguishable from a backfilled one.
 */

import { supabase } from '../supabase';
import { toDateKey } from '../../utils/dateUtils';
import { nextFreeSlot, type MutationResult } from './calendarMutations';
import type { CalendarEntryRow } from './getCalendarRange';

/** The subset of a `race_goals` row the calendar mirrors. */
export interface RaceGoalFields {
  name: string;
  race_date: string;
  race_type?: string | null;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  location?: string | null;
  priority?: string | null;
  goal_time_minutes?: number | null;
  goal_power_watts?: number | null;
  goal_placement?: string | null;
  notes?: string | null;
  course_description?: string | null;
  route_id?: string | null;
}

const fail = (error: string): MutationResult => ({ success: false, error });

/** Drop null/undefined so `details` matches migration 115's jsonb_strip_nulls. */
function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
  );
}

/**
 * The calendar_entries columns a race carries, derived from its race_goals
 * fields. Same mapping as migration 115 so backfilled and modal-written rows
 * read identically.
 */
export function raceGoalToEntryFields(race: RaceGoalFields) {
  return {
    type: 'race' as const,
    title: race.name?.trim() || 'Race',
    workout_id: null,
    workout_type: race.race_type ?? null,
    target_load: null,
    target_duration_min: race.goal_time_minutes ?? null,
    target_distance_km: race.distance_km ?? null,
    notes: race.notes ?? null,
    coach_rationale: null,
    details: stripNulls({
      priority: race.priority,
      race_type: race.race_type,
      distance_km: race.distance_km,
      elevation_gain_m: race.elevation_gain_m,
      location: race.location,
      course_description: race.course_description,
      goal_time_minutes: race.goal_time_minutes,
      goal_power_watts: race.goal_power_watts,
      goal_placement: race.goal_placement,
      route_id: race.route_id,
    }),
  };
}

/**
 * Write the calendar row for a race, creating it if the race has none yet.
 *
 * `raceGoalId` is the race_goals id AND the calendar_entries id. If the row
 * exists it is updated in place; if its date changed it takes the next free
 * slot on the new day (the vacated slot is left empty, as moveEntry does). If
 * no row exists — a race added before this sync shipped, or one whose
 * calendar row was removed some other way — one is inserted under that id.
 *
 * Always pinned: a race is the athlete's own intent and a generator must
 * never move or overwrite it.
 */
export async function syncRaceEntry(
  userId: string,
  raceGoalId: string,
  race: RaceGoalFields,
): Promise<MutationResult> {
  if (!userId) return fail('Not signed in');
  if (!raceGoalId) return fail('Missing race');
  const dateKey = toDateKey(race.race_date);
  if (!dateKey) return fail('A valid race date is required');

  const fields = raceGoalToEntryFields(race);

  try {
    const { data: existing, error: readError } = await supabase
      .from('calendar_entries')
      .select('id, date, slot')
      .eq('id', raceGoalId)
      .eq('user_id', userId)
      .maybeSingle();

    if (readError) throw readError;

    if (existing) {
      const moved = existing.date !== dateKey;
      const slot = moved ? await nextFreeSlot(userId, dateKey) : existing.slot;
      const { data, error } = await supabase
        .from('calendar_entries')
        .update({ ...fields, date: dateKey, slot, pinned: true })
        .eq('id', raceGoalId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: data as CalendarEntryRow };
    }

    const slot = await nextFreeSlot(userId, dateKey);
    const { data, error } = await supabase
      .from('calendar_entries')
      .insert({
        id: raceGoalId,
        user_id: userId,
        date: dateKey,
        slot,
        ...fields,
        status: 'planned',
        source: 'manual',
        plan_id: null,
        generation_id: null,
        pinned: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not put the race on the calendar';
    console.error('syncRaceEntry failed', message);
    return fail(message);
  }
}

/**
 * Remove a race's calendar row. A no-op (still a success) when the race has
 * no calendar row, so it is safe to call before deleting the race_goals row
 * and safe to retry after a partial failure.
 */
export async function deleteRaceEntry(
  userId: string,
  raceGoalId: string,
): Promise<MutationResult<null>> {
  if (!userId) return { success: false, error: 'Not signed in' };
  if (!raceGoalId) return { success: false, error: 'Missing race' };

  try {
    const { error } = await supabase
      .from('calendar_entries')
      .delete()
      .eq('id', raceGoalId)
      .eq('user_id', userId)
      .eq('type', 'race');

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not remove the race from the calendar';
    console.error('deleteRaceEntry failed', message);
    return { success: false, error: message };
  }
}
