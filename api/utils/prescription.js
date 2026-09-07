/**
 * prescription — the stored shape of a session's interval structure.
 *
 * Lives in `calendar_entries.details.prescription`. One table, one surface: the
 * calendar row IS the session, so its structure belongs on the row rather than
 * in a side table (`session_prescriptions` exists from migration 086 and has
 * never held a row; it stays under the wait-and-watch policy).
 *
 * The interval shape is the sequencer's own `IntervalPrescription` (see
 * `src/types/training.ts`): repeats × duration at a %FTP band with a recovery.
 * Everything that produces a session — the coach's `calendar_change` tool, the
 * arc refill, the session designer — normalises through `buildPrescription`,
 * so a reader can trust the shape without re-validating it.
 *
 * Pure: no I/O, no Supabase, no model calls.
 */

export const PRESCRIPTION_VERSION = 1;

/** Who produced the structure. Read by the UI to label a stand-in honestly. */
export const PRESCRIPTION_SOURCES = new Set(['coach', 'designer', 'arc', 'library', 'athlete']);

const MAX_REPEATS = 40;
const MAX_INTERVAL_MIN = 180;
const MIN_PCT_FTP = 30;
const MAX_PCT_FTP = 300;
const MAX_RECOVERY_MIN = 60;
const MAX_INTERVALS = 12;
const MAX_SETS = 6;
const MAX_BOOKEND_MIN = 60;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Validate and normalise a model- or generator-supplied interval list.
 *
 * Returns `{ intervals, errors }`. `intervals` is null when the input is
 * absent or empty, and when any entry is unusable — a half-valid set is worse
 * than none, because the row would then paint a structure the coach did not
 * write. Errors are specific enough for the coach's retry loop to correct.
 *
 * @param {unknown} input
 * @param {string} [at='intervals'] label for error messages
 * @returns {{ intervals: Array<object>|null, errors: string[] }}
 */
export function normalizeIntervals(input, at = 'intervals') {
  if (input === undefined || input === null) return { intervals: null, errors: [] };
  if (!Array.isArray(input)) {
    return { intervals: null, errors: [`${at}: must be an array of interval sets.`] };
  }
  if (input.length === 0) return { intervals: null, errors: [] };
  if (input.length > MAX_INTERVALS) {
    return { intervals: null, errors: [`${at}: more than ${MAX_INTERVALS} sets is not a session.`] };
  }

  const errors = [];
  const intervals = [];
  input.forEach((raw, i) => {
    const label = `${at}[${i + 1}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${label}: must be an object.`);
      return;
    }
    const repeats = num(raw.repeats ?? raw.sets);
    const durationMin = num(raw.duration_min ?? raw.durationMin);
    const recoveryMin = num(raw.recovery_min ?? raw.recoveryMin) ?? 0;
    let pctMin = num(raw.target_pct_ftp_min ?? raw.targetPctFtpMin ?? raw.target_pct_ftp);
    let pctMax = num(raw.target_pct_ftp_max ?? raw.targetPctFtpMax ?? raw.target_pct_ftp);
    if (pctMin === null && pctMax !== null) pctMin = pctMax;
    if (pctMax === null && pctMin !== null) pctMax = pctMin;

    if (repeats === null || repeats < 1 || repeats > MAX_REPEATS || !Number.isInteger(repeats)) {
      errors.push(`${label}: repeats must be a whole number from 1 to ${MAX_REPEATS} (got ${JSON.stringify(raw.repeats)}).`);
    }
    if (durationMin === null || durationMin <= 0 || durationMin > MAX_INTERVAL_MIN) {
      errors.push(`${label}: duration_min must be between 0 and ${MAX_INTERVAL_MIN} minutes (got ${JSON.stringify(raw.duration_min)}).`);
    }
    if (pctMin === null || pctMax === null || pctMin < MIN_PCT_FTP || pctMax > MAX_PCT_FTP || pctMin > pctMax) {
      errors.push(`${label}: target_pct_ftp_min/max must be a %FTP band between ${MIN_PCT_FTP} and ${MAX_PCT_FTP}, min ≤ max.`);
    }
    if (recoveryMin < 0 || recoveryMin > MAX_RECOVERY_MIN) {
      errors.push(`${label}: recovery_min must be between 0 and ${MAX_RECOVERY_MIN} minutes.`);
    }
    if (errors.length > 0) return;

    const out = {
      repeats,
      duration_min: round1(durationMin),
      target_pct_ftp_min: Math.round(pctMin),
      target_pct_ftp_max: Math.round(pctMax),
      recovery_min: round1(recoveryMin),
    };
    // Sets of sets (30/15s ridden as 3 × 13) with a longer recovery between.
    // `sets` is only the outer count when `repeats` is spelled out; alone it
    // is the older spelling of repeats (handled above).
    const sets = raw.repeats !== undefined ? num(raw.sets) : null;
    if (sets != null && sets > 1 && sets <= MAX_SETS && Number.isInteger(sets)) {
      out.sets = sets;
      const setRecovery = num(raw.set_recovery_min ?? raw.setRecoveryMin) ?? 0;
      out.set_recovery_min = round1(Math.min(MAX_RECOVERY_MIN, Math.max(0, setRecovery)));
    }
    // Watts the designer aimed at, kept beside the %FTP the device reads.
    const wLo = num(raw.target_watts_min);
    const wHi = num(raw.target_watts_max);
    if (wLo != null && wHi != null && wLo > 0 && wHi >= wLo) {
      out.target_watts_min = Math.round(wLo);
      out.target_watts_max = Math.round(wHi);
    }
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 200) : '';
    if (notes) out.notes = notes;
    intervals.push(out);
  });

  if (errors.length > 0) return { intervals: null, errors };
  return { intervals, errors: [] };
}

/**
 * Build the stored object from a normalised interval list.
 *
 * @param {Array<object>} intervals  From normalizeIntervals.
 * @param {string} source  One of PRESCRIPTION_SOURCES.
 * @param {object} [extra]
 * @param {number|null} [extra.warmupMin]
 * @param {number|null} [extra.cooldownMin]
 * @param {string[]} [extra.rationale]  Rule ids and plain sentences from the designer.
 * @returns {object|null}
 */
export function buildPrescription(intervals, source, extra = {}) {
  if (!Array.isArray(intervals) || intervals.length === 0) return null;
  if (!PRESCRIPTION_SOURCES.has(source)) {
    throw new Error(`buildPrescription: unknown source "${source}"`);
  }
  const warmup = num(extra.warmupMin);
  const cooldown = num(extra.cooldownMin);
  const out = {
    version: PRESCRIPTION_VERSION,
    source,
    intervals,
  };
  if (warmup !== null && warmup >= 0 && warmup <= MAX_BOOKEND_MIN) out.warmup_min = round1(warmup);
  if (cooldown !== null && cooldown >= 0 && cooldown <= MAX_BOOKEND_MIN) out.cooldown_min = round1(cooldown);
  if (Array.isArray(extra.rationale) && extra.rationale.length > 0) {
    out.rationale = extra.rationale.filter((r) => typeof r === 'string' && r.trim()).slice(0, 12);
  }
  out.created_at = new Date().toISOString();
  return out;
}

/**
 * Merge a prescription into an entry's existing `details` JSON without
 * dropping whatever else lives there (race details from migration 115, for
 * one). Passing `null` removes the prescription and keeps the rest.
 *
 * @param {object|null|undefined} details
 * @param {object|null} prescription
 * @returns {object|null}
 */
export function withPrescription(details, prescription) {
  const base = details && typeof details === 'object' && !Array.isArray(details) ? { ...details } : {};
  if (prescription) {
    base.prescription = prescription;
  } else {
    delete base.prescription;
  }
  return Object.keys(base).length > 0 ? base : null;
}

/** The prescription stored on an entry, or null. Tolerates any `details` shape. */
export function readPrescription(details) {
  const p = details && typeof details === 'object' ? details.prescription : null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.intervals) || p.intervals.length === 0) return null;
  return p;
}
