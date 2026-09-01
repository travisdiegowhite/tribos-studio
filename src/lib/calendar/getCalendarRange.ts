/**
 * getCalendarRange — THE read path for the training calendar.
 *
 * Every calendar surface goes through this. That is the point: the codebase
 * currently reaches for `planned_workouts` from ~16 places user-scoped and ~17
 * more plan-scoped, with thirteen separate implementations of "what week is
 * it". That divergence is the bug class behind the training header counting an
 * eight-day week while the chart directly beneath it counted seven.
 *
 * Shape follows getTodaySpine: `assembleCalendarRange` is pure so the merging
 * and bucketing is unit-testable without a database, and `getCalendarRange`
 * does the Supabase reads and hands rows to it.
 *
 * Dates are STRING KEYS throughout (YYYY-MM-DD). A bare date string parsed via
 * `new Date()` is UTC midnight, which compares wrong against a locally-built
 * boundary — see `weekRangeKeys` in src/utils/dateUtils.js.
 */

import { supabase } from '../supabase';
import { activityDateKey, toDateKey } from '../../utils/dateUtils';

export type CalendarEntryType = 'workout' | 'race' | 'rest' | 'note';
export type CalendarEntryStatus = 'planned' | 'done' | 'skipped' | 'missed';

export interface CalendarEntryRow {
  id: string;
  user_id: string;
  date: string;
  slot: number;
  type: CalendarEntryType;
  title: string;
  workout_id: string | null;
  workout_type: string | null;
  target_load: number | null;
  target_duration_min: number | null;
  target_distance_km: number | null;
  actual_load: number | null;
  actual_duration_min: number | null;
  actual_distance_km: number | null;
  status: CalendarEntryStatus;
  completed_at: string | null;
  skipped_reason: string | null;
  activity_id: string | null;
  notes: string | null;
  coach_rationale: string | null;
  details: Record<string, unknown> | null;
  provenance: Record<string, unknown> | null;
  source: string;
  plan_id: string | null;
  generation_id: string | null;
  pinned: boolean;
}

export interface CalendarActivityRow {
  id: string;
  start_date: string;
  start_date_local?: string | null;
  name?: string | null;
  sport_type?: string | null;
  type?: string | null;
  moving_time?: number | null;
  distance?: number | null;
  rss?: number | null;
  tss?: number | null;
}

/** One entry, with the activity it was completed by (if any) attached. */
export interface CalendarEntry extends CalendarEntryRow {
  activity: CalendarActivityRow | null;
}

/** One day. `activities` includes rides not linked to any entry. */
export interface CalendarDay {
  dateKey: string;
  entries: CalendarEntry[];
  /** Activities on this day with no entry claiming them — unplanned rides. */
  unplannedActivities: CalendarActivityRow[];
}

export interface CalendarRange {
  from: string;
  to: string;
  entries: CalendarEntry[];
  byDate: Map<string, CalendarDay>;
  /** Every day in [from, to], including empty ones, in order. */
  days: CalendarDay[];
}

/** Inclusive list of YYYY-MM-DD keys from `from` to `to`. */
export function eachDateKey(from: string, to: string): string[] {
  const keys: string[] = [];
  if (!from || !to || to < from) return keys;
  // Step in UTC so DST never adds or drops a day.
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(end)) return keys;
  while (t <= end) {
    keys.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return keys;
}

/**
 * Pure assembly: merge entries with their activities and bucket by day.
 * Exported for tests — no Supabase, no React.
 */
export function assembleCalendarRange(
  from: string,
  to: string,
  entryRows: CalendarEntryRow[],
  activityRows: CalendarActivityRow[],
): CalendarRange {
  const activityById = new Map<string, CalendarActivityRow>();
  for (const a of activityRows) if (a?.id) activityById.set(a.id, a);

  const claimed = new Set<string>();
  const entries: CalendarEntry[] = [...(entryRows ?? [])]
    // (date, slot) is the calendar's natural order and its uniqueness key.
    .sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date < b.date ? -1 : 1))
    .map((row) => {
      const activity = row.activity_id ? activityById.get(row.activity_id) ?? null : null;
      if (activity) claimed.add(activity.id);
      return { ...row, activity };
    });

  const days = new Map<string, CalendarDay>();
  for (const dateKey of eachDateKey(from, to)) {
    days.set(dateKey, { dateKey, entries: [], unplannedActivities: [] });
  }
  /** Days outside [from,to] can't appear, but a row could still arrive dirty. */
  const dayFor = (dateKey: string): CalendarDay | null => days.get(dateKey) ?? null;

  for (const entry of entries) dayFor(entry.date)?.entries.push(entry);

  for (const a of activityRows ?? []) {
    if (!a?.id || claimed.has(a.id)) continue;
    const key = activityDateKey(a);
    if (key) dayFor(key)?.unplannedActivities.push(a);
  }

  return { from, to, entries, byDate: days, days: [...days.values()] };
}

/**
 * Read one athlete's calendar for an inclusive date range.
 *
 * @param userId  the athlete
 * @param from    YYYY-MM-DD (or anything toDateKey accepts), inclusive
 * @param to      YYYY-MM-DD, inclusive
 */
export async function getCalendarRange(
  userId: string,
  from: string,
  to: string,
): Promise<CalendarRange> {
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  const empty = (): CalendarRange =>
    assembleCalendarRange(fromKey ?? '', toKey ?? '', [], []);

  if (!userId || !fromKey || !toKey || toKey < fromKey) return empty();

  // Activities are fetched a day either side: start_date is UTC, and an evening
  // ride can land on the neighbouring UTC day. activityDateKey resolves the
  // athlete's real local day; the widened window just makes sure the row is
  // present to be resolved.
  const [entriesResult, activitiesResult] = await Promise.all([
    supabase
      .from('calendar_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', fromKey)
      .lte('date', toKey)
      .order('date', { ascending: true })
      .order('slot', { ascending: true }),
    supabase
      .from('activities')
      .select('id, start_date, start_date_local, name, sport_type, type, moving_time, distance, rss, tss')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .gte('start_date', `${shiftKey(fromKey, -1)}T00:00:00Z`)
      .lte('start_date', `${shiftKey(toKey, 1)}T23:59:59Z`),
  ]);

  if (entriesResult.error) {
    console.error('getCalendarRange: entries query failed', entriesResult.error.message);
    return empty();
  }
  if (activitiesResult.error) {
    // Non-fatal: the planned side of the calendar is still worth rendering.
    console.warn('getCalendarRange: activities query failed', activitiesResult.error.message);
  }

  return assembleCalendarRange(
    fromKey,
    toKey,
    (entriesResult.data ?? []) as CalendarEntryRow[],
    (activitiesResult.data ?? []) as CalendarActivityRow[],
  );
}

/** Shift a YYYY-MM-DD key by whole days, in UTC. */
function shiftKey(dateKey: string, days: number): string {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(t)) return dateKey;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** A dated thing sitting outside the window currently on screen. */
export interface HorizonEntry {
  id: string;
  date: string;
  type: CalendarEntryType;
  title: string;
}

export interface CalendarHorizon {
  /** How many entries exist after the visible window. */
  countAfter: number;
  /** The next few, soonest first — enough to name one in a banner. */
  next: HorizonEntry[];
  /** Races after the window, which are the thing worth surfacing by name. */
  nextRaces: HorizonEntry[];
}

/**
 * What exists BEYOND the visible window.
 *
 * The calendar shows four weeks, which is the right working view and the wrong
 * horizon for a race season. On 2026-08-25 the coach correctly created nine
 * cyclocross races running Sep 19 → Dec 5; every one of them fell outside the
 * Aug 17 → Sep 13 window, so the athlete looked at their calendar, saw nothing,
 * and reasonably concluded the coach had failed again. The data was perfect and
 * the page gave no sign it existed.
 *
 * A window with no edge indicator is a trap: absence of content and absence of
 * view are indistinguishable to the person looking. This is the edge indicator.
 */
export async function getCalendarHorizon(
  userId: string,
  afterDateKey: string,
  limit = 24,
): Promise<CalendarHorizon> {
  const empty: CalendarHorizon = { countAfter: 0, next: [], nextRaces: [] };
  const afterKey = toDateKey(afterDateKey);
  if (!userId || !afterKey) return empty;

  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, date, type, title')
    .eq('user_id', userId)
    .gt('date', afterKey)
    .neq('status', 'skipped')
    .order('date', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('getCalendarHorizon failed:', error.message);
    return empty;
  }

  const rows = (data ?? []) as HorizonEntry[];
  return {
    countAfter: rows.length,
    next: rows.slice(0, 3),
    nextRaces: rows.filter((r) => r.type === 'race').slice(0, 3),
  };
}
