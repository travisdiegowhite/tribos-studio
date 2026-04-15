/**
 * Adaptive EWA Time Constants — server-side helper.
 *
 * Mirrors src/lib/training/adaptive-tau.ts. The api/ directory can't import
 * TypeScript source from src/, so the math is duplicated here (following
 * the same pattern as calculateCTL/ATL in api/utils/fitnessSnapshots.js).
 *
 * Exposes pure math (`calculateLongTimeConstant`, `calculateShortTimeConstant`,
 * `applyHRVModulation`) plus `recomputeUserTauConstants(supabase, userId)` —
 * the nightly cron routine that reads recent activities, derives the per-user
 * tau values, and upserts them onto user_profiles.
 *
 * The spec §3.4 / §3.5 discrete-bracket formulas (calculateTFITimeConstant /
 * calculateAFITimeConstant) are added alongside below. The cron dual-writes
 * both legacy (ewa_long_tau/ewa_short_tau) and new (tfi_tau/afi_tau)
 * columns during the B1→B4 rollout. Keep this file in sync with the .ts
 * twin in src/lib/training/adaptive-tau.ts.
 */

import { calculateCTL, estimateTSS } from './fitnessSnapshots.js';

export const DEFAULT_LONG_TAU = 42;
export const DEFAULT_SHORT_TAU = 7;
export const DEFAULT_TFI_TAU = 42;
export const DEFAULT_AFI_TAU = 7;

// See adaptive-tau.ts for rationale on these constants.
const BASELINE_AGE = 35;
const BASELINE_TSS_VARIANCE = 900;
const LONG_TAU_MIN = 35;
const LONG_TAU_MAX = 60;
const SHORT_TAU_MIN = 5;
const SHORT_TAU_MAX = 14;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo1dp(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Compute the long EWA tau (fitness / CTL window) for an athlete.
 */
export function calculateLongTimeConstant(age, dailyTssVariance) {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_LONG_TAU;
  }

  const ageAdj = 0.3 * (age - BASELINE_AGE);

  const variance = Number.isFinite(dailyTssVariance)
    ? dailyTssVariance
    : BASELINE_TSS_VARIANCE;
  const varAdj = clamp((variance - BASELINE_TSS_VARIANCE) / 100, -5, 10);

  return roundTo1dp(
    clamp(DEFAULT_LONG_TAU + ageAdj + varAdj, LONG_TAU_MIN, LONG_TAU_MAX)
  );
}

/**
 * Compute the short EWA tau (fatigue / ATL window) for an athlete.
 */
export function calculateShortTimeConstant(age, currentLongEWA) {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_SHORT_TAU;
  }

  const ageAdj = 0.05 * (age - BASELINE_AGE);

  const longEwa = Number.isFinite(currentLongEWA) ? currentLongEWA : 0;
  const loadAdj = longEwa > 70 ? 1 : 0;

  return roundTo1dp(
    clamp(DEFAULT_SHORT_TAU + ageAdj + loadAdj, SHORT_TAU_MIN, SHORT_TAU_MAX)
  );
}

/**
 * Placeholder HRV modulation — identity function today.
 * @todo Implement once `latest_hrv_rmssd` lands on user_profiles.
 */
export function applyHRVModulation(tau, _hrvRmssd) {
  return tau;
}

// ────────────────────────────────────────────────────────────────────────
// Spec §3.4 / §3.5 — discrete age brackets (TFI / AFI).
// Mirror of src/lib/training/adaptive-tau.ts. See that file for rationale.
// ────────────────────────────────────────────────────────────────────────

/**
 * Compute the TFI (Training Fitness Index) time constant — spec §3.4.
 */
export function calculateTFITimeConstant(age, tfiVariance6Months) {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_TFI_TAU;
  }

  let ageFactor;
  if (age < 30) ageFactor = 0.9;
  else if (age < 45) ageFactor = 1.0;
  else if (age < 55) ageFactor = 1.1;
  else ageFactor = 1.2;

  const variance = Number.isFinite(tfiVariance6Months) ? tfiVariance6Months : 0;
  const historyFactor = variance > 20 ? 1.05 : 1.0;

  return Math.round(42 * ageFactor * historyFactor);
}

/**
 * Compute the AFI (Acute Fatigue Index) time constant — spec §3.5.
 */
export function calculateAFITimeConstant(age, currentTFI) {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_AFI_TAU;
  }

  let ageFactor;
  if (age < 30) ageFactor = 0.85;
  else if (age < 45) ageFactor = 1.0;
  else if (age < 55) ageFactor = 1.15;
  else ageFactor = 1.3;

  const tfi = Number.isFinite(currentTFI) ? currentTFI : 0;
  const loadFactor = tfi > 100 ? 1.1 : 1.0;

  return +(7 * ageFactor * loadFactor).toFixed(1);
}

// ────────────────────────────────────────────────────────────────────────
// Recompute per-user tau and persist onto user_profiles
// ────────────────────────────────────────────────────────────────────────

// 180 days feeds the §3.4 TFI-variance input; the legacy 42-day window
// is carved out of the tail for the old variance formula.
const LOOKBACK_DAYS = 180;
const LEGACY_VARIANCE_WINDOW = 42;

/**
 * Variance of a numeric array (population variance; divisor = n).
 * Returns 0 for empty/single-element arrays.
 */
function variance(values) {
  if (!values || values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return sq / values.length;
}

/**
 * Derive adaptive tau for a single user and upsert onto user_profiles.
 *
 * - Skips users with NULL `metrics_age` (adaptive tau is gated by age).
 * - Uses the last 42 days of activities to derive daily TSS variance and
 *   a current long EWA (via calculateCTL) as inputs to the math helpers.
 * - Uses the shared supabase admin client provided by the caller — never
 *   creates its own (see CLAUDE.md connection hygiene rules).
 *
 * @param {Object} supabase - Supabase admin client (service role).
 * @param {string} userId
 * @returns {Promise<{ userId: string, skipped?: true, reason?: string,
 *                     longTau?: number, shortTau?: number,
 *                     metricsAge?: number }>}
 */
export async function recomputeUserTauConstants(supabase, userId) {
  // 1. Fetch the gating input (age). If missing, skip — current adaptive
  //    behavior only kicks in once the user has entered age in Settings.
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('metrics_age')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) throw profileErr;

  const metricsAge = profile?.metrics_age ?? null;
  if (metricsAge == null) {
    return { userId, skipped: true, reason: 'no_age' };
  }

  // 2. Pull recent activities to estimate dailyTSS variance + long EWA.
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - LOOKBACK_DAYS);

  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select(
      `id, type, sport_type, start_date, moving_time, elapsed_time,
       distance, total_elevation_gain, average_watts, kilojoules,
       average_heartrate, trainer, is_hidden, duplicate_of,
       normalized_power, tss, intensity_factor`
    )
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gte('start_date', windowStart.toISOString())
    .lt('start_date', windowEnd.toISOString())
    .order('start_date', { ascending: true });

  if (actErr) throw actErr;

  // FTP (for TSS estimation fallback).
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('ftp')
    .eq('user_id', userId)
    .maybeSingle();
  const userFtp = prefs?.ftp || null;

  // 3. Bucket TSS by day over the lookback window.
  const dailyTssMap = {};
  for (const activity of activities || []) {
    const actDate = activity.start_date.split('T')[0];
    const tss = estimateTSS(activity, userFtp);
    dailyTssMap[actDate] = (dailyTssMap[actDate] || 0) + tss;
  }

  const dailyTssArray = [];
  for (let i = LOOKBACK_DAYS - 1; i >= 0; i--) {
    const date = new Date(windowEnd);
    date.setDate(date.getDate() - i - 1);
    const dateStr = date.toISOString().split('T')[0];
    dailyTssArray.push(dailyTssMap[dateStr] || 0);
  }

  // 4. Feed the helpers. We compute long EWA first at the new long-tau so
  //    the short-tau calculation sees a representative chronic load.
  //
  //    Legacy (ewa_long_tau / ewa_short_tau): variance of the trailing 42
  //    daily TSS values (input to the v1 continuous formulas).
  //    Spec §3.4 / §3.5: variance of a TFI series derived by forward-
  //    walking an EWA under the default TFI tau across the 180-day
  //    lookback. Currently bootstrapped from daily TSS — once B2 ships
  //    the dual-write of training_load_daily.tfi, this can pull the
  //    persisted TFI series directly.
  const legacyWindow = dailyTssArray.slice(-LEGACY_VARIANCE_WINDOW);
  const dailyTssVariance = variance(legacyWindow);
  const longTau = calculateLongTimeConstant(metricsAge, dailyTssVariance);

  const tfiSeries = [];
  let tfiRunning = 0;
  for (const t of dailyTssArray) {
    tfiRunning = tfiRunning + (t - tfiRunning) * (1 / DEFAULT_TFI_TAU);
    tfiSeries.push(tfiRunning);
  }
  const tfiVariance6Months = variance(tfiSeries);
  const tfiTau = calculateTFITimeConstant(metricsAge, tfiVariance6Months);

  const currentLongEWA = calculateCTL(dailyTssArray, longTau);
  const shortTau = calculateShortTimeConstant(metricsAge, currentLongEWA);
  const afiTau = calculateAFITimeConstant(metricsAge, currentLongEWA);

  // 5. Persist. Dual-write during the B1→B4 rollout: legacy columns
  //    (ewa_long_tau / ewa_short_tau) plus the new tfi_tau / afi_tau.
  const { error: upsertErr } = await supabase
    .from('user_profiles')
    .update({
      ewa_long_tau: longTau,
      ewa_short_tau: shortTau,
      tfi_tau: tfiTau,
      afi_tau: afiTau,
    })
    .eq('id', userId);

  if (upsertErr) throw upsertErr;

  return {
    userId,
    metricsAge,
    longTau,
    shortTau,
    tfiTau,
    afiTau,
  };
}
