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
 *   3. A library workout (`workout_id`) is scored from the library's own
 *      structure-derived load (`PLAN_WORKOUT_LIBRARIES`, kept equal to the app
 *      library's `targetTSS` by planGenerator.test.js), fitted to the row's
 *      length the way the calendar draws it: extra time is Z2 riding, a
 *      shorter day scales down. Until 2026-11-22 these fell through to the
 *      type table below, which prices the WHOLE session at the type's
 *      intensity — a 75-minute 4×8 VO2 day came out at 131 against the 88 its
 *      structure gives, and 75 minutes of sprints at 144 against 110.
 *   4. No structure: duration × the session type's typical RSS per hour
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
import { PLAN_WORKOUT_LIBRARIES } from './planGenerator.js';

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

/**
 * %FTP of the riding a library workout gains or loses when it is fitted to a
 * different length. The calendar (fitStructureToDuration) stretches or trims
 * the EASY riding, so that is what moves: Z2 (65%) at most, and no harder
 * than the session's own average — a lengthened recovery spin stays a
 * recovery spin, it does not gain endurance riding.
 */
const LIBRARY_FILL_MAX_PCT = 65;

function libraryWorkout(workoutId) {
  if (typeof workoutId !== 'string' || !workoutId) return null;
  for (const lib of Object.values(PLAN_WORKOUT_LIBRARIES)) {
    if (Object.prototype.hasOwnProperty.call(lib, workoutId)) return lib[workoutId];
  }
  return null;
}

/**
 * Planned RSS of a library workout at `durationMin`: its structure-derived
 * load at the library length, with the minutes added or trimmed scored as
 * easy riding. A day too short to trim only easy riding scales the whole
 * session (the floor). Null when the id is not a library workout or carries
 * no load (strength, core). Within ~10% of the calendar's own fitted
 * structure for every cycling workout (plannedLoad.test.js).
 */
export function libraryLoad(workoutId, durationMin = null) {
  const w = libraryWorkout(workoutId);
  if (!w || !(w.tss > 0) || !(w.duration > 0)) return null;
  const minutes = positive(durationMin) ?? w.duration;
  const averagePct = Math.sqrt(w.tss / ((w.duration / 60) * 100)) * 100;
  const fillPct = Math.min(LIBRARY_FILL_MAX_PCT, averagePct);
  const delta = minutes - w.duration;
  if (delta >= 0) return Math.round(w.tss + segmentLoad(fillPct, delta));
  const trimmed = w.tss - segmentLoad(fillPct, -delta);
  const scaled = (w.tss * minutes) / w.duration;
  return Math.round(Math.max(trimmed, scaled));
}

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

  // A race keeps whatever number it was given (its projection).
  if (type === 'race') {
    const given = positive(entry.target_load);
    return given != null ? Math.round(given) : null;
  }

  // A library workout is scored from its own structure.
  const fromLibrary = libraryLoad(entry.workout_id, durationMin);
  if (fromLibrary != null) return fromLibrary;

  // Neither a length nor a structure: nothing to derive a load from, so keep
  // the number it was given rather than invent one (a readiness gate's eased
  // load).
  if (durationMin == null) {
    const given = positive(entry.target_load);
    return given != null ? Math.round(given) : null;
  }

  const table = entrySport(entry) === 'running' ? RUN_RSS_PER_HOUR : TYPE_RSS_PER_HOUR;
  const rate = table[loadTypeFor(entry.workout_type)];
  // A type's rate describes a session of typical length (its work plus the
  // riding around it). Past TYPED_SESSION_MAX_MIN the extra time is endurance
  // riding, not more of the work: a 5-hour "intervals" day is not 5 hours at
  // threshold (that read 425 RSS).
  const typedMin = Math.min(durationMin, TYPED_SESSION_MAX_MIN);
  const extraMin = durationMin - typedMin;
  const extraRate = Math.min(rate, table.endurance);
  return Math.round((typedMin / 60) * rate + (extraMin / 60) * extraRate);
}

/** Longest a typed session with no structure is priced at its type's rate. */
export const TYPED_SESSION_MAX_MIN = 90;
