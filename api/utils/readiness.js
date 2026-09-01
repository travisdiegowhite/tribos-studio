/**
 * Readiness inputs for the coaching rules — Phase 3.
 *
 * Turns two real sources into the four readiness fields on RiderState:
 *
 *   fatigue_checkins   → wellness, wellnessLowStreak, illnessFlag
 *   health_metrics     → hrvBelowBandDays, hrvReadings7d
 *
 * All pure. The fetch lives in toRiderState.js with the rest of the batch.
 *
 * ── The wellness mapping ─────────────────────────────────────────────────
 *
 * The rules ask for sleep / fatigue / mood, 1–5, where LOW IS BAD. The
 * check-in table stores leg_feel / energy / motivation on the same polarity
 * (1 = very heavy legs, 5 = fresh), so:
 *
 *   sleep   ← sleep       (added by migration 118; null on older rows)
 *   fatigue ← leg_feel
 *   mood    ← motivation
 *
 * `energy` is deliberately unused. It is a fourth signal with no slot in the
 * contract, and folding it into one of the three would change what that
 * number means without the rules knowing.
 *
 * ── Why HRV is a trend, never a reading ──────────────────────────────────
 *
 * The evidence for HRV-guided training is for rolling averages, not single
 * mornings (Plews 2013/2014), and the brief forbids day-to-day plan changes on
 * one reading. So the signal here is a 7-day rolling mean of the natural log
 * of rMSSD, compared against the athlete's own baseline band. A day only
 * counts as "below" when that ROLLING MEAN sits under baseline − 0.5 SD, and
 * RDY-2 additionally requires three such days in a row.
 *
 * Ln is not decoration: rMSSD is strongly right-skewed, so an SD taken on the
 * raw millisecond values is dominated by the high tail and the band comes out
 * asymmetric. Log-transforming first is what makes ±0.5 SD mean the same thing
 * above and below.
 *
 * One artifact reading cannot trip a rule. The count below walks BACKWARDS
 * from today, and each day's window is the seven days ending on that day, so a
 * bad strap contact this morning lands in exactly one window — today's. It can
 * therefore produce at most one below-band day, and RDY-2 needs three in a
 * row. Reaching three takes a genuinely suppressed week.
 */

const DAY_MS = 86400000;

/** Minimum readings inside the 7-day window for a rolling mean to mean anything. */
export const MIN_HRV_READINGS_7D = 3;
/** Days of history needed before a baseline band is trustworthy. */
export const MIN_HRV_BASELINE_DAYS = 21;
/** How far under the baseline mean the band sits, in SDs. */
export const HRV_BAND_SD = 0.5;
/** A wellness item at or below this is "low". */
export const LOW_WELLNESS = 2;

const isNum = (v) => v != null && Number.isFinite(Number(v));

function dateStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseDay(value) {
  const t = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

// ─── Wellness ────────────────────────────────────────────────────────────────

/**
 * Today's three-item wellness, or null when today's check-in is missing or
 * incomplete.
 *
 * All three items are required. A partial check-in cannot be scored: RDY-3-cut
 * distinguishes "body fine, head off" from "everything low", and that reading
 * is meaningless with one of the three absent. Half a check-in is not a
 * readiness signal, it is a missing one.
 *
 * @param {object|null} row  fatigue_checkins row for today
 * @returns {{sleep:number,fatigue:number,mood:number}|null}
 */
export function buildWellness(row) {
  if (!row) return null;
  const sleep = row.sleep;
  const fatigue = row.leg_feel;
  const mood = row.motivation;
  if (!isNum(sleep) || !isNum(fatigue) || !isNum(mood)) return null;
  return { sleep: Number(sleep), fatigue: Number(fatigue), mood: Number(mood) };
}

/** True when any of the three items is at or below the low threshold. */
export function isLowDay(row) {
  const w = buildWellness(row);
  if (!w) return false;
  return w.sleep <= LOW_WELLNESS || w.fatigue <= LOW_WELLNESS || w.mood <= LOW_WELLNESS;
}

/**
 * Consecutive days ending today on which any wellness item was low.
 *
 * Null when there is no scoreable check-in for today — a streak counted from
 * an older check-in would describe a day the athlete never reported on.
 * A day with no check-in breaks the streak rather than extending it: silence
 * is not evidence of a bad morning.
 *
 * @param {Array} rows      fatigue_checkins rows, any order
 * @param {string} todayStr athlete-local YYYY-MM-DD
 * @returns {number|null}
 */
export function wellnessLowStreak(rows, todayStr) {
  const today = parseDay(todayStr);
  if (today == null) return null;

  const byDate = new Map();
  for (const row of rows || []) {
    const key = String(row?.date || '').slice(0, 10);
    if (key) byDate.set(key, row);
  }

  const todayRow = byDate.get(dateStr(today));
  if (!buildWellness(todayRow)) return null;

  let streak = 0;
  for (let back = 0; back < 60; back++) {
    const row = byDate.get(dateStr(today - back * DAY_MS));
    if (!buildWellness(row)) break;
    if (!isLowDay(row)) break;
    streak++;
  }
  return streak;
}

/**
 * Today's illness answer. Null when unasked or unanswered — the rules compare
 * against `true`, so unknown correctly reads as "not known to be ill" without
 * ever reading as a confirmed "healthy".
 */
export function illnessFlagFor(rows, todayStr) {
  const today = parseDay(todayStr);
  if (today == null) return null;
  const row = (rows || []).find((r) => String(r?.date || '').slice(0, 10) === dateStr(today));
  return typeof row?.illness === 'boolean' ? row.illness : null;
}

// ─── HRV band ────────────────────────────────────────────────────────────────

/**
 * Mean of the natural log of every reading in the 7 days ending at `endMs`,
 * or null when the window is too thin to average.
 */
function rollingLnMean(byDate, endMs) {
  const values = [];
  for (let back = 0; back < 7; back++) {
    const v = byDate.get(dateStr(endMs - back * DAY_MS));
    if (isNum(v) && Number(v) > 0) values.push(Math.log(Number(v)));
  }
  if (values.length < MIN_HRV_READINGS_7D) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * How many consecutive recent days the 7-day recovery trend has sat under the
 * athlete's own baseline band, plus how many readings the last week holds.
 *
 * @param {Array} readings  [{ date: 'YYYY-MM-DD', hrv_ms: number }, …]
 * @param {string} todayStr athlete-local YYYY-MM-DD
 * @returns {{ hrvBelowBandDays: number|null, hrvReadings7d: number|null }}
 */
export function hrvBand(readings, todayStr) {
  const today = parseDay(todayStr);
  if (today == null) return { hrvBelowBandDays: null, hrvReadings7d: null };

  const byDate = new Map();
  for (const r of readings || []) {
    const key = String(r?.date || '').slice(0, 10);
    if (key && isNum(r?.hrv_ms) && Number(r.hrv_ms) > 0) byDate.set(key, Number(r.hrv_ms));
  }

  // Readings in the last 7 days — RDY-2 gates on this directly.
  let hrvReadings7d = 0;
  for (let back = 0; back < 7; back++) {
    if (byDate.has(dateStr(today - back * DAY_MS))) hrvReadings7d++;
  }
  if (byDate.size === 0) return { hrvBelowBandDays: null, hrvReadings7d: null };
  if (hrvReadings7d < MIN_HRV_READINGS_7D) return { hrvBelowBandDays: null, hrvReadings7d };

  // The band. Centre and spread both come from the DAILY log values over the
  // baseline window, not from the smoothed series — that distinction is the
  // whole calibration. Smoothing removes most of the variance, so an SD taken
  // on the rolling means gives a band a few thousandths wide that ordinary
  // jitter crosses every other day. 0.5 SD of the day-to-day values is the
  // smallest-worthwhile-change convention these thresholds come from.
  const baselineDays = MIN_HRV_BASELINE_DAYS + 30;
  const daily = [];
  for (let back = 0; back <= baselineDays; back++) {
    const v = byDate.get(dateStr(today - back * DAY_MS));
    if (isNum(v) && Number(v) > 0) daily.push(Math.log(Number(v)));
  }
  if (daily.length < MIN_HRV_BASELINE_DAYS) return { hrvBelowBandDays: null, hrvReadings7d };

  const baseline = daily.reduce((s, v) => s + v, 0) / daily.length;
  const variance = daily.reduce((s, v) => s + (v - baseline) ** 2, 0) / daily.length;
  const sd = Math.sqrt(variance);
  // A perfectly flat series has no band to fall below. Calling that "below"
  // on a rounding error would fire RDY-2 at an athlete whose recovery is,
  // literally, unchanging.
  if (!(sd > 0)) return { hrvBelowBandDays: 0, hrvReadings7d };

  const floor = baseline - HRV_BAND_SD * sd;

  // Consecutive recent days whose 7-day rolling mean sits under the floor.
  let hrvBelowBandDays = 0;
  for (let back = 0; back < baselineDays; back++) {
    const rolling = rollingLnMean(byDate, today - back * DAY_MS);
    if (rolling == null || rolling >= floor) break;
    hrvBelowBandDays++;
  }
  return { hrvBelowBandDays, hrvReadings7d };
}

/**
 * The four readiness fields, assembled.
 *
 * @param {object} o
 * @param {Array}  o.checkins  fatigue_checkins rows
 * @param {Array}  o.hrv       [{ date, hrv_ms }, …]
 * @param {string} o.todayStr
 */
export function buildReadiness({ checkins = [], hrv = [], todayStr } = {}) {
  const today = parseDay(todayStr);
  const todayRow =
    today == null ? null : (checkins || []).find((r) => String(r?.date || '').slice(0, 10) === dateStr(today));

  return {
    wellness: buildWellness(todayRow),
    wellnessLowStreak: wellnessLowStreak(checkins, todayStr),
    illnessFlag: illnessFlagFor(checkins, todayStr),
    ...hrvBand(hrv, todayStr),
  };
}
