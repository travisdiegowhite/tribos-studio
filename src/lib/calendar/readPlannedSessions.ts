/**
 * fetchPlannedSessions — one query for every surface that used to select from
 * `planned_workouts`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Step 2 repointed the /train grid at `calendar_entries` and stopped there, so
 * for a while the calendar and every other surface read different tables. That
 * is not a cosmetic split: production carried 45 recent entries — a whole
 * cyclocross season plus a generated block — that existed only in
 * `calendar_entries`, so /today and both dashboards showed the athlete a
 * schedule missing most of their autumn. Repointing each reader by hand would
 * have meant ten separate field sweeps across `.select()` strings, which is
 * exactly the divergence `getCalendarRange`'s header complains about.
 *
 * So: one reader, returning rows in the SHAPE the old callers already destructure
 * (`scheduled_date`, `name`, `target_rss`, `completed`, …) via
 * `plannedWorkoutAdapter`. A caller swaps its query for one call and leaves the
 * rest of its code alone.
 *
 * RACES ARE EXCLUDED BY DEFAULT. Migration 115 copied every `race_goals` row
 * into `calendar_entries`, and most of these callers already read `race_goals`
 * separately — including a race here would show it twice and add its load to a
 * training total. Ask for `includeRaces` only if you are NOT also reading
 * `race_goals`.
 */

import { supabase } from '../supabase';
import { toDateKey } from '../../utils/dateUtils';
import { toPlannedWorkoutShapes } from './plannedWorkoutAdapter';
import type { PlannedWorkoutShape } from './plannedWorkoutAdapter';
import type { CalendarEntryRow } from './getCalendarRange';

export type { PlannedWorkoutShape };

export interface PlannedSessionQuery {
  /** Inclusive lower bound, YYYY-MM-DD. Omit for no lower bound. */
  from?: string | null;
  /** Inclusive upper bound, YYYY-MM-DD. Omit for no upper bound. */
  to?: string | null;
  /** Cap on rows returned. */
  limit?: number;
  /** Restrict to one plan's entries. A plan is provenance here, not ownership. */
  planId?: string | null;
  /** Include `type: 'race'` entries. Off by default — see the note above. */
  includeRaces?: boolean;
  /** Include entries already marked done. Defaults to true. */
  includeCompleted?: boolean;
  /** Only these entry types, overriding includeRaces. */
  types?: CalendarEntryRow['type'][];
  /** Date order. Defaults to ascending. */
  ascending?: boolean;
  /**
   * The active plan's start_date, used ONLY to derive `week_number`. Null (the
   * default) leaves week_number null, which every current caller tolerates —
   * inventing a number without a plan is how the old model produced colliding
   * "Week 4"s across three plans.
   */
  planStart?: string | null;
}

const SELECT_COLUMNS =
  'id, user_id, date, slot, type, title, workout_id, workout_type, ' +
  'target_load, target_duration_min, target_distance_km, ' +
  'actual_load, actual_duration_min, actual_distance_km, ' +
  'status, completed_at, skipped_reason, activity_id, notes, coach_rationale, ' +
  'details, provenance, source, plan_id, generation_id, pinned';

/**
 * @returns Rows in the legacy `planned_workouts` field shape, or `[]` on error.
 *   Errors are logged, never thrown — every call site here renders a surface
 *   that must survive a failed read, and each one already treated a query error
 *   as an empty list.
 */
export async function fetchPlannedSessions(
  userId: string | null | undefined,
  query: PlannedSessionQuery = {},
): Promise<PlannedWorkoutShape[]> {
  if (!userId) return [];

  const {
    from = null,
    to = null,
    limit,
    planId = null,
    includeRaces = false,
    includeCompleted = true,
    types,
    ascending = true,
    planStart = null,
  } = query;

  let q = supabase
    .from('calendar_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId);

  const fromKey = from ? toDateKey(from) : null;
  const toKey = to ? toDateKey(to) : null;
  if (fromKey) q = q.gte('date', fromKey);
  if (toKey) q = q.lte('date', toKey);
  if (planId) q = q.eq('plan_id', planId);
  if (types && types.length > 0) q = q.in('type', types);
  else if (!includeRaces) q = q.neq('type', 'race');
  if (!includeCompleted) q = q.neq('status', 'done');

  // Slot is the tiebreaker within a day, the way the calendar renders them.
  q = q.order('date', { ascending }).order('slot', { ascending: true });
  if (typeof limit === 'number') q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error('fetchPlannedSessions failed:', error.message);
    return [];
  }
  return toPlannedWorkoutShapes((data ?? []) as unknown as CalendarEntryRow[], planStart);
}

/**
 * The single session on a date, or null. Slot 0 wins when a day holds several,
 * matching how the calendar orders a double day.
 */
export async function fetchSessionOn(
  userId: string | null | undefined,
  dateKey: string,
  query: Omit<PlannedSessionQuery, 'from' | 'to' | 'limit'> = {},
): Promise<PlannedWorkoutShape | null> {
  const rows = await fetchPlannedSessions(userId, {
    ...query,
    from: dateKey,
    to: dateKey,
    limit: 1,
  });
  return rows[0] ?? null;
}

/**
 * One entry by id, in the legacy shape. Scoped to the athlete as well as the
 * id: RLS already stops a cross-athlete read, but an explicit `user_id` filter
 * turns "someone else's row" into a plain null rather than an RLS refusal a
 * caller has to interpret.
 */
export async function fetchEntryById(
  userId: string | null | undefined,
  entryId: string,
): Promise<PlannedWorkoutShape | null> {
  if (!userId || !entryId) return null;

  const { data, error } = await supabase
    .from('calendar_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('id', entryId)
    .maybeSingle();

  if (error) {
    console.error('fetchEntryById failed:', error.message);
    return null;
  }
  if (!data) return null;
  return toPlannedWorkoutShapes([data as unknown as CalendarEntryRow])[0] ?? null;
}
