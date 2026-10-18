/**
 * The athlete's races, read from the CALENDAR — the coach's source of truth
 * for "what's next" and "what just happened".
 *
 * Races used to be read from `race_goals` alone, filtered on
 * `status = 'upcoming'`. Two things broke that:
 *   - Nothing ever completes a race_goal, so a past race stays 'upcoming'
 *     forever; readers without a date filter picked last month's A race as the
 *     goal event.
 *   - The coach's own `calendar_change` writes races to `calendar_entries`
 *     only. A whole cyclocross season lived there, invisible to every
 *     race_goals reader, so NEXT_A_RACE skipped it and named a race months out.
 *
 * So: every `calendar_entries` row of type 'race' is a race (migration 115 and
 * raceEntrySync keep `race_goals` rows mirrored there under the SAME id), and
 * `race_goals` only contributes detail columns by id — plus any upcoming row
 * that somehow has no calendar twin. Past vs upcoming is decided by DATE only;
 * no status column is trusted for it.
 *
 * Service-role reads: every query is scoped by `user_id`.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { fetchPlannedSessions } from './calendarRead.js';

const DAY_MS = 86_400_000;
const RECENT_DAYS = 30;
const HORIZON_DAYS = 365;
const DEAD_GOAL_STATUSES = new Set(['cancelled', 'dns']);

const GOAL_COLUMNS =
  'id, name, race_date, race_type, priority, status, distance_km, elevation_gain_m, goal_time_minutes, goal_power_watts';

function addDays(dateStr, days) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function upper(v) {
  return typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null;
}

/**
 * Merge calendar race entries (legacy shape, from fetchPlannedSessions) with
 * race_goals rows into one list in the race_goals field shape every coach
 * builder already reads. Pure — exported for tests.
 *
 * @returns {{ upcoming: Array, recent: Array }} each sorted by date ascending
 *   (`recent` most recent first).
 */
export function mergeRaces(calendarRaces, goalRows, todayStr, { recentDays = RECENT_DAYS } = {}) {
  const goalsById = new Map((goalRows || []).map((g) => [g.id, g]));
  const seen = new Set();
  const races = [];

  for (const e of calendarRaces || []) {
    if (!e?.scheduled_date) continue;
    const goal = goalsById.get(e.id) || null;
    const details = e.details || {};
    seen.add(e.id);
    if (e.status === 'skipped') continue;
    if (goal && DEAD_GOAL_STATUSES.has(goal.status)) continue;
    races.push({
      id: e.id,
      name: goal?.name || e.name || 'Race',
      race_date: e.scheduled_date,
      race_type: goal?.race_type ?? details.race_type ?? null,
      priority: upper(goal?.priority) ?? upper(details.priority),
      distance_km: goal?.distance_km ?? details.distance_km ?? null,
      elevation_gain_m: goal?.elevation_gain_m ?? details.elevation_gain_m ?? null,
      goal_time_minutes: goal?.goal_time_minutes ?? details.goal_time_minutes ?? null,
      goal_power_watts: goal?.goal_power_watts ?? details.goal_power_watts ?? null,
      sport: e.sport ?? null,
      done: e.status === 'done',
    });
  }

  // A race_goal with no calendar twin (sync failed, or pre-115 data) still counts.
  for (const g of goalRows || []) {
    if (seen.has(g.id) || !g.race_date || DEAD_GOAL_STATUSES.has(g.status)) continue;
    races.push({
      id: g.id,
      name: g.name,
      race_date: String(g.race_date).slice(0, 10),
      race_type: g.race_type ?? null,
      priority: upper(g.priority),
      distance_km: g.distance_km ?? null,
      elevation_gain_m: g.elevation_gain_m ?? null,
      goal_time_minutes: g.goal_time_minutes ?? null,
      goal_power_watts: g.goal_power_watts ?? null,
      sport: null,
      done: g.status === 'completed',
    });
  }

  races.sort((a, b) => a.race_date.localeCompare(b.race_date));
  const recentFloor = addDays(todayStr, -recentDays);
  return {
    upcoming: races.filter((r) => r.race_date >= todayStr),
    recent: races.filter((r) => r.race_date < todayStr && r.race_date >= recentFloor).reverse(),
  };
}

/**
 * @param {string} userId  verified athlete id
 * @param {string} todayStr  athlete-local YYYY-MM-DD
 * @returns {Promise<{ upcoming: Array, recent: Array }>} never throws
 */
export async function fetchRaceAnchorRaces(userId, todayStr, { recentDays = RECENT_DAYS, horizonDays = HORIZON_DAYS } = {}) {
  if (!userId || !todayStr) return { upcoming: [], recent: [] };
  const from = addDays(todayStr, -recentDays);
  const to = addDays(todayStr, horizonDays);
  try {
    const supabase = getSupabaseAdmin();
    const [calendarRaces, goalsResult] = await Promise.all([
      fetchPlannedSessions(userId, { from, to, types: ['race'] }),
      supabase
        .from('race_goals')
        .select(GOAL_COLUMNS)
        .eq('user_id', userId)
        .gte('race_date', from)
        .lte('race_date', to),
    ]);
    if (goalsResult?.error) console.error('fetchRaceAnchorRaces race_goals:', goalsResult.error.message);
    return mergeRaces(calendarRaces, goalsResult?.data || [], todayStr, { recentDays });
  } catch (err) {
    console.error('fetchRaceAnchorRaces failed:', err?.message || err);
    return { upcoming: [], recent: [] };
  }
}

/** The goal race: soonest A race, else soonest race. Same rule as coachingBible.pickGoalRace. */
export function pickNextGoalRace(upcoming) {
  const list = upcoming || [];
  return list.find((r) => r.priority === 'A') || list[0] || null;
}
