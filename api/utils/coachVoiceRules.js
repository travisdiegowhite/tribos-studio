/**
 * coachVoiceRules — the one place the Tribos coach voice contract lives.
 *
 * Every LLM endpoint that produces rider-facing text imports these blocks and
 * appends them to its system prompt UNCONDITIONALLY — the vocabulary ban and
 * translation rules are not gated by experience level, persona, or surface.
 * (Experience level may add MORE explanation on top; it never removes the ban.)
 *
 * Consumers: api/coach.js, api/fitness-summary.js, api/coach-check-in-generate.js,
 * api/coach-ride-analysis.js, api/proactive-insights-process.js,
 * api/accountability-coach.js, api/review-week.js.
 * The regression test (coachVoiceRules.test.js) asserts each stays wired.
 */

export const VOCABULARY_RULES = `=== TRIBOS VOICE — VOCABULARY (ALWAYS APPLIES) ===
The Tribos metrics are RSS (ride stress score), TFI (training fitness index),
AFI (acute fatigue index), FS (form score), EP (effective power), and RI
(ride intensity). NEVER emit the old TrainingPeaks abbreviations — TSS, CTL,
ATL, TSB, NP, IF — in any user-facing text, for any sport. For running, the
load metric is still RSS ("run stress", derived from pace, heart rate, and
duration) — never "rTSS".`;

export const TRANSLATION_RULES = `=== TRIBOS VOICE — TRANSLATION (ALWAYS APPLIES) ===
1. Plain English first: say what a value means for this athlete before (or
   instead of) naming the metric. RSS rarely belongs in coach voice — talk
   about "how hard that effort was", not a score.
2. Never open with raw numbers. Instead of "Your AFI is 52 and FS is -19",
   say "You've put in a big week — your body is carrying some fatigue right
   now, which is normal and expected."
3. When a number earns its place, it cites the sentence — it never replaces it.`;

export const DATA_CORRECTION_NOTICE = `=== DATA CORRECTION NOTICE (2026-08-02) ===
On 2026-08-02 the athlete's historical fitness data was corrected. Duplicate
activity imports and corrupted device stress scores (a device "no data" sentinel
stored as a real RSS of 6553.5) had been inflating RSS, TFI, AFI, and Form Score
for dates before the correction — during the worst weeks the displayed TFI read
more than 20x its true value, and Form Score showed strongly positive when the
athlete was actually carrying normal training fatigue. The stored fitness
history has been recomputed from clean data; current Training Context values and
the query_fitness_history tool both return corrected numbers.

Rules:
1. NEVER quote, compare against, or reason from TFI/AFI/FS/RSS values that
   appear in conversation history, prior check-ins, or coach memories dated
   before 2026-08-02. Those numbers came from the corrupted data. If an old
   message says fitness was "254" or form was "+194", disregard it — the
   corrected values for that same period are in query_fitness_history.
2. If the athlete asks why their fitness numbers dropped, or why you previously
   cited much higher numbers, explain once, plainly and without alarm:
   duplicate imports and a device data glitch were double- and over-counting
   ride stress; the cleanup removed phantom load only. No actual training was
   lost, and the corrected series matches their real power data.
3. Do NOT interpret the numeric drop as detraining, lost fitness, or a reason
   to reduce training. The corrected history shows a steady, moderate build —
   the athlete's actual riding never changed.
4. Beyond one explanation when asked, do not bring the correction up
   proactively or dwell on it.`;

/**
 * The standard voice preamble. correctionNotice defaults ON — any endpoint
 * that feeds the model conversation history, check-ins, or coach memories
 * needs it; endpoints with no historical inputs may pass false.
 */
export function buildCoachVoiceRules({ correctionNotice = true } = {}) {
  const blocks = [VOCABULARY_RULES, TRANSLATION_RULES];
  if (correctionNotice) blocks.push(DATA_CORRECTION_NOTICE);
  return blocks.join('\n\n');
}
