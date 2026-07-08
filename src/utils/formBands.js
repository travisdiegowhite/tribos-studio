// Tribos Metrics Spec §5 — display-tier classifiers for form score and
// fs_confidence. These are the human/LLM characterization cuts; the
// scheduler's internal 4-zone classification in src/lib/training/tsb-projection.ts
// is a separate concern (session viability vs. characterization) and is
// intentionally NOT used here.

/**
 * THE canonical Form Score band table (spec §5). Every surface that turns a
 * Form Score into a word/color derives from these cuts — todayVocabulary,
 * lib/fitness/translate, the Spine's nodeView/formWord, the glance verdict,
 * and trainingPlans.interpretFS. Do not fork new band systems.
 *
 * Palette note: the spec names Yellow/Blue/Grey/Green/Red; the locked Tribos
 * palette has no blue/green, so the semantic mapping is:
 *   transition (>+20, losing fitness) → orange (caution)
 *   fresh (+10..+20)                  → gold   (sharp / race-ready)
 *   grey (−5..+10)                    → gray / muted
 *   optimal (−30..−5)                 → teal   (productive / on-track)
 *   overreached (<−30)                → coral  (warning)
 */
export const FORM_BANDS = [
  { key: 'transition',  word: 'Too fresh',    display: 'transition',                color: 'orange' },
  { key: 'fresh',       word: 'Fresh',        display: 'fresh',                     color: 'gold' },
  { key: 'grey',        word: 'Grey zone',    display: 'grey zone',                 color: 'gray' },
  { key: 'optimal',     word: 'Optimal load', display: 'optimal training load',     color: 'teal' },
  { key: 'overreached', word: 'Overreached',  display: 'high risk / overreached',   color: 'coral' },
];

/**
 * Resolve the spec §5 band for a Form Score.
 *
 * @param {number|null|undefined} fs - Form score (TFI − AFI).
 * @returns {{key: string, word: string, display: string, color: string}|null}
 */
export function formBandForScore(fs) {
  if (fs == null || !Number.isFinite(Number(fs))) return null;
  const v = Number(fs);
  if (v > 20) return FORM_BANDS[0];
  if (v >= 10) return FORM_BANDS[1];
  if (v >= -5) return FORM_BANDS[2];
  if (v >= -30) return FORM_BANDS[3];
  return FORM_BANDS[4];
}

/**
 * Classify a form score into the §5 display band.
 *
 * @param {number|null|undefined} fs - Form score (TFI − AFI).
 * @returns {string|null} One of: 'transition', 'fresh', 'grey zone',
 *   'optimal training load', 'high risk / overreached'. Returns null
 *   if the input is non-numeric.
 */
export function classifyFormBandDisplay(fs) {
  return formBandForScore(fs)?.display ?? null;
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
