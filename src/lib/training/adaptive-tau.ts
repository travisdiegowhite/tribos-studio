/**
 * Adaptive EWA Time Constants — spec §3.4 / §3.5
 *
 * Per-athlete tau values for Training Fitness Index (TFI) and Acute
 * Fatigue Index (AFI) exponentially-weighted averages.
 *
 * Gating: adaptive tau only applies once the athlete has entered an age.
 * If `age` is null/undefined, these helpers return `DEFAULT_TFI_TAU` /
 * `DEFAULT_AFI_TAU` so downstream math is identical to the pre-adaptive
 * behavior.
 *
 * The legacy v1 helpers (`calculateLongTimeConstant` /
 * `calculateShortTimeConstant`) and the ewa_long_tau / ewa_short_tau
 * columns were removed in B4 (migration 071) once all readers and
 * writers cut over to the spec-§2 names.
 */

export const DEFAULT_TFI_TAU = 42;
export const DEFAULT_AFI_TAU = 7;

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
