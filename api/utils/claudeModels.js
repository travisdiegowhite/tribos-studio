// The one place Claude model IDs live. Every endpoint imports its model from
// MODELS below; `claudeModels.test.js` fails CI on a model ID written
// anywhere else under api/, src/ or scripts/.
//
// Why: on 2026-06-15 Anthropic retired claude-sonnet-4-20250514. Nine call
// sites in seven endpoints still used it, scattered as string literals, and
// most of them caught the 404 and fell back to a default — so persona
// classification, onboarding messages, fuel summaries and more quietly
// degraded for five months until a follow-up email arrived. Earlier, an ID
// that never existed sat in proactive-insights-process.js and 404'd on every
// call (215 of 215 insights) for the same reason.
//
// When Anthropic announces a deprecation:
//   1. Set `retires` on that ID in MODEL_LIFECYCLE below.
//   2. CI goes red 30 days before that date for every role still on it.
//   3. Move those roles in MODELS to the replacement, then read the model's
//      migration notes: a newer model can reject old request parameters
//      (Sonnet 5.5 400s on `temperature`, and its replies can start with a
//      thinking block, so read text by block type, never content[0]).
//
// A new model ID must be added to MODEL_LIFECYCLE before any role can use it;
// the test rejects unknown IDs, which is what catches a typo or an invented
// date suffix.

/** Model per feature. Change a feature's model here, nowhere else. */
export const MODELS = Object.freeze({
  // Coach (chat, check-ins, corrections, persona)
  COACH_CHAT: 'claude-sonnet-4-6', // api/coach.js
  COACH_CHECK_IN_REQUEST: 'claude-sonnet-4-6', // api/coach-check-in-request.js
  COACH_CHECK_IN_GENERATE: 'claude-sonnet-5-5', // api/coach-check-in-generate.js
  COACH_CORRECTION: 'claude-sonnet-4-6', // api/coach-correction-trigger.js
  COACH_RIDE_ANALYSIS: 'claude-sonnet-5-5', // api/coach-ride-analysis.js
  COACH_PERSONA_CLASSIFY: 'claude-sonnet-5-5', // api/coach-classify-persona.js, api/onboarding-complete.js
  ONBOARDING_MESSAGE: 'claude-sonnet-5-5', // api/onboarding-complete.js
  ACCOUNTABILITY_COACH: 'claude-sonnet-5-5', // api/accountability-coach.js
  ACCOUNTABILITY_MEMORY: 'claude-sonnet-5-5', // api/accountability-coach.js
  THREAD_TITLE: 'claude-sonnet-5-5', // api/generate-thread-title.js
  WEEK_REVIEW: 'claude-sonnet-5-5', // api/review-week.js
  PROACTIVE_INSIGHT: 'claude-opus-5', // api/proactive-insights-process.js
  FITNESS_SUMMARY: 'claude-haiku-4-5-20251001', // api/fitness-summary.js

  // Season and races
  SEASON_COACH: 'claude-opus-5-5', // api/season-coach.js, scripts/season-coach-samples.mjs
  RACE_SEARCH: 'claude-sonnet-5-5', // api/utils/raceSearch.js, api/utils/eventCatalogRefresh.js

  // Routes
  ROUTE_GENERATION: 'claude-sonnet-5-5', // api/claude-routes.js
  ROUTE_COACH: 'claude-sonnet-4-6', // api/route-coach.js

  // Plans, fuel, gear, admin
  TRAINING_PLAN_PARSE: 'claude-sonnet-5-5', // api/parse-training-plan.js
  FUEL_SUMMARY: 'claude-sonnet-5-5', // api/fuel-plan.js
  GEAR_VISION: 'claude-opus-5', // api/gear-vision.js
  SHOP_IDENTIFY: 'claude-opus-5-5', // api/shop-identify.js
  ADMIN_ANALYSIS: 'claude-sonnet-5-5', // api/admin-analysis.js
});

/**
 * Every model ID the codebase may name, with its retirement date
 * (YYYY-MM-DD, UTC) once Anthropic has announced one. `retires: null` means
 * no retirement announced. Keep retired IDs here with their date: they make
 * CI reject the ID if it is ever pasted back in.
 *
 * Source: the "Model deprecations" page in Anthropic's Claude docs, and the
 * deprecation emails sent to the account owner.
 */
export const MODEL_LIFECYCLE = Object.freeze({
  // Current
  'claude-fable-5-2': { retires: null },
  'claude-fable-5-1': { retires: null },
  'claude-fable-5': { retires: null },
  'claude-opus-5-5': { retires: null },
  'claude-opus-5': { retires: null },
  'claude-opus-4-8': { retires: null },
  'claude-opus-4-7': { retires: null },
  'claude-opus-4-6': { retires: null },
  'claude-opus-4-5': { retires: null },
  'claude-opus-4-5-20251101': { retires: null },
  'claude-sonnet-5-5': { retires: null },
  'claude-sonnet-5': { retires: null },
  'claude-sonnet-4-6': { retires: null },
  'claude-haiku-5-5': { retires: null },
  'claude-haiku-4-5': { retires: null },
  'claude-haiku-4-5-20251001': { retires: null },

  // Deprecated: retirement announced
  'claude-sonnet-4-5': { retires: '2026-11-30' },
  'claude-sonnet-4-5-20250929': { retires: '2026-11-30' },

  // Retired: requests return 404 not_found_error
  'claude-opus-4-1-20250805': { retires: '2026-08-05' },
  'claude-sonnet-4-20250514': { retires: '2026-06-15' },
  'claude-opus-4-20250514': { retires: '2026-06-15' },
  'claude-3-haiku-20240307': { retires: '2026-04-20' },
  'claude-3-7-sonnet-20250219': { retires: '2026-02-19' },
  'claude-3-5-haiku-20241022': { retires: '2026-02-19' },
  'claude-3-opus-20240229': { retires: '2026-01-05' },
  'claude-3-5-sonnet-20241022': { retires: '2025-10-28' },
  'claude-3-5-sonnet-20240620': { retires: '2025-10-28' },
  'claude-3-sonnet-20240229': { retires: '2025-07-21' },
  'claude-2.1': { retires: '2025-07-21' },
  'claude-2.0': { retires: '2025-07-21' },
});

/** CI fails this many days before a role's model retires. */
export const RETIREMENT_WARNING_DAYS = 30;

/**
 * Matches anything shaped like a Claude model ID (`claude-` followed by a
 * family name or a Claude 2/3 version number). Shared with the test so both
 * sides agree on what counts as a model ID.
 */
export const MODEL_ID_PATTERN = /\bclaude-(?:opus|sonnet|haiku|fable|mythos|instant|[0-9])[a-z0-9.-]*[a-z0-9]/g;

/**
 * Days until `modelId` retires, relative to `now`. Negative once retired;
 * null when no retirement is announced or the ID is unknown.
 */
export function daysUntilRetirement(modelId, now = new Date()) {
  const retires = MODEL_LIFECYCLE[modelId]?.retires;
  if (!retires) return null;
  const ms = Date.parse(`${retires}T00:00:00Z`) - now.getTime();
  return Math.floor(ms / 86_400_000);
}
