/**
 * deriveTss — compute IF, TSS, and RSS from normalized power + FTP + duration.
 *
 * Closes the single most important functional gap in the ping/pull rebuild:
 * Garmin's Activity Details endpoint (Activity API v1.2.5 §7.3) returns
 * `samples[].powerInWatts` but DOES NOT return device-computed
 * normalized_power / training_stress_score / intensity_factor / threshold_power
 * (confirmed: `activityDetailsParser.js#mapDetailSummary` sets all four to
 * null). The webhook PUSH path used to read these from the FIT file's session
 * record; in the ping/pull rebuild we compute them ourselves from the power
 * stream + the athlete's stored FTP.
 *
 * Formulas (standard, matches the FIT-file values within rounding):
 *   IF  = NP / FTP
 *   TSS = (durationSec * NP * IF) / (FTP * 3600) * 100
 *
 * Per the metrics-freeze policy in CLAUDE.md, callers MUST dual-write the
 * canonical (`rss`, `ride_intensity`) AND legacy (`tss`, `intensity_factor`)
 * columns. This helper returns BOTH so the writer doesn't have to remember.
 * `rss === tss` and `rideIntensity === intensityFactor` for power-derived
 * rides — per metrics spec (D4) the terrain multiplier applies ONLY to the
 * `kJ` and `inferred` RSS source tiers, not to `power` tier.
 */

/**
 * @param {object} args
 * @param {number|null|undefined} args.np            Normalized power (watts).
 * @param {number|null|undefined} args.ftp           Functional threshold power (watts).
 * @param {number|null|undefined} args.durationSec   Moving time in seconds (NOT minutes).
 * @returns {{
 *   intensityFactor: number|null,
 *   rideIntensity:   number|null,
 *   tss:             number|null,
 *   rss:             number|null
 * }} All four fields, or all nulls when any input is missing/invalid.
 */
export function deriveTss({ np, ftp, durationSec } = {}) {
  const nullResult = { intensityFactor: null, rideIntensity: null, tss: null, rss: null };

  if (!isPositiveFinite(np) || !isPositiveFinite(ftp) || !isPositiveFinite(durationSec)) {
    return nullResult;
  }

  const intensityFactor = round3(np / ftp);
  const tss = round1((durationSec * np * (np / ftp)) / (ftp * 3600) * 100);

  return {
    intensityFactor,
    rideIntensity: intensityFactor,
    tss,
    rss: tss,
  };
}

function isPositiveFinite(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
