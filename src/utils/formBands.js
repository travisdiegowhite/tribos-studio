// Tribos Metrics Spec §5 — display-tier classifiers for form score and
// fs_confidence. These are the human/LLM characterization cuts; the
// scheduler's internal 4-zone classification in src/lib/training/tsb-projection.ts
// is a separate concern (session viability vs. characterization) and is
// intentionally NOT used here.

/**
 * Classify a form score into the §5 display band.
 *
 * @param {number|null|undefined} fs - Form score (TFI − AFI).
 * @returns {string|null} One of: 'transition', 'fresh', 'grey zone',
 *   'optimal training load', 'high risk / overreached'. Returns null
 *   if the input is non-numeric.
 */
export function classifyFormBandDisplay(fs) {
  if (fs == null || !Number.isFinite(Number(fs))) return null;
  const v = Number(fs);
  if (v > 20) return 'transition';
  if (v >= 10) return 'fresh';
  if (v >= -5) return 'grey zone';
  if (v >= -30) return 'optimal training load';
  return 'high risk / overreached';
}

/**
 * Classify an fs_confidence value into a display tier per spec §5.
 * Used to decide how much hedging to apply when surfacing form to the LLM.
 *
 * @param {number|null|undefined} c - fs_confidence in [0, 1].
 * @returns {'high'|'moderate'|'low'|null}
 */
export function classifyFsConfidenceTier(c) {
  if (c == null || !Number.isFinite(Number(c))) return null;
  const v = Number(c);
  if (v >= 0.85) return 'high';
  if (v >= 0.60) return 'moderate';
  return 'low';
}

/**
 * Days between two YYYY-MM-DD date strings (or anything Date can parse).
 * Returns a non-negative integer.
 *
 * @param {string|Date} a
 * @param {string|Date} b
 * @returns {number}
 */
export function daysBetween(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  const ms = Math.abs(db.getTime() - da.getTime());
  return Math.round(ms / 86400000);
}
