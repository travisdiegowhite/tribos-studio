/**
 * Running race PRs found in an athlete's races (multisport phase 5).
 *
 * running_race_prs (migration 042) holds one row per distance per athlete.
 * Only RACES count — a fast 5 km inside a long run is a best effort (Progress
 * shows those), not a PR. A run is a race when:
 *   - Strava flagged it (raw_data.workout_type === 1, "Race" for runs), or
 *   - it falls on the day of a run race in the athlete's season (race_goals
 *     with a run race_type).
 * Its distance must land in one of four tolerance bands (a 5k measured by a
 * watch is rarely exactly 5.000 km), and its time is clock time: elapsed,
 * falling back to moving.
 *
 * Writes are upserts on (user_id, distance) and only ever make a PR faster.
 * A manual PR the athlete saved stays unless the race beats it.
 *
 * No Supabase import: callers pass the service-role client, and every
 * statement filters on user_id (the security boundary for that client).
 * running_race_prs.source (migration 136) goes through optionalColumn.
 */

import { isRunningActivityRow } from './sportTypes.js';
import { RUN_RACE_TYPES } from './entrySport.js';
import { optionalColumn } from './optionalColumn.js';

/** Distance bands in metres, keyed by running_race_prs.distance. */
export const RACE_DISTANCE_BANDS = [
  { key: '5k', label: '5K', min: 4900, max: 5400 },
  { key: '10k', label: '10K', min: 9800, max: 10600 },
  { key: 'half_marathon', label: 'Half marathon', min: 20900, max: 21800 },
  { key: 'marathon', label: 'Marathon', min: 42000, max: 43200 },
];

/** "21:40" or "1:41:10". */
export function formatRaceTime(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!(s > 0)) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Strava's run workout_type for a race. */
const STRAVA_RUN_RACE = 1;

/** The PR distance key for a run of `distanceM` metres, or null. */
export function raceDistanceKey(distanceM) {
  const d = Number(distanceM);
  if (!(d > 0)) return null;
  return RACE_DISTANCE_BANDS.find((b) => d >= b.min && d <= b.max)?.key ?? null;
}

/** YYYY-MM-DD in the athlete's timezone. */
export function localDay(date, timeZone = 'UTC') {
  try {
    return new Date(date).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/**
 * True when the run was a race.
 * @param {object} activity  needs start_date and either workout_type (the
 *   selected raw_data->workout_type) or raw_data.workout_type
 * @param {Set<string>} raceDays  local dates of the athlete's run races
 * @param {string} [timeZone]
 */
export function isRace(activity, raceDays, timeZone = 'UTC') {
  const flag = activity?.workout_type ?? activity?.raw_data?.workout_type;
  if (Number(flag) === STRAVA_RUN_RACE) return true;
  if (!activity?.start_date || !raceDays || raceDays.size === 0) return false;
  return raceDays.has(localDay(activity.start_date, timeZone));
}

/** Clock time of a race in seconds: elapsed, else moving. Null when unknown. */
export function raceTimeSeconds(activity) {
  const elapsed = Number(activity?.elapsed_time);
  if (elapsed > 0) return Math.round(elapsed);
  const moving = Number(activity?.moving_time);
  return moving > 0 ? Math.round(moving) : null;
}

/** Slower than this for a band's lower bound is a walk or a paused watch. */
const SLOWEST_RACE_PACE_SEC_PER_KM = 600;
/** Faster than this is a GPS glitch, not a race. */
const FASTEST_RACE_PACE_SEC_PER_KM = 150;

/**
 * The PR rows to write: per distance, the fastest race among `runs`, only
 * when it beats the stored time (or there is none).
 *
 * @param {Array<object>} runs  run rows (id, start_date, distance, elapsed_time,
 *   moving_time, name, workout_type | raw_data)
 * @param {Set<string>} raceDays
 * @param {Array<{distance: string, time_seconds: number}>} existing
 * @param {{ timeZone?: string, raceNames?: Map<string, string> }} [opts]
 * @returns {Array<{distance: string, time_seconds: number, race_date: string, race_name: string|null, activity_id: string|null}>}
 */
export function planPrUpserts(runs, raceDays, existing = [], opts = {}) {
  const timeZone = opts.timeZone || 'UTC';
  const stored = new Map((existing || []).map((p) => [p.distance, Number(p.time_seconds)]));
  const best = new Map();
  for (const run of runs || []) {
    if (!isRace(run, raceDays, timeZone)) continue;
    const key = raceDistanceKey(run.distance);
    const seconds = raceTimeSeconds(run);
    if (!key || !seconds) continue;
    const pace = (seconds / Number(run.distance)) * 1000;
    if (pace < FASTEST_RACE_PACE_SEC_PER_KM || pace > SLOWEST_RACE_PACE_SEC_PER_KM) continue;
    const prev = best.get(key);
    if (!prev || seconds < prev.time_seconds) {
      const day = localDay(run.start_date, timeZone);
      best.set(key, {
        distance: key,
        time_seconds: seconds,
        race_date: day,
        race_name: opts.raceNames?.get(day) || run.name || null,
        activity_id: run.id ?? null,
      });
    }
  }
  return [...best.values()].filter((row) => {
    const prev = stored.get(row.distance);
    return !(prev > 0) || row.time_seconds < prev;
  });
}

const prSource = optionalColumn('running_race_prs', 'source');

/** Test hook. */
export function resetRacePrColumnFallback() {
  prSource.reset();
}

/** On the first scan (no PRs yet) look back further than the usual window. */
export const FIRST_SCAN_DAYS = 400;
export const DEFAULT_SCAN_DAYS = 30;

/**
 * Find race PRs in an athlete's recent runs and store the faster ones.
 * Fail-soft: logs and returns `{ written: 0 }` on any read error.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ sinceDays?: number, timeZone?: string, now?: Date }} [opts]
 * @returns {Promise<{ written: number, scannedDays: number }>}
 */
export async function scanRunRacePrs(supabase, userId, opts = {}) {
  const now = opts.now ?? new Date();
  try {
    const { data: existing, error: prError } = await supabase
      .from('running_race_prs')
      .select('distance, time_seconds')
      .eq('user_id', userId);
    if (prError) {
      console.warn('[runRacePrs] PRs unavailable:', prError.message);
      return { written: 0, scannedDays: 0 };
    }
    const sinceDays =
      (existing ?? []).length === 0 ? FIRST_SCAN_DAYS : (opts.sinceDays ?? DEFAULT_SCAN_DAYS);
    const since = new Date(now.getTime() - sinceDays * 86400000);

    const lowest = RACE_DISTANCE_BANDS[0].min;
    const highest = RACE_DISTANCE_BANDS[RACE_DISTANCE_BANDS.length - 1].max;
    const [{ data: runs, error: runError }, { data: goals, error: goalError }] = await Promise.all([
      supabase
        .from('activities')
        .select(
          'id, name, start_date, type, sport_type, distance, moving_time, elapsed_time, workout_type:raw_data->workout_type',
        )
        .eq('user_id', userId)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .is('duplicate_of', null)
        // Coarse prefilter (every run spelling contains "run"); the classifier
        // below decides.
        .or('type.ilike.%run%,sport_type.ilike.%run%')
        .gte('start_date', since.toISOString())
        .gte('distance', lowest)
        .lte('distance', highest)
        .limit(1000),
      supabase
        .from('race_goals')
        .select('name, race_date, race_type')
        .eq('user_id', userId)
        .in('race_type', RUN_RACE_TYPES)
        .gte('race_date', since.toISOString().slice(0, 10)),
    ]);
    if (runError) {
      console.warn('[runRacePrs] runs unavailable:', runError.message);
      return { written: 0, scannedDays: sinceDays };
    }
    if (goalError) console.warn('[runRacePrs] race goals unavailable:', goalError.message);

    const raceDays = new Set((goals ?? []).map((g) => String(g.race_date).slice(0, 10)));
    const raceNames = new Map((goals ?? []).map((g) => [String(g.race_date).slice(0, 10), g.name]));
    const rows = planPrUpserts(
      (runs ?? []).filter(isRunningActivityRow),
      raceDays,
      existing ?? [],
      { timeZone: opts.timeZone, raceNames },
    );
    if (rows.length === 0) return { written: 0, scannedDays: sinceDays };

    const payload = rows.map((r) => ({
      ...r,
      user_id: userId,
      source: 'auto',
      updated_at: now.toISOString(),
    }));
    const { error } = await prSource.write(payload, (p) =>
      supabase.from('running_race_prs').upsert(p, { onConflict: 'user_id,distance' }),
    );
    if (error) {
      console.warn('[runRacePrs] upsert failed:', error.message);
      return { written: 0, scannedDays: sinceDays };
    }
    return { written: rows.length, scannedDays: sinceDays };
  } catch (err) {
    console.warn('[runRacePrs] scan failed:', err?.message);
    return { written: 0, scannedDays: 0 };
  }
}
