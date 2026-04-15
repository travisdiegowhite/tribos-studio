/**
 * Adaptive EWA Time Constants — server-side helper.
 *
 * Mirrors src/lib/training/adaptive-tau.ts. The api/ directory can't import
 * TypeScript source from src/, so the math is duplicated here (following
 * the same pattern as calculateCTL/ATL in api/utils/fitnessSnapshots.js).
 *
 * Exposes the spec §3.4 / §3.5 discrete-bracket formulas
 * (calculateTFITimeConstant, calculateAFITimeConstant) plus the nightly
 * `recomputeUserTauConstants(supabase, userId)` cron routine that reads
 * recent activities, derives per-user tau values, and upserts them onto
 * user_profiles.tfi_tau / afi_tau.
 *
 * Legacy v1 helpers and the ewa_long_tau / ewa_short_tau columns were
 * removed in B4 (migration 071).
 */

import { calculateCTL, estimateTSS } from './fitnessSnapshots.js';

export const DEFAULT_TFI_TAU = 42;
export const DEFAULT_AFI_TAU = 7;

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

const LOOKBACK_DAYS = 180;

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
 * - Pulls a 180-day daily-TSS series: TFI-series variance feeds §3.4;
 *   a forward-walked EWA at the freshly-computed tau supplies current
 *   TFI for §3.5.
 * - Uses the shared supabase admin client provided by the caller — never
 *   creates its own (see CLAUDE.md connection hygiene rules).
 *
 * @param {Object} supabase - Supabase admin client (service role).
 * @param {string} userId
 * @returns {Promise<{ userId: string, skipped?: true, reason?: string,
 *                     tfiTau?: number, afiTau?: number,
 *                     metricsAge?: number }>}
 */
export async function recomputeUserTauConstants(supabase, userId) {
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

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('ftp')
    .eq('user_id', userId)
    .maybeSingle();
  const userFtp = prefs?.ftp || null;

  // Bucket daily stress into a 180-day array (oldest → newest).
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

  // §3.4: variance of a forward-walked TFI series under default tau.
  // Once the training_load_daily.tfi column is populated historically
  // this can pull the persisted TFI series directly.
  const tfiSeries = [];
  let tfiRunning = 0;
  for (const t of dailyTssArray) {
    tfiRunning = tfiRunning + (t - tfiRunning) * (1 / DEFAULT_TFI_TAU);
    tfiSeries.push(tfiRunning);
  }
  const tfiVariance6Months = variance(tfiSeries);
  const tfiTau = calculateTFITimeConstant(metricsAge, tfiVariance6Months);

  // §3.5: current TFI from forward-walked EWA at the fresh tau.
  const currentTFI = calculateCTL(dailyTssArray, tfiTau);
  const afiTau = calculateAFITimeConstant(metricsAge, currentTFI);

  const { error: upsertErr } = await supabase
    .from('user_profiles')
    .update({ tfi_tau: tfiTau, afi_tau: afiTau })
    .eq('id', userId);

  if (upsertErr) throw upsertErr;

  return { userId, metricsAge, tfiTau, afiTau };
}
