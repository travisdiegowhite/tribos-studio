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
 * @todo Swap the formulas for spec §3.4 / §3.5 once the Tribos Metrics
 *       Specification lands in the repo. Keep this file in sync with the
 *       .ts twin.
 */

import { calculateCTL, estimateTSS } from './fitnessSnapshots.js';

export const DEFAULT_LONG_TAU = 42;
export const DEFAULT_SHORT_TAU = 7;

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
// Recompute per-user tau and persist onto user_profiles
// ────────────────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 42;

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
  const dailyTssVariance = variance(dailyTssArray);
  const longTau = calculateLongTimeConstant(metricsAge, dailyTssVariance);

  const currentLongEWA = calculateCTL(dailyTssArray, longTau);
  const shortTau = calculateShortTimeConstant(metricsAge, currentLongEWA);

  // 5. Persist. Upsert keyed on id so we don't clobber other columns.
  const { error: upsertErr } = await supabase
    .from('user_profiles')
    .update({ ewa_long_tau: longTau, ewa_short_tau: shortTau })
    .eq('id', userId);

  if (upsertErr) throw upsertErr;

  return {
    userId,
    metricsAge,
    longTau,
    shortTau,
  };
}
