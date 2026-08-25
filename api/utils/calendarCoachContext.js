/**
 * The CALENDAR block the coach reads, and the handle map it writes through.
 *
 * Paired with calendarChangeTool.js: the handles printed here are the only
 * addresses the model is given, and the map returned alongside is the only way
 * back to a row id. The model never sees a uuid in either direction.
 *
 * This exists because the coach's calendar context has been broken in two
 * different ways already. `coachContextEnrichment.js` selected a column that
 * did not exist and swallowed the 42703, so the coach silently lost the
 * athlete's schedule on every call; and even working, it read
 * `planned_workouts`, which the rebuilt calendar no longer is. Errors here are
 * logged and surfaced as an explicit "calendar unavailable" line rather than
 * an empty block, because an empty calendar and a failed read look identical
 * to the model and it will confidently plan into the gap.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { buildHandleMap, entryHandle } from './calendarChangeTool.js';

/** Days of history and future the coach sees. Past matters for "what did I just do". */
const DAYS_BACK = 14;
const DAYS_FORWARD = 120; // long enough to hold a whole race season

function shiftDays(dateKey, days) {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Today in the athlete's timezone, as YYYY-MM-DD. */
export function todayInTimezone(timezone, now = new Date()) {
  try {
    return now.toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Fetch the athlete's calendar window.
 *
 * @returns {Promise<{ok: boolean, entries: Array, from: string, to: string, error?: string}>}
 */
export async function fetchCalendarWindow(userId, timezone, now = new Date()) {
  const today = todayInTimezone(timezone, now);
  const from = shiftDays(today, -DAYS_BACK);
  const to = shiftDays(today, DAYS_FORWARD);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, date, slot, type, title, workout_type, target_load, target_duration_min, target_distance_km, status, pinned, notes, coach_rationale')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('slot', { ascending: true });

  if (error) {
    console.error('fetchCalendarWindow failed:', error.message);
    return { ok: false, entries: [], from, to, error: error.message };
  }
  return { ok: true, entries: data || [], from, to, today };
}

/**
 * Render the window as the CALENDAR block, one line per entry.
 *
 * Format is deliberately terse and columnar rather than JSON — the model reads
 * it far more reliably, and it keeps a 130-day window inside a sane token cost.
 *
 *   2026-09-26  sess_1af3bc12  race     The Rad                  [planned]
 *   2026-08-29  sess_9c0e12aa  workout  Sweet Spot 3x12  78rss    [planned] PINNED
 */
export function formatCalendarBlock(window) {
  if (!window.ok) {
    return `=== CALENDAR ===
UNAVAILABLE — the calendar could not be read this turn (${window.error || 'unknown error'}).
Do NOT guess at what is scheduled, and do NOT call calendar_change: you cannot
see what you would be changing. Tell the athlete their calendar could not be
loaded and ask them to try again.`;
  }

  if (window.entries.length === 0) {
    return `=== CALENDAR (${window.from} → ${window.to}) ===
(empty — nothing scheduled in this window)

The athlete has an empty calendar. This is a normal state, not an error: no
training plan is required for a calendar to exist. Use calendar_change to add
whatever you and the athlete agree on.`;
  }

  const lines = window.entries.map((e) => {
    const bits = [
      e.date,
      entryHandle(e.id),
      (e.type || 'workout').padEnd(7),
      (e.title || '(untitled)').slice(0, 40).padEnd(40),
    ];
    const load = e.target_load ? `${Math.round(e.target_load)}rss` : '';
    const dur = e.target_duration_min ? `${e.target_duration_min}min` : '';
    const dist = e.target_distance_km ? `${e.target_distance_km}km` : '';
    bits.push([load, dur, dist].filter(Boolean).join(' ').padEnd(18));
    bits.push(`[${e.status}]`);
    if (e.pinned) bits.push('PINNED');
    return bits.join('  ').trimEnd();
  });

  return `=== CALENDAR (${window.from} → ${window.to}, today is ${window.today}) ===
${lines.join('\n')}

Address these entries by their sess_ handle in calendar_change — never by date
or day name. PINNED means the athlete has already made a decision about that
entry: you may still propose changing it, but the server will require their
approval rather than applying it.`;
}

/**
 * One call: fetch, format, and return the handle map for write-back.
 *
 * @returns {Promise<{block: string, byHandle: Map, ambiguous: Set, ok: boolean, entries: Array}>}
 */
export async function buildCalendarContext(userId, timezone, now = new Date()) {
  const window = await fetchCalendarWindow(userId, timezone, now);
  const { byHandle, ambiguous } = buildHandleMap(window.entries);
  return {
    block: formatCalendarBlock(window),
    byHandle,
    ambiguous,
    ok: window.ok,
    entries: window.entries,
  };
}
