/**
 * Season planner writes (browser, under RLS).
 *
 * Races are race_goals rows mirrored to calendar_entries, exactly as
 * RaceGoalModal writes them: the race_goals row first, then syncRaceEntry with
 * the FULL row (it rebuilds the calendar copy's details from what it is
 * given, so a partial row would wipe priority, distance and the rest).
 *
 * Every function reports instead of throwing, so the caller can tell the
 * athlete exactly what failed — a silent write is the bug the calendar rebuild
 * exists to remove (CLAUDE.md, "Every write reports").
 */

import { supabase } from '../supabase';
import { deleteRaceEntry, syncRaceEntry, type RaceGoalFields } from '../calendar/raceEntrySync';
import type { MutationResult } from '../calendar/calendarMutations';
import type { DiscussedSnapshot } from './coachPayload';
import type { SeasonEventDraft } from './edits';
import type { RaceGoalRow } from './view';

/** race_goals columns the season planner reads and writes back. */
export const RACE_GOAL_COLUMNS =
  'id, name, race_date, priority, race_type, distance_km, elevation_gain_m, goal_time_minutes, status, ' +
  'location, course_description, goal_power_watts, goal_placement, notes, route_id';

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** The race_goals columns of a row, ready to write. */
function raceGoalValues(row: RaceGoalRow) {
  return {
    name: row.name?.trim() || 'Race',
    race_date: String(row.race_date).slice(0, 10),
    priority: row.priority ?? 'B',
    race_type: row.race_type ?? 'road_race',
    distance_km: num(row.distance_km),
    elevation_gain_m: num(row.elevation_gain_m),
    goal_time_minutes: num(row.goal_time_minutes),
    location: row.location ?? null,
    course_description: row.course_description ?? null,
    goal_power_watts: num(row.goal_power_watts),
    goal_placement: row.goal_placement ?? null,
    notes: row.notes ?? null,
    route_id: row.route_id ?? null,
    is_focus: Boolean(row.is_focus),
  };
}

function toSyncFields(values: ReturnType<typeof raceGoalValues>): RaceGoalFields {
  const { is_focus: _focus, ...fields } = values;
  return fields;
}

/**
 * Save a race the athlete edited. `insert` re-creates a race with its old id
 * (undoing a remove); otherwise the existing row is updated.
 */
export async function saveRace(userId: string, row: RaceGoalRow, insert = false): Promise<MutationResult<null>> {
  const values = raceGoalValues(row);
  const { error } = insert
    ? await supabase.from('race_goals').insert({ id: row.id, user_id: userId, status: row.status ?? 'upcoming', ...values })
    : await supabase.from('race_goals').update(values).eq('id', row.id).eq('user_id', userId);
  if (error) return { success: false, error: `Couldn't save ${values.name}: ${error.message}` };

  const synced = await syncRaceEntry(userId, row.id, toSyncFields(values));
  if (!synced.success) {
    return { success: false, error: `Saved ${values.name}, but the calendar didn't update: ${synced.error ?? 'unknown error'}` };
  }
  return { success: true, data: null };
}

/** Remove a race: the calendar copy first, then the race itself (RaceGoalModal's order). */
export async function deleteRace(userId: string, row: RaceGoalRow): Promise<MutationResult<null>> {
  const name = row.name?.trim() || 'Race';
  const unsynced = await deleteRaceEntry(userId, row.id);
  if (!unsynced.success) return { success: false, error: `Couldn't remove ${name} from the calendar: ${unsynced.error ?? 'unknown error'}` };
  const { error } = await supabase.from('race_goals').delete().eq('id', row.id).eq('user_id', userId);
  if (error) return { success: false, error: `Couldn't remove ${name}: ${error.message}` };
  return { success: true, data: null };
}

/**
 * The athlete's season record (the change log's anchor and, later, the coach's
 * baseline): their latest season_plans row, created on the first edit. The
 * view itself keeps a rolling window until fixed seasons are decided.
 */
export async function ensureSeasonPlan(userId: string, startDate: string, weeks: number): Promise<MutationResult<string>> {
  const { data: existing, error: readError } = await supabase
    .from('season_plans')
    .select('id')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1);
  if (readError) return { success: false, error: readError.message };
  if (existing && existing.length > 0) return { success: true, data: (existing[0] as { id: string }).id };

  const { data, error } = await supabase
    .from('season_plans')
    .insert({ user_id: userId, start_date: startDate, weeks })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'No season plan returned' };
  return { success: true, data: (data as { id: string }).id };
}

/** Append change-log rows. Best effort: the race is already saved, so a failure is logged, not shown. */
export async function logSeasonEvents(userId: string, planId: string, drafts: SeasonEventDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const { error } = await supabase.from('season_plan_events').insert(
    drafts.map((d) => ({
      plan_id: planId,
      user_id: userId,
      // A removed race no longer exists to reference; its id stays in `before`.
      race_id: d.kind === 'remove' ? null : d.raceId,
      kind: d.kind,
      before: d.before,
      after: d.after,
    })),
  );
  if (error) console.error('[season] could not log plan events:', error.message);
}

/**
 * After a coach reply: this version of the season becomes the baseline the
 * next conversation is compared with, and the one Reset puts races back to.
 */
export async function saveDiscussedSnapshot(
  userId: string,
  planId: string,
  snapshot: DiscussedSnapshot,
): Promise<MutationResult<string>> {
  const discussedAt = new Date().toISOString();
  const { error } = await supabase
    .from('season_plans')
    .update({ discussed_snapshot: snapshot, discussed_at: discussedAt })
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) return { success: false, error: `Couldn't save what you discussed: ${error.message}` };
  return { success: true, data: discussedAt };
}
