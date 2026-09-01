/**
 * The server's read path for the training calendar.
 *
 * Counterpart to `src/lib/calendar/readPlannedSessions.ts`, and deliberately a
 * separate module rather than an import of it: that one binds the BROWSER
 * Supabase singleton, which carries the athlete's session and is subject to
 * RLS. This one runs on the service-role client, where RLS does not apply and
 * `user_id` scoping is load-bearing rather than belt-and-braces. Every query
 * below filters on `user_id`.
 *
 * WHY IT RETURNS LEGACY FIELD NAMES
 * ---------------------------------
 * Seventeen files under `api/` selected from `planned_workouts` — the coach's
 * own context, the temporal anchor, the check-in engine, the deviation
 * processor, EFI. Rewriting each one's field reads would be seventeen chances
 * to miss a `?? target_tss` fallback. So the row shape is translated once,
 * here, into the names those files already destructure, exactly as the
 * frontend adapter does.
 *
 * RACES ARE EXCLUDED BY DEFAULT. Migration 115 copied every `race_goals` row
 * into `calendar_entries`, and most of these callers read `race_goals`
 * separately — including a race here would count it twice and add its load to
 * a training total. Pass `includeRaces` only if you are NOT also reading
 * `race_goals`.
 *
 * Uses the shared admin singleton per CLAUDE.md — there is no `createClient` in
 * this file, and there must not be.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

const SELECT_COLUMNS =
  'id, user_id, date, slot, type, title, workout_id, workout_type, ' +
  'target_load, target_duration_min, target_distance_km, ' +
  'actual_load, actual_duration_min, actual_distance_km, ' +
  'status, completed_at, skipped_reason, activity_id, notes, coach_rationale, ' +
  'details, provenance, source, plan_id, generation_id, pinned';

/** Day of week for a YYYY-MM-DD key, 0=Sun, stepped in UTC so DST cannot shift it. */
function dayOfWeek(dateKey) {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : new Date(t).getUTCDay();
}

/**
 * Week number relative to a plan start, 1-based. Null with no plan — the
 * callers all tolerate it, and inventing a number here is how the old model
 * produced three colliding "Week 4"s across three plans.
 */
function weekNumber(dateKey, planStart) {
  if (!planStart) return null;
  const a = Date.parse(`${planStart}T00:00:00Z`);
  const b = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000 / 7) + 1;
}

/**
 * One `calendar_entries` row in the `planned_workouts` field shape.
 *
 * Kept in step with src/lib/calendar/plannedWorkoutAdapter.ts. The load and
 * duration fields are emitted under BOTH the canonical and legacy names,
 * because callers here read `target_rss ?? target_tss` and would otherwise get
 * undefined from one side of that fallback.
 */
export function toLegacyShape(entry, planStart = null) {
  if (!entry) return null;
  const provenance = entry.provenance ?? {};
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);

  return {
    id: entry.id,
    user_id: entry.user_id,
    plan_id: entry.plan_id,
    scheduled_date: entry.date,
    name: entry.title,
    workout_id: entry.workout_id,
    workout_type: entry.workout_type,
    target_rss: entry.target_load,
    target_tss: entry.target_load,
    target_duration: entry.target_duration_min,
    duration_minutes: entry.target_duration_min,
    target_distance_km: entry.target_distance_km,
    actual_rss: entry.actual_load,
    actual_tss: entry.actual_load,
    actual_duration: entry.actual_duration_min,
    actual_distance_km: entry.actual_distance_km,
    completed: entry.status === 'done',
    completed_at: entry.completed_at,
    skipped_reason: entry.skipped_reason,
    activity_id: entry.activity_id,
    notes: entry.notes,
    week_number: weekNumber(entry.date, planStart),
    day_of_week: dayOfWeek(entry.date),
    original_scheduled_date: str(provenance.original_date),
    original_workout_id: str(provenance.original_workout_id),
    adjustment_reason: str(provenance.adjustment_reason),
    entry_type: entry.type,
    status: entry.status,
    pinned: entry.pinned,
    slot: entry.slot,
  };
}

/**
 * @param {string} userId  Verified athlete id — NEVER taken from model output.
 * @param {object} [query]
 * @param {string|null} [query.from]  Inclusive lower bound, YYYY-MM-DD.
 * @param {string|null} [query.to]    Inclusive upper bound, YYYY-MM-DD.
 * @param {number} [query.limit]
 * @param {string|null} [query.planId]  Restrict to one plan's entries.
 * @param {boolean} [query.includeRaces=false]
 * @param {boolean} [query.includeCompleted=true]
 * @param {string[]} [query.types]  Explicit type list, overriding includeRaces.
 * @param {boolean} [query.ascending=true]
 * @param {string|null} [query.planStart]  For week_number only.
 * @returns {Promise<Array>} Rows in the legacy field shape, or [] on error.
 *   Errors are logged, never thrown: every caller renders a coaching surface
 *   that has to survive a failed read, and each already treated an error as an
 *   empty list.
 */
export async function fetchPlannedSessions(userId, query = {}) {
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

  const supabase = getSupabaseAdmin();
  let q = supabase.from('calendar_entries').select(SELECT_COLUMNS).eq('user_id', userId);

  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  if (planId) q = q.eq('plan_id', planId);
  if (Array.isArray(types) && types.length > 0) q = q.in('type', types);
  else if (!includeRaces) q = q.neq('type', 'race');
  if (!includeCompleted) q = q.neq('status', 'done');

  q = q.order('date', { ascending }).order('slot', { ascending: true });
  if (typeof limit === 'number') q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error('fetchPlannedSessions failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => toLegacyShape(row, planStart));
}

/** The session on a date, or null. Slot 0 wins when a day holds several. */
export async function fetchSessionOn(userId, dateKey, query = {}) {
  const rows = await fetchPlannedSessions(userId, { ...query, from: dateKey, to: dateKey, limit: 1 });
  return rows[0] ?? null;
}

/**
 * One entry by id, scoped to the athlete.
 *
 * The scoping is not decorative here: this runs on the service-role client,
 * so an unscoped `.eq('id', ...)` would happily return another athlete's row
 * when an id arrives from anywhere but a query we made ourselves.
 */
export async function fetchEntryById(userId, entryId, planStart = null) {
  if (!userId || !entryId) return null;

  const supabase = getSupabaseAdmin();
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
  return toLegacyShape(data, planStart);
}

/** The entry an activity is linked to, if any. */
export async function fetchEntryByActivityId(userId, activityId) {
  if (!userId || !activityId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .limit(1);

  if (error) {
    console.error('fetchEntryByActivityId failed:', error.message);
    return null;
  }
  return toLegacyShape((data ?? [])[0] ?? null);
}
