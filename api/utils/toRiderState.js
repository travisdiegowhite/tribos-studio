/**
 * toRiderState — the one adapter between real Tribos data and the RiderState
 * contract the rules engine consumes (docs/coaching-bible/IMPLEMENTATION-BRIEF.md).
 *
 * Split into fetch (one parallel batch of queries) and a pure mapper, so the
 * mapping is unit-testable against plain rows with no database.
 *
 * ── THE RULE THAT GOVERNS THIS FILE ──────────────────────────────────────
 *
 * A field we cannot measure is null. It is never zero, never a default, never
 * inferred from a related number. A null field skips the rules that read it
 * (reason `missing_input`); a wrong value fires a rule at an athlete for a
 * reason that is not true. The second failure is much worse and much harder
 * to notice, so every mapping below either has a real source or returns null.
 *
 * Two places where that bites, both verified against production data:
 *
 *  - `strengthSessions8wk` has TWO sources and a third state. Garmin imports
 *    strength sessions into `activities` (sport_type STRENGTH_TRAINING); the
 *    manual logger writes cross_training_activities; and api/strava-webhook.js
 *    drops WeightTraining outright, so a Strava-only athlete who lifts has no
 *    row anywhere. Zero rows therefore cannot mean zero sessions — it would
 *    fire MST-3-strength at every Strava-only masters athlete forever. So a
 *    zero is only reported when the athlete has logged strength at some point
 *    in the last year, proving their sources can show it. Otherwise: null.
 *
 *  - `midZoneShare4wk` needs a per-ride intensity, and only ~1–2% of stored
 *    rides carry `ride_intensity`/`intensity_factor`. It is therefore derived
 *    from RI = EP ÷ FTP, which is the spec definition (§3.1), not an estimate
 *    — but only when coverage is good enough to mean anything. Below the
 *    thresholds below it returns null.
 */

import { efTrendFrom, pdTrendFrom, ageFromDob, weeksUntil, pickGoalRace } from './coachingBible.js';
import { sportTypeOfActivity } from './sportTypes.js';
import { buildReadiness } from './readiness.js';

const DAY_MS = 86400000;

// Zone bands as fractions of FTP. The "middle" the research warns about is
// tempo through threshold.
export const MID_ZONE_MIN_RI = 0.76;
export const MID_ZONE_MAX_RI = 0.95;
export const HARD_MIN_RI = 0.95;
export const EASY_MAX_RI = 0.76;

// Below these, a mid-zone share is a number about four rides, not about the
// athlete's month. Better to say nothing.
export const MIN_RIDES_FOR_DISTRIBUTION = 6;
export const MIN_INTENSITY_COVERAGE = 0.6;

/** race_types that mean "long day" rather than "race day". */
const ENDURANCE_RACE_TYPES = new Set(['gran_fondo', 'century', 'gravel']);

/**
 * Is this a ride?
 *
 * Both column vocabularies are handled by sportTypeOfActivity (sportTypes.js).
 * This matters more than it looks: running activities carry `effective_power`
 * too (running power, 350-430W in the live data). Dividing that by a cycling
 * FTP yields RI around 1.2, which would score every easy jog as a hard ride
 * and invert the mid-zone share.
 */
export function isCyclingActivity(activity) {
  return sportTypeOfActivity(activity) === 'cycling';
}

/** Is this a strength session, in either vocabulary? */
export function isStrengthActivity(activity) {
  const sport = String(activity?.sport_type || '').toUpperCase();
  return activity?.type === 'WeightTraining' || sport === 'STRENGTH_TRAINING';
}

/** calendar_entries.workout_type values that are a hard session by intent. */
export const HARD_WORKOUT_TYPES = new Set([
  'intervals', 'vo2max', 'threshold', 'sweet_spot', 'race', 'hill_repeats', 'anaerobic', 'sprint',
]);
/** …and the ones that are easy by intent. */
export const EASY_WORKOUT_TYPES = new Set([
  'recovery', 'easy', 'endurance', 'foundation', 'active_recovery',
]);

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Fetch every row toRiderState needs. Never throws — a failed section is
 * null, and the rules that read it skip.
 *
 * @param {object} supabase  service-role client (api/utils/supabaseAdmin.js)
 * @param {string} userId    VERIFIED user id — this is the security boundary
 * @param {Date}   [now]
 */
export async function fetchRiderStateData(supabase, userId, now = new Date()) {
  const sinceIso = (days) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const sinceDate = (days) => new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);

  const safe = (p, label) =>
    p.then(
      (r) => (r?.error ? (console.error(`toRiderState ${label}:`, r.error.message), null) : r?.data ?? null),
      (e) => (console.error(`toRiderState ${label}:`, e.message), null)
    );

  const [profile, coachSettings, load, activities, calendar, strength, checkins, hrv, strengthHistory] =
    await Promise.all([
    safe(
      supabase.from('user_profiles').select('date_of_birth, ftp').eq('id', userId).maybeSingle(),
      'user_profiles'
    ),
    safe(
      supabase.from('user_coach_settings').select('coaching_persona').eq('user_id', userId).maybeSingle(),
      'user_coach_settings'
    ),
    // 28 days of daily load: rss7d, rss3wkMean, and the latest tfi/afi/fs.
    safe(
      supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score, rss')
        .eq('user_id', userId)
        .gte('date', sinceDate(28))
        .order('date', { ascending: true }),
      'training_load_daily'
    ),
    safe(
      supabase
        .from('activities')
        .select('start_date, moving_time, rss, tss, ride_intensity, intensity_factor, effective_power, sport_type, type')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', sinceIso(28))
        .order('start_date', { ascending: false })
        .limit(200),
      'activities'
    ),
    safe(
      supabase
        .from('calendar_entries')
        .select('date, workout_type, status')
        .eq('user_id', userId)
        .gte('date', sinceDate(28))
        .lte('date', sinceDate(0)),
      'calendar_entries'
    ),
    // Strength, source one: the manual cross-training logger.
    safe(
      supabase
        .from('cross_training_activities')
        .select('activity_date, activity_types!inner(category)')
        .eq('user_id', userId)
        .gte('activity_date', sinceDate(56)),
      'cross_training_activities'
    ),
    // Readiness, source one: the morning check-in. 56 days covers the longest
    // streak the rules can ask about with room to spare.
    safe(
      supabase
        .from('fatigue_checkins')
        .select('date, sleep, leg_feel, energy, motivation, illness')
        .eq('user_id', userId)
        .gte('date', sinceDate(56))
        .order('date', { ascending: false }),
      'fatigue_checkins'
    ),
    // Readiness, source two: HRV. 90 days so the 7-day rolling mean has a
    // baseline band to be measured against — see readiness.js.
    safe(
      supabase
        .from('health_metrics')
        .select('metric_date, hrv_ms')
        .eq('user_id', userId)
        .not('hrv_ms', 'is', null)
        .gte('metric_date', sinceDate(90))
        .order('metric_date', { ascending: false }),
      'health_metrics'
    ),
    // Strength, source two: device imports (Garmin writes STRENGTH_TRAINING
    // into `activities`). A full year, because the question this answers is
    // "can this athlete's data show strength at all?" — see the file header.
    safe(
      supabase
        .from('activities')
        .select('start_date, type, sport_type')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('type.eq.WeightTraining,sport_type.eq.STRENGTH_TRAINING')
        .gte('start_date', sinceIso(365))
        .order('start_date', { ascending: false })
        .limit(400),
      'strength activities'
    ),
  ]);

  return {
    profile, coachSettings, load, activities, calendar, strength, strengthHistory,
    checkins,
    // health_metrics names the day metric_date; readiness.js speaks `date`.
    hrv: (hrv || []).map((r) => ({ date: r.metric_date, hrv_ms: r.hrv_ms })),
  };
}

// ─── Pure mapping helpers ────────────────────────────────────────────────────

/**
 * Ride Intensity for one activity.
 * Canonical stored value first, then the spec definition RI = EP ÷ FTP
 * (TRIBOS_METRICS_SPECIFICATION §3.1). Returns null when neither is available
 * — never a guess from average power alone.
 */
export function rideIntensity(activity, ftp) {
  const stored = activity?.ride_intensity ?? activity?.intensity_factor;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
  const ep = activity?.effective_power;
  if (ep != null && ftp != null && ftp > 0) return Number(ep) / Number(ftp);
  return null;
}

/**
 * RSS weight for one ride. Stored value first; otherwise the base term of the
 * spec formula (RI² × hours × 100) WITHOUT the terrain multiplier — good
 * enough as a relative weight inside one athlete's month, which is all a
 * share is, and never surfaced to the athlete as a number.
 */
export function rideLoadWeight(activity, ri) {
  const stored = activity?.rss ?? activity?.tss;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
  const seconds = Number(activity?.moving_time) || 0;
  if (!ri || seconds <= 0) return null;
  return ri * ri * (seconds / 3600) * 100;
}

/**
 * Share of the last 4 weeks' RIDING load spent in the tempo–threshold band.
 * Rides only — see isCyclingActivity for why a run would poison this.
 */
export function midZoneShare(activities, ftp) {
  const rides = (activities || []).filter(isCyclingActivity);
  if (rides.length < MIN_RIDES_FOR_DISTRIBUTION) return null;

  let covered = 0;
  let total = 0;
  let mid = 0;
  for (const a of rides) {
    const ri = rideIntensity(a, ftp);
    if (ri == null) continue;
    const weight = rideLoadWeight(a, ri);
    if (weight == null) continue;
    covered++;
    total += weight;
    if (ri >= MID_ZONE_MIN_RI && ri <= MID_ZONE_MAX_RI) mid += weight;
  }

  if (covered < MIN_RIDES_FOR_DISTRIBUTION) return null;
  if (covered / rides.length < MIN_INTENSITY_COVERAGE) return null;
  if (total <= 0) return null;
  return mid / total;
}

/**
 * Hard and easy session counts over the last 4 weeks.
 *
 * The contract asks for "sessions whose GOAL was high-intensity", so this
 * reads planned intent off completed calendar entries rather than executed
 * intensity. An athlete with an empty calendar gets null for both, not zero —
 * TID-1-middle keys off `hardSessions4wk == 0` and would otherwise fire at
 * everyone who does not use the calendar.
 */
export function sessionCounts(calendarEntries) {
  const entries = (calendarEntries || []).filter(
    (e) => e.status === 'done' && e.workout_type && e.workout_type !== 'rest'
  );
  if (entries.length === 0) return { hard: null, easy: null };

  let hard = 0;
  let easy = 0;
  for (const e of entries) {
    const type = String(e.workout_type).toLowerCase();
    if (HARD_WORKOUT_TYPES.has(type)) hard++;
    else if (EASY_WORKOUT_TYPES.has(type)) easy++;
  }
  return { hard, easy };
}

/** The goal type the rules branch on. */
export function goalTypeFor(goalRace) {
  if (!goalRace) return 'general_fitness';
  return ENDURANCE_RACE_TYPES.has(String(goalRace.race_type || '')) ? 'endurance_event' : 'race';
}

/** Daily RSS for the last 7 days, oldest first, or null if the series has gaps. */
export function dailyRss7d(loadRows, todayStr) {
  if (!Array.isArray(loadRows) || loadRows.length === 0) return null;
  const byDate = new Map(loadRows.map((r) => [String(r.date).slice(0, 10), r]));
  const out = [];
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  if (Number.isNaN(todayMs)) return null;
  for (let back = 7; back >= 1; back--) {
    const date = new Date(todayMs - back * DAY_MS).toISOString().slice(0, 10);
    const row = byDate.get(date);
    // The rollforward cron writes a row for every day including rest days, so
    // a genuine gap means the series is not trustworthy — not that the
    // athlete rested. Monotony off a padded series is a fabricated verdict.
    if (!row || row.rss == null) return null;
    out.push(Number(row.rss));
  }
  return out;
}

/** Mean weekly RSS over the three weeks before the last one, or null. */
export function rss3wkMean(loadRows, todayStr) {
  if (!Array.isArray(loadRows) || loadRows.length === 0) return null;
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  if (Number.isNaN(todayMs)) return null;
  const from = todayMs - 28 * DAY_MS;
  const to = todayMs - 7 * DAY_MS;
  const rows = loadRows.filter((r) => {
    const t = Date.parse(`${String(r.date).slice(0, 10)}T00:00:00Z`);
    return !Number.isNaN(t) && t >= from && t < to && r.rss != null;
  });
  if (rows.length < 18) return null; // 3 weeks is 21 days; allow a little slack
  return rows.reduce((s, r) => s + Number(r.rss), 0) / 3;
}

/**
 * Strength sessions in the last 8 weeks, or null when we cannot tell.
 *
 * Counts the manual cross-training logger and device imports together. A zero
 * is only reported when this athlete has logged strength somewhere in the last
 * year — that is the evidence that their sources CAN show it. With no strength
 * ever seen, the honest answer is "unknown", because a Strava-only athlete who
 * lifts four times a week looks identical to one who never has.
 */
export function countStrengthSessions(data, todayStr) {
  const cross = (data?.strength || []).filter((r) => r.activity_types?.category === 'strength');
  const imported = (data?.strengthHistory || []).filter(isStrengthActivity);

  const inWindow = (dateStr) => {
    const days = daysBetween(String(dateStr).slice(0, 10), todayStr);
    return days != null && days >= 0 && days <= 56;
  };

  const recent =
    cross.filter((r) => inWindow(r.activity_date)).length +
    imported.filter((a) => inWindow(a.start_date)).length;

  if (recent > 0) return recent;
  // Nothing in eight weeks. Is that a real zero or an invisible athlete?
  const everLogged = cross.length > 0 || imported.length > 0;
  return everLogged ? 0 : null;
}

/** Whole calendar days from `fromDate` to `toDate` (both YYYY-MM-DD), or null. */
export function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

// ─── The adapter ─────────────────────────────────────────────────────────────

/**
 * Build a RiderState from fetched rows. Pure.
 *
 * @param {object} data              result of fetchRiderStateData
 * @param {object} o
 * @param {Array}  o.raceGoals       race_goals rows (coach.js already has these)
 * @param {object} o.evidenceSignals fitness_evidence_weekly.signals, or null
 * @param {string} o.todayStr        athlete-local YYYY-MM-DD
 * @returns {object} RiderState
 */
export function toRiderState(data, { raceGoals = [], evidenceSignals = null, todayStr } = {}) {
  const d = data || {};
  const ftp = d.profile?.ftp ?? null;
  const activities = d.activities || [];
  const loadRows = d.load || [];
  const latestLoad = loadRows.length > 0 ? loadRows[loadRows.length - 1] : null;

  const goalRace = pickGoalRace(raceGoals);
  const counts = sessionCounts(d.calendar);

  // All training hours, not just riding: this is what a taper cuts, and the
  // athletes in this dataset are routinely multi-sport.
  const trainingSeconds = activities.reduce((s, a) => s + (Number(a.moving_time) || 0), 0);
  const rides = activities.filter(isCyclingActivity);
  // Calendar days, not elapsed hours: a ride "yesterday" is 1 day ago whether
  // it started at 00:01 or 23:00. Diffing raw timestamps makes an early
  // morning ride read as two days old by the evening.
  const lastRideDate = rides.reduce((latest, a) => {
    const t = Date.parse(a.start_date);
    if (Number.isNaN(t)) return latest;
    const date = new Date(t).toISOString().slice(0, 10);
    return latest === null || date > latest ? date : latest;
  }, null);

  const strengthSessions8wk = countStrengthSessions(d, todayStr);

  const persona = d.coachSettings?.coaching_persona;

  return {
    // identity / context
    age: ageFromDob(d.profile?.date_of_birth ?? null),
    persona: persona && persona !== 'pending' ? persona : null,
    goalType: goalTypeFor(goalRace),
    weeksToEvent: goalRace ? weeksUntil(goalRace.race_date, todayStr) : null,
    weeklyHours4wkMean: activities.length > 0 ? trainingSeconds / 3600 / 4 : null,
    // No intake question captures this. See the Phase 1 report.
    fearOfFailureFlag: null,

    // load model
    tfi: latestLoad?.tfi ?? null,
    afi: latestLoad?.afi ?? null,
    fs: latestLoad?.form_score ?? null,
    rss7d: dailyRss7d(loadRows, todayStr),
    rss3wkMean: rss3wkMean(loadRows, todayStr),

    // distribution
    midZoneShare4wk: midZoneShare(activities, ftp),
    hardSessions4wk: counts.hard,
    easySessions4wk: counts.easy,
    strengthSessions8wk,
    daysSinceLastRide: daysBetween(lastRideDate, todayStr),

    // performance evidence
    efTrend: efTrendFrom(evidenceSignals),
    pdShortTrend: pdTrendFrom(evidenceSignals, ['p60', 'p300']),
    // 20 minutes only. power_curve_summary stores no 60-minute best, so the
    // contract's "20–60 min" is 20 min here. Flagged rather than fudged.
    pdLongTrend: pdTrendFrom(evidenceSignals, ['p1200']),

    // durability — Phase 4
    freshVsFatiguedDrop5min: null,
    longRideDecoupling: null,

    // readiness
    ...buildReadiness({ checkins: d.checkins || [], hrv: d.hrv || [], todayStr }),

    // environment — no race-location forecast and no per-ride temperature
    eventTempDeltaC: null,
  };
}
