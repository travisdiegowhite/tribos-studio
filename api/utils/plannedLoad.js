/**
 * plannedLoad — the planned RSS of a calendar session, computed from its
 * structure.
 *
 * WHY THIS EXISTS. Until 2026-11 a session's `target_load` was whatever number
 * its writer typed: a library constant, or the coach model's guess. Nothing
 * tied it to the session itself. A 60-minute sweet-spot session was stored at
 * 90 RSS (an hour at 95% FTP, which a sweet-spot hour cannot reach) while the
 * session designer had already predicted 55 for the very intervals it wrote
 * on the row. The athlete rode it, scored ~50, and reasonably concluded RSS
 * was broken. The metric was fine; the plan side was invented.
 *
 * The rule now: the stored planned load is derived from what the session IS.
 *
 *   1. A designer prescription carries `predicted_load` — use it. It is the
 *      same `(pct/100)² × h × 100` arithmetic the actual-load scorer uses, over
 *      the exact intervals, recoveries and bookends on the row.
 *   2. Any other interval prescription (the coach's own sets, a run's pace
 *      bands) is scored from its structure the same way, with the time left
 *      over in the session ridden at warmup intensity.
 *   3. No structure: duration × the session type's typical RSS per hour
 *      (TYPE_RSS_PER_HOUR, mirroring `TYPE_TSS_PER_HOUR` mid values in
 *      src/lib/training/constants.ts — a test keeps the two equal; runs use
 *      RUN_RSS_PER_HOUR).
 *
 * Only a session with neither a length nor a structure keeps the number it
 * was given — there is nothing to derive one from.
 *
 * Strength, core, mobility and yoga carry no planned RSS (null): they are not
 * scored on the actual side either, so a number here would only ever read as a
 * miss.
 *
 * Pure: no I/O.
 */

import { isStrengthSession, entrySport } from './entrySport.js';
import { segmentLoad, ruleParam } from './sessionDesigner.js';

/**
 * Typical RSS for one hour of each session type — the `mid` column of
 * TYPE_TSS_PER_HOUR in src/lib/training/constants.ts. Keep in step (the test
 * fails otherwise).
 */
export const TYPE_RSS_PER_HOUR = Object.freeze({
  rest: 0,
  recovery: 30,
  endurance: 48,
  tempo: 68,
  sweet_spot: 76,
  threshold: 85,
  vo2max: 105,
  anaerobic: 115,
  race: 100,
});

/**
 * The same for a RUN. The cycling table under-reads runs: an easy run is held
 * at ~74% of threshold speed against ~65% of FTP for an easy ride, so its
 * rTSS/hrTSS per hour is higher. Each rate is IF² × 100 at a typical session
 * intensity — recovery 0.65, endurance 0.74, tempo 0.85, threshold session
 * (with its warmup) 0.89, interval sessions 0.92 — and lands near the 58/h the
 * production run sample averages (runLoad.js). The running library's own
 * targets sit within ~20% of these.
 */
export const RUN_RSS_PER_HOUR = Object.freeze({
  rest: 0,
  recovery: 42,
  endurance: 55,
  tempo: 72,
  sweet_spot: 76,
  threshold: 80,
  vo2max: 85,
  anaerobic: 85,
  race: 100,
});

/** workout_type spellings seen in production that mean one of the above. */
const TYPE_ALIASES = Object.freeze({
  racing: 'race',
  race_simulation: 'race',
  openers: 'tempo',
  intervals: 'threshold',
  hill_repeats: 'threshold',
  sprint: 'anaerobic',
  long_ride: 'endurance',
  long_run: 'endurance',
  easy: 'endurance',
  base: 'endurance',
  fartlek: 'tempo',
});

const RECOVERY_PCT = ruleParam('SES-WR-1', 'recovery_pct_ftp');
const FILLER_PCT = ruleParam('SES-WR-1', 'warmup_pct_ftp');

/** The table key for a workout_type: aliases resolved, unknown → endurance. */
export function loadTypeFor(workoutType) {
  const t = String(workoutType || '').toLowerCase();
  if (t in TYPE_RSS_PER_HOUR) return t;
  return TYPE_ALIASES[t] ?? 'endurance';
}

function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * %FTP-equivalent intensity of one interval set's work: the middle of its
 * %FTP band, or for a run's threshold-pace band (100 = threshold, higher =
 * slower) the inverse — pace intensity is threshold/pace.
 */
function workPct(interval) {
  const lo = positive(interval.target_pct_ftp_min);
  const hi = positive(interval.target_pct_ftp_max);
  if (lo && hi) return (lo + hi) / 2;
  const pLo = positive(interval.target_pct_threshold_pace_min);
  const pHi = positive(interval.target_pct_threshold_pace_max);
  if (pLo && pHi) return 10000 / ((pLo + pHi) / 2);
  return null;
}

/**
 * RSS of an interval prescription with no designer prediction: work at the
 * band's middle, recoveries at the rulebook's recovery intensity, stated
 * bookends at warmup intensity, and the rest of `durationMin` (if longer than
 * the structure) at warmup intensity too. Null when no set has a usable band.
 */
export function prescriptionStructureLoad(prescription, durationMin = null) {
  const intervals = Array.isArray(prescription?.intervals) ? prescription.intervals : [];
  let load = 0;
  let minutes = 0;
  let scored = false;
  for (const iv of intervals) {
    const pct = workPct(iv);
    const repeats = positive(iv.repeats) ?? 1;
    const work = positive(iv.duration_min) ?? 0;
    const rec = Number(iv.recovery_min) > 0 ? Number(iv.recovery_min) : 0;
    const sets = positive(iv.sets) ?? 1;
    const setRec = Number(iv.set_recovery_min) > 0 ? Number(iv.set_recovery_min) : 0;
    if (pct == null || work === 0) continue;
    scored = true;
    const workMin = work * repeats * sets;
    const recMin = rec * Math.max(0, repeats - 1) * sets + setRec * Math.max(0, sets - 1);
    load += segmentLoad(pct, workMin) + segmentLoad(RECOVERY_PCT, recMin);
    minutes += workMin + recMin;
  }
  if (!scored) return null;

  const bookends = (Number(prescription.warmup_min) || 0) + (Number(prescription.cooldown_min) || 0);
  const total = positive(durationMin) ?? minutes + bookends;
  const filler = Math.max(0, total - minutes);
  load += segmentLoad(FILLER_PCT, filler);
  return Math.round(load);
}

/**
 * The planned RSS for a session.
 *
 * @param {object} entry
 * @param {string|null} [entry.type]            calendar entry type; rest/note → 0/null
 * @param {string|null} [entry.workout_type]
 * @param {string|null} [entry.workout_id]
 * @param {number|null} [entry.target_duration_min]
 * @param {object|null} [entry.details]          may hold `prescription`
 * @param {object} [opts]
 * @param {boolean} [opts.trustPrediction=true]  false when the duration changed
 *   since the designer predicted, so its number no longer describes the row.
 * @returns {number|null}
 */
export function plannedLoadFor(entry, { trustPrediction = true } = {}) {
  if (!entry) return null;
  const type = entry.type || 'workout';
  if (type === 'note') return null;
  if (type === 'rest') return 0;
  if (isStrengthSession(entry)) return null;

  const durationMin = positive(entry.target_duration_min);
  const prescription = entry.details?.prescription ?? null;

  if (prescription) {
    const predicted = positive(prescription.predicted_load);
    if (trustPrediction && predicted != null) return Math.round(predicted);
    const structural = prescriptionStructureLoad(prescription, durationMin);
    if (structural != null) return structural;
  }

  // A race, or any session with neither a length nor a structure, has nothing
  // to derive a load from: keep whatever number it was given rather than
  // invent one (a readiness gate's eased load, a race's projection).
  if (type === 'race' || durationMin == null) {
    const given = positive(entry.target_load);
    return given != null ? Math.round(given) : null;
  }

  const table = entrySport(entry) === 'running' ? RUN_RSS_PER_HOUR : TYPE_RSS_PER_HOUR;
  return Math.round((durationMin / 60) * table[loadTypeFor(entry.workout_type)]);
}
