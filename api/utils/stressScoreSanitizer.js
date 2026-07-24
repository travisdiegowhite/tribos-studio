/**
 * Stress-score sanitizer — shared guard for every write of a device-reported
 * training stress score into activities.tss / activities.rss.
 *
 * Garmin FIT encodes training_stress_score as uint16 scaled ×10; the protocol
 * "no data" sentinel 0xFFFF (65535) therefore arrives as 6553.5 and was being
 * written verbatim into the database, where each corrupted activity counted as
 * a 500-stress monster day (both fitness engines cap per-activity stress at
 * 500). Partially-invalid decodes also produce other absurd values (e.g.
 * 5598.9 on a zero-moving-time activity).
 *
 * The < 1000 bound can never clip a value the app would display — the engines
 * cap at 500 — and legitimate device TSS ≥ 1000 does not occur in practice.
 * Rejecting (returning null) is deliberately better than clamping: a null
 * lets the tiered estimators fall back to HR/power/duration and produce a
 * sane value instead of a capped 500.
 */

const MAX_PLAUSIBLE_STRESS_SCORE = 1000;

/**
 * @param {unknown} value device-reported training stress score
 * @returns {number|null} the value if plausible, else null
 */
export function sanitizeStressScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0 || value >= MAX_PLAUSIBLE_STRESS_SCORE) return null;
  return value;
}
