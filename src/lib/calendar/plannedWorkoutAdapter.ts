/**
 * Present a `calendar_entries` row in the shape `TrainingCalendar.jsx` renders.
 *
 * WHY AN ADAPTER RATHER THAN A REWRITE
 * ------------------------------------
 * TrainingCalendar.jsx is 2,114 lines and almost none of it is the problem.
 * The month grid, day cells, weather, drag-and-drop, workout picker, week
 * stats and modals are all data-source-agnostic — they read a flat list of
 * objects with `planned_workouts` field names. Renaming those field reads
 * across the file would be a large, risky diff on the athlete's primary
 * surface for no behavioural gain.
 *
 * So the row shape is translated once, here, and the component is left alone.
 * The plan-ownership guards it also carries are a separate change; this file
 * only concerns where rows come from.
 *
 * THE FIELD MAP
 * -------------
 *   date                 -> scheduled_date
 *   title                -> name
 *   target_load          -> target_rss / target_tss   (dual, per CLAUDE.md)
 *   target_duration_min  -> target_duration
 *   target_distance_km   -> target_distance_km  (same name, same unit, passthrough)
 *   actual_load          -> actual_rss / actual_tss
 *   actual_duration_min  -> actual_duration
 *   status === 'done'    -> completed
 *
 * `week_number` and `day_of_week` are DERIVED, never carried. On the old table
 * each row's week was measured from its own plan's start date, so three plans'
 * "Week 4" collided in the same bucket — which is why TrainingCalendar.jsx:417
 * already abandoned week_number and keys its stats by Monday date instead.
 * Deriving them from the date is strictly more correct and keeps any remaining
 * reader honest.
 *
 * Races come through as entries too (`type: 'race'`). That is deliberate:
 * migration 115 copied every `race_goals` row into `calendar_entries`, so a
 * calendar reading BOTH tables shows each race twice. `race_goals` keeps
 * owning priority, goal time and target TFI for the Race tab; the calendar
 * reads races from here.
 */

import type { CalendarEntry, CalendarEntryRow } from './getCalendarRange';

/** The row shape TrainingCalendar.jsx renders. */
export interface PlannedWorkoutShape {
  id: string;
  user_id: string;
  scheduled_date: string;
  name: string;
  workout_id: string | null;
  workout_type: string | null;
  target_rss: number | null;
  target_tss: number | null;
  target_duration: number | null;
  /**
   * Both tables call this the same thing and both mean kilometres, so it
   * passes straight through. Distance-suffixed per the unit convention.
   */
  target_distance_km: number | null;
  actual_rss: number | null;
  actual_tss: number | null;
  actual_duration: number | null;
  actual_distance_km: number | null;
  completed: boolean;
  completed_at: string | null;
  skipped_reason: string | null;
  plan_id: string | null;
  activity_id: string | null;
  notes: string | null;
  week_number: number | null;
  day_of_week: number;
  original_scheduled_date: string | null;
  original_workout_id: string | null;
  adjustment_reason: string | null;
  /** Passed through so the grid can style a race differently from a session. */
  entry_type: CalendarEntry['type'];
  /** Passed through so a generator knows not to overwrite an athlete's edit. */
  pinned: boolean;
  slot: number;
}

/** Day of week for a YYYY-MM-DD key, 0=Sun, stepped in UTC so DST cannot shift it. */
function dayOfWeek(dateKey: string): number {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : new Date(t).getUTCDay();
}

/**
 * Week number relative to a plan start, 1-based. Returns null with no plan —
 * the calendar renders fine without it, and inventing a number here is how the
 * old model produced colliding "Week 4"s.
 */
function weekNumber(dateKey: string, planStart?: string | null): number | null {
  if (!planStart) return null;
  const a = Date.parse(`${planStart}T00:00:00Z`);
  const b = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000 / 7) + 1;
}

/**
 * @param entry      A calendar_entries row (optionally with its activity attached).
 * @param planStart  The active plan's start_date, for week_number only. Optional
 *                   by design: nothing here requires a plan to exist.
 */
export function toPlannedWorkoutShape(
  entry: CalendarEntryRow | CalendarEntry,
  planStart?: string | null,
): PlannedWorkoutShape {
  const provenance = (entry.provenance ?? {}) as Record<string, unknown>;
  const asString = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v : null;

  return {
    id: entry.id,
    user_id: entry.user_id,
    scheduled_date: entry.date,
    name: entry.title,
    workout_id: entry.workout_id,
    workout_type: entry.workout_type,
    // Dual-write convention applies to reads too: callers fall back
    // `target_rss ?? target_tss`, so both carry the same value.
    target_rss: entry.target_load,
    target_tss: entry.target_load,
    target_duration: entry.target_duration_min,
    target_distance_km: entry.target_distance_km,
    actual_rss: entry.actual_load,
    actual_tss: entry.actual_load,
    actual_duration: entry.actual_duration_min,
    actual_distance_km: entry.actual_distance_km,
    completed: entry.status === 'done',
    completed_at: entry.completed_at,
    skipped_reason: entry.skipped_reason,
    plan_id: entry.plan_id,
    activity_id: entry.activity_id,
    notes: entry.notes,
    week_number: weekNumber(entry.date, planStart),
    day_of_week: dayOfWeek(entry.date),
    original_scheduled_date: asString(provenance.original_date),
    original_workout_id: asString(provenance.original_workout_id),
    adjustment_reason: asString(provenance.adjustment_reason),
    entry_type: entry.type,
    pinned: entry.pinned,
    slot: entry.slot,
  };
}

/** Map a range of entries, newest-first ordering preserved from the caller. */
export function toPlannedWorkoutShapes(
  entries: Array<CalendarEntryRow | CalendarEntry>,
  planStart?: string | null,
): PlannedWorkoutShape[] {
  return entries.map((e) => toPlannedWorkoutShape(e, planStart));
}
