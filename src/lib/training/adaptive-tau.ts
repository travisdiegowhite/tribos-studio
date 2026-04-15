/**
 * Adaptive EWA Time Constants
 *
 * Per-athlete tau values for the fitness (CTL / long EWA) and fatigue
 * (ATL / short EWA) exponentially-weighted averages. The rest of the app
 * continues to call `calculateCTL(dailyTSS)` / `calculateATL(dailyTSS)`
 * with the baked-in 42 / 7 defaults when adaptive tau is unavailable.
 *
 * Gating: adaptive tau only applies once the athlete has entered an age.
 * If `age` is null/undefined, these helpers return `DEFAULT_LONG_TAU` /
 * `DEFAULT_SHORT_TAU` so downstream math is identical to the pre-adaptive
 * behavior.
 *
 * The v1 formulas here (`calculateLongTimeConstant` /
 * `calculateShortTimeConstant`) remain in place during the B1→B4 rollout
 * of the Tribos Metrics Specification. They write ewa_long_tau /
 * ewa_short_tau. The spec §3.4 / §3.5 discrete-bracket formulas
 * (`calculateTFITimeConstant` / `calculateAFITimeConstant`) live below
 * this file and write tfi_tau / afi_tau via the same nightly cron.
 * Reader cut-over and removal of the legacy columns + helpers ship in
 * B3 and B4 respectively.
 */

export const DEFAULT_LONG_TAU = 42;
export const DEFAULT_SHORT_TAU = 7;

// Age at which both tau formulas bottom out at the defaults.
const BASELINE_AGE = 35;

// Variance at which the long-tau variance adjustment is zero. Picked so
// that a runner-of-the-mill athlete with ~30 TSS/day day-to-day noise
// (variance ≈ 900) sits on the baseline.
const BASELINE_TSS_VARIANCE = 900;

// Clamp bounds (mirror the CHECK constraints on user_profiles).
const LONG_TAU_MIN = 35;
const LONG_TAU_MAX = 60;
const SHORT_TAU_MIN = 5;
const SHORT_TAU_MAX = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo1dp(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compute the long EWA tau (fitness / CTL window) for an athlete.
 *
 * @param age - Athlete age in years. NULL/undefined → `DEFAULT_LONG_TAU`.
 * @param dailyTssVariance - Variance of daily TSS over a recent window
 *   (e.g. last 42 days). NULL/undefined is treated as "baseline", i.e.
 *   no variance adjustment.
 * @returns tau in days, clamped to [35, 60], rounded to 1 decimal place.
 */
export function calculateLongTimeConstant(
  age: number | null | undefined,
  dailyTssVariance: number | null | undefined
): number {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_LONG_TAU;
  }

  const ageAdj = 0.3 * (age - BASELINE_AGE);

  const variance = Number.isFinite(dailyTssVariance as number)
    ? (dailyTssVariance as number)
    : BASELINE_TSS_VARIANCE;
  const varAdj = clamp((variance - BASELINE_TSS_VARIANCE) / 100, -5, 10);

  return roundTo1dp(
    clamp(DEFAULT_LONG_TAU + ageAdj + varAdj, LONG_TAU_MIN, LONG_TAU_MAX)
  );
}

/**
 * Compute the short EWA tau (fatigue / ATL window) for an athlete.
 *
 * @param age - Athlete age in years. NULL/undefined → `DEFAULT_SHORT_TAU`.
 * @param currentLongEWA - Current CTL-ish value (long EWA) for the
 *   athlete. Passing the freshly-computed long EWA keeps the short window
 *   consistent with how much fitness the athlete is carrying.
 *   NULL/undefined → treated as 0 (no load adjustment).
 * @returns tau in days, clamped to [5, 14], rounded to 1 decimal place.
 */
export function calculateShortTimeConstant(
  age: number | null | undefined,
  currentLongEWA: number | null | undefined
): number {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_SHORT_TAU;
  }

  const ageAdj = 0.05 * (age - BASELINE_AGE);

  const longEwa = Number.isFinite(currentLongEWA as number)
    ? (currentLongEWA as number)
    : 0;
  const loadAdj = longEwa > 70 ? 1 : 0;

  return roundTo1dp(
    clamp(DEFAULT_SHORT_TAU + ageAdj + loadAdj, SHORT_TAU_MIN, SHORT_TAU_MAX)
  );
}

/**
 * Placeholder HRV modulation. Tracked as future work per the rename plan —
 * the helper exists so future HRV-aware callers don't need to re-plumb,
 * but today it's an identity function.
 *
 * @todo Implement HRV-based modulation once `latest_hrv_rmssd` lands on
 *       user_profiles.
 */
export function applyHRVModulation(
  tau: number,
  _hrvRmssd?: number | null
): number {
  return tau;
}

// ────────────────────────────────────────────────────────────────────────
// Spec §3.4 / §3.5 — discrete age brackets (TFI / AFI)
//
// Rolled out alongside the legacy calculateLongTimeConstant /
// calculateShortTimeConstant above. The legacy helpers keep populating
// ewa_long_tau / ewa_short_tau on user_profiles until the reader cut-over
// (B3) and column drop (B4). The new helpers below populate tfi_tau /
// afi_tau via the same nightly cron.
// ────────────────────────────────────────────────────────────────────────

export const DEFAULT_TFI_TAU = 42;
export const DEFAULT_AFI_TAU = 7;

/**
 * Compute the TFI (Training Fitness Index) time constant — spec §3.4.
 *
 * Discrete age brackets:
 *   age < 30  → 0.90
 *   age < 45  → 1.00
 *   age < 55  → 1.10
 *   otherwise → 1.20
 *
 * History factor: TFI variance over the trailing 6 months. Variance > 20
 * bumps tau by 5% (captures athletes with uneven training blocks, whose
 * fitness window needs to be longer to smooth the signal).
 *
 * @param age Athlete age in years. NULL/undefined → `DEFAULT_TFI_TAU`.
 * @param tfiVariance6Months Variance of TFI values across the trailing
 *   ~180 days. NULL/undefined is treated as 0 (no history bump).
 * @returns tau in days, rounded to nearest integer.
 */
export function calculateTFITimeConstant(
  age: number | null | undefined,
  tfiVariance6Months: number | null | undefined
): number {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_TFI_TAU;
  }

  let ageFactor: number;
  if (age < 30) ageFactor = 0.9;
  else if (age < 45) ageFactor = 1.0;
  else if (age < 55) ageFactor = 1.1;
  else ageFactor = 1.2;

  const variance = Number.isFinite(tfiVariance6Months as number)
    ? (tfiVariance6Months as number)
    : 0;
  const historyFactor = variance > 20 ? 1.05 : 1.0;

  return Math.round(42 * ageFactor * historyFactor);
}

/**
 * Compute the AFI (Acute Fatigue Index) time constant — spec §3.5.
 *
 * Discrete age brackets (more aggressive than TFI; AFI moves fast):
 *   age < 30  → 0.85
 *   age < 45  → 1.00
 *   age < 55  → 1.15
 *   otherwise → 1.30
 *
 * Load factor: `currentTFI > 100` bumps tau by 10% (high chronic load
 * means the fatigue window should be a touch longer so a single hard day
 * doesn't dominate).
 *
 * @param age Athlete age in years. NULL/undefined → `DEFAULT_AFI_TAU`.
 * @param currentTFI Current Training Fitness Index. NULL/undefined is
 *   treated as 0 (no load bump).
 * @returns tau in days, rounded to 1 decimal place.
 */
export function calculateAFITimeConstant(
  age: number | null | undefined,
  currentTFI: number | null | undefined
): number {
  if (age == null || !Number.isFinite(age)) {
    return DEFAULT_AFI_TAU;
  }

  let ageFactor: number;
  if (age < 30) ageFactor = 0.85;
  else if (age < 45) ageFactor = 1.0;
  else if (age < 55) ageFactor = 1.15;
  else ageFactor = 1.3;

  const tfi = Number.isFinite(currentTFI as number) ? (currentTFI as number) : 0;
  const loadFactor = tfi > 100 ? 1.1 : 1.0;

  return +(7 * ageFactor * loadFactor).toFixed(1);
}
