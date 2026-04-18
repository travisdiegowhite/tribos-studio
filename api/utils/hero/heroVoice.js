/**
 * Today Hero — voice layer.
 *
 * Calls Claude Haiku with a per-archetype prompt, parses strict JSON, and
 * validates each field. Invalid fields are swapped with archetype fallbacks.
 * If three or more fields fail, the entire response falls back so the
 * paragraph stays coherent.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getArchetypeOverrides } from './archetypeOverrides.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// Always-denied proper nouns. Rider name and race name are added dynamically.
const STATIC_PROPER_NOUNS = ['Strava', 'Garmin', 'Wahoo', 'Coros', 'Tribos', 'Zwift', 'TrainingPeaks'];

const VOICE_RESPONSE_FIELDS = Object.freeze([
  'opener',
  'rideDescriptor',
  'intensityModifier',
  'blockInterpretation',
]);

// Per-field validation rules. Word-count ranges matching the spec.
const FIELD_RULES = Object.freeze({
  opener:              { minWords: 2, maxWords: 8 },
  rideDescriptor:      { minWords: 0, maxWords: 5 },
  intensityModifier:   { minWords: 0, maxWords: 4 },
  blockInterpretation: { minWords: 3, maxWords: 12 },
});

const FORBIDDEN_PUNCT = /[—;"]/;

function countWords(value) {
  if (!value || typeof value !== 'string') return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function hasDigit(value) {
  return /\d/.test(value || '');
}

function hasForbiddenPunct(value) {
  return FORBIDDEN_PUNCT.test(value || '');
}

function hasProperNoun(value, denylist) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return denylist.some((name) => {
    if (!name) return false;
    const lowerName = name.toLowerCase().trim();
    if (lowerName.length < 3) return false;
    return lower.includes(lowerName);
  });
}

/**
 * Validate one voice field. Returns `{ ok: true, value }` or
 * `{ ok: false, reason, value }` so callers can decide to keep or swap.
 */
export function validateField(fieldName, rawValue, denylist) {
  const rules = FIELD_RULES[fieldName];
  if (!rules) return { ok: true, value: rawValue };

  const value = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (value.length === 0) {
    // Empty is only acceptable for rideDescriptor / intensityModifier (min=0).
    if (rules.minWords === 0) return { ok: true, value: '' };
    return { ok: false, reason: 'empty', value: '' };
  }

  const words = countWords(value);
  if (words < rules.minWords) return { ok: false, reason: 'too_short', value };
  if (words > rules.maxWords) return { ok: false, reason: 'too_long', value };
  if (hasDigit(value)) return { ok: false, reason: 'contains_digit', value };
  if (hasForbiddenPunct(value)) return { ok: false, reason: 'forbidden_punct', value };
  if (hasProperNoun(value, denylist)) return { ok: false, reason: 'proper_noun', value };

  return { ok: true, value };
}

/**
 * Build the set of proper-noun strings to reject, given hero context.
 */
function buildDenylist(context) {
  const rider = context.rider?.firstName || null;
  const race = context.raceAnchor?.name || null;
  const list = [...STATIC_PROPER_NOUNS];
  if (rider) list.push(rider);
  if (race) list.push(race);
  return list;
}

/**
 * Build the user message handed to Haiku. Keeps the payload tight — the
 * deterministic context is already rich enough; no need for extra prose.
 */
function buildUserMessage(context) {
  // Keep json compact. Haiku handles JSON fine at this size.
  const prompt = {
    archetype: context.archetype,
    rider_experience: context.experienceLevel,
    metrics: {
      tfi: context.metrics.tfi,
      afi: context.metrics.afi,
      form_score: context.metrics.formScore,
      tfi_delta_pct: context.metrics.ctlDeltaPct,
    },
    classification: context.classification,
    last_ride: context.lastRide ? {
      planned_workout: context.lastRidePlannedMatch?.name || null,
      target_rss: context.lastRidePlannedMatch?.target_tss || null,
      actual_rss: context.lastRide.rss,
    } : null,
    plan: context.plan ? {
      block_name: context.plan.blockName,
      block_purpose: context.plan.blockPurpose,
      current_week: context.plan.currentWeek,
      total_weeks: context.plan.totalWeeks,
    } : null,
    week: context.week,
    race_anchor: context.raceAnchor,
  };

  return [
    'Write the four voice fields for the rider\'s hero paragraph.',
    'Return a JSON object with exactly these keys: opener, rideDescriptor, intensityModifier, blockInterpretation.',
    'Do not include anything except the JSON object — no prose, no code fences.',
    '',
    'Rules:',
    '- opener: 2–8 words. No digits. No em-dash, semicolon, or quotes.',
    '- rideDescriptor: 0–5 words describing yesterday\'s ride feel. Empty string if no ride. No digits.',
    '- intensityModifier: 0–4 words qualifying the block\'s intensity posture. Empty string acceptable. No digits.',
    '- blockInterpretation: 3–12 words. No digits. No em-dash, semicolon, or quotes.',
    '- Never mention proper nouns: rider name, race name, product names (Strava, Garmin, Wahoo, Tribos, etc.).',
    '- Write in the archetype\'s voice — the field values will be spliced into a deterministic paragraph template.',
    '',
    'Context JSON:',
    '```json',
    JSON.stringify(prompt, null, 2),
    '```',
  ].join('\n');
}

function buildSystemPrompt(context) {
  // Single short paragraph per archetype — enough signal without bloating tokens.
  const archetypeVoices = {
    hammer: 'You are The Hammer: direct, brief, no filler. Short declarative sentences. Imperatives. Expects adult accountability.',
    scientist: 'You are The Scientist: calm, precise, explanatory. Uses physiological terms but explains them. Data-confidence, neutral affect.',
    encourager: 'You are The Encourager: warm, process-focused, present-tense. Notices effort behind numbers. Affirming without being saccharine.',
    pragmatist: 'You are The Pragmatist: grounded, conversational, no-nonsense but not harsh. Plain language. Meets the rider where they are.',
    competitor: 'You are The Competitor: results-driven, forward-looking, race-focused. Frames training in terms of race outcomes. Energizing but realistic.',
  };
  const voice = archetypeVoices[context.archetype] || archetypeVoices.pragmatist;
  return [
    voice,
    '',
    'You are writing a short paragraph for the rider\'s dashboard that lands in their coach\'s voice.',
    'The paragraph is assembled deterministically from four slot values you return.',
    'Never emit old TrainingPeaks abbreviations (TSS, CTL, ATL, TSB, NP, IF).',
    'Never output digits, markdown, bullet points, or code fences. Plain text only.',
    'Respond with a single JSON object — nothing else.',
  ].join('\n');
}

function parseJsonResponse(text) {
  if (!text) return null;
  // Haiku usually returns pure JSON; strip accidental fences just in case.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/m, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Second chance: grab the first balanced {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Generate the voice response.
 *
 * @param {object} context - HeroContext from assembleHeroContext
 * @param {{ anthropic?: Anthropic, apiKey?: string }} [opts]
 * @returns {Promise<object>} HeroVoiceResponse
 */
export async function generateHeroVoice(context, opts = {}) {
  const overrides = getArchetypeOverrides(context.archetype);
  const denylist = buildDenylist(context);

  // Cold-start path returns the archetype's prebuilt fallback set, no
  // Haiku round-trip. Saves tokens and avoids hallucinating a ride.
  if (context.coldStart?.active) {
    return {
      fields: {
        opener: overrides.fallbacks.coldStart || overrides.fallbacks.opener,
        rideDescriptor: '',
        intensityModifier: '',
        blockInterpretation: overrides.fallbacks.blockInterpretation,
      },
      fieldsValid: {
        opener: true,
        rideDescriptor: true,
        intensityModifier: true,
        blockInterpretation: true,
      },
      fallbackCount: 4,
      fullFallback: true,
      coldStart: true,
      source: 'cold_start_fallback',
    };
  }

  const client = opts.anthropic || new Anthropic({
    apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY,
  });

  let raw = null;
  let parsed = null;
  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      system: buildSystemPrompt(context),
      messages: [{ role: 'user', content: buildUserMessage(context) }],
    });
    raw = response.content?.[0]?.text || '';
    parsed = parseJsonResponse(raw);
  } catch (err) {
    console.error('[heroVoice] Haiku call failed:', err.message);
    parsed = null;
  }

  const fallbackSet = {
    opener: overrides.fallbacks.opener,
    rideDescriptor: context.lastRide ? overrides.fallbacks.rideDescriptor : '',
    intensityModifier: overrides.fallbacks.intensityModifier,
    blockInterpretation: overrides.fallbacks.blockInterpretation,
  };

  if (!parsed) {
    return {
      fields: fallbackSet,
      fieldsValid: { opener: false, rideDescriptor: false, intensityModifier: false, blockInterpretation: false },
      fallbackCount: 4,
      fullFallback: true,
      coldStart: false,
      source: 'parse_failure_fallback',
      raw,
    };
  }

  // Per-field validate.
  const fields = {};
  const fieldsValid = {};
  let fallbackCount = 0;

  for (const key of VOICE_RESPONSE_FIELDS) {
    const result = validateField(key, parsed[key], denylist);
    if (result.ok) {
      fields[key] = result.value;
      fieldsValid[key] = true;
    } else {
      fields[key] = fallbackSet[key];
      fieldsValid[key] = false;
      fallbackCount += 1;
      console.warn(`[heroVoice] Field "${key}" failed validation (${result.reason}): "${result.value}"`);
    }
  }

  // Full fallback when ≥3 of 4 fail — prevents stitched Frankenstein output.
  if (fallbackCount >= 3) {
    return {
      fields: fallbackSet,
      fieldsValid,
      fallbackCount: 4,
      fullFallback: true,
      coldStart: false,
      source: 'majority_failure_fallback',
      raw,
    };
  }

  return {
    fields,
    fieldsValid,
    fallbackCount,
    fullFallback: false,
    coldStart: false,
    source: 'haiku',
    raw,
  };
}

export { VOICE_RESPONSE_FIELDS, FIELD_RULES, STATIC_PROPER_NOUNS, HAIKU_MODEL };
