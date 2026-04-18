/**
 * Today Hero — voice layer.
 *
 * Per spec §4.4: calls Claude Haiku with a strict request payload and
 * expects a JSON object with four short phrase fields. Every field is
 * validated independently; failed fields are swapped with archetype
 * fallbacks. If three or more fail, the entire response falls back.
 *
 * The voice layer never sees raw metrics — only classified states —
 * so it has no opportunity to hallucinate numbers. Numeric rendering
 * is the deterministic layer's job.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getArchetypeOverrides } from './archetypeOverrides.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const STATIC_PROPER_NOUNS = [
  'Strava', 'Garmin', 'Wahoo', 'Coros', 'Tribos',
  'Zwift', 'TrainingPeaks',
];

const VOICE_RESPONSE_FIELDS = Object.freeze([
  'opener',
  'rideDescriptor',
  'intensityModifier',
  'blockInterpretation',
]);

// Per-field validation rules (spec §4.5).
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
 * Validate one voice field. Returns `{ ok, value, reason? }`.
 */
export function validateField(fieldName, rawValue, denylist) {
  const rules = FIELD_RULES[fieldName];
  if (!rules) return { ok: true, value: rawValue };

  const value = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (value.length === 0) {
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

function buildDenylist(context) {
  const rider = context.rider?.firstName || null;
  const race = context.nextAnchor?.type === 'race' ? context.nextAnchor.label : null;
  const list = [...STATIC_PROPER_NOUNS];
  if (rider) list.push(rider);
  if (race) list.push(race);
  return list;
}

/**
 * Build the spec-§4.4 HeroVoiceRequest payload — the voice layer sees only
 * classified states, never numbers.
 */
function buildHeroVoiceRequest(context) {
  const ride = context.lastRide;
  const recentRide = ride ? {
    workoutType: ride.workoutType || 'endurance',
    intensityVsExpected: ride.intensityVsExpected || 'as_expected',
    wasPrescribed: !!ride.wasPrescribed,
  } : null;

  return {
    archetype: context.archetype,
    openerState: context.classification.openerState,
    recentRide,
    blockPhase: context.block?.phase || 'base',
    blockWeek: context.block?.weekInPhase || 1,
    formState: context.classification.formState,
    hasUpcomingRace: context.nextAnchor?.type === 'race',
  };
}

// One-line archetype voice — placeholder until voice bibles are injected.
// The `{{archetypeVoiceBible}}` slot in the system prompt template falls back
// to this line so we still get archetype separation today.
const ARCHETYPE_VOICE_LINES = {
  hammer: 'You are The Hammer: direct, brief, no filler. Short declarative sentences. Imperatives. Expects adult accountability.',
  scientist: 'You are The Scientist: calm, precise, explanatory. Uses physiological terms but explains them. Data-confidence, neutral affect.',
  encourager: 'You are The Encourager: warm, process-focused, present-tense. Notices effort behind numbers. Affirming without being saccharine.',
  pragmatist: 'You are The Pragmatist: grounded, conversational, no-nonsense but not harsh. Plain language. Meets the rider where they are.',
  competitor: 'You are The Competitor: results-driven, forward-looking, race-focused. Frames training in terms of race outcomes. Energizing but realistic.',
};

function buildSystemPrompt(request) {
  const voiceLine = ARCHETYPE_VOICE_LINES[request.archetype] || ARCHETYPE_VOICE_LINES.pragmatist;
  return [
    'You are a cycling coach writing one short morning greeting for a rider.',
    'Your voice is one of five archetypes — match it exactly.',
    '',
    `=== ARCHETYPE: ${request.archetype} ===`,
    voiceLine,
    '',
    '=== RIDER STATE ===',
    `Opener state: ${request.openerState}`,
    `Block: ${request.blockPhase}, week ${request.blockWeek}`,
    `Form state: ${request.formState}`,
    request.recentRide
      ? `Recent ride: ${request.recentRide.workoutType}, intensity was ${request.recentRide.intensityVsExpected}, ${request.recentRide.wasPrescribed ? 'prescribed' : 'unprescribed'}`
      : 'Recent ride: none',
    `Upcoming race: ${request.hasUpcomingRace ? 'yes' : 'no'}`,
    '',
    '=== YOUR JOB ===',
    "Return four short phrases that will be stitched into a morning paragraph.",
    "The paragraph assembler owns all numbers, dates, and race names —",
    "you do not write them, reference them, or invent them.",
    '',
    'Return JSON only, matching this shape exactly:',
    '',
    '{',
    '  "opener": "string",              // 2-6 words. Sets the tone. No numbers.',
    '  "rideDescriptor": "string",      // 2-4 words naming the last ride qualitatively.',
    '                                   //   Examples: "long session", "tempo block", "threshold work", "recovery spin".',
    '                                   //   Return "" if recentRide is null.',
    '  "intensityModifier": "string",   // 0-3 words. How the ride landed.',
    '                                   //   Examples: "hit hard", "went smooth", "".',
    '                                   //   Return "" if intensity was "as_expected".',
    '  "blockInterpretation": "string"  // 4-9 words interpreting where the rider sits in the block.',
    '}',
    '',
    '=== HARD RULES ===',
    '- No digits anywhere. No dates, zones, or counts.',
    '- No proper nouns. No race names, product names, rider name.',
    '- No em dashes, no semicolons, no quotation marks inside values.',
    '- Sentence fragments are fine — preferred.',
    '- Never repeat the opener\'s words in the interpretation.',
    '- Stay in archetype voice.',
    '- If recentRide is null, rideDescriptor and intensityModifier must both be "".',
    '- Output JSON only. No prose before or after. No code fences.',
  ].join('\n');
}

const CALIBRATION_EXAMPLES = [
  {
    role: 'user',
    content: JSON.stringify({
      archetype: 'pragmatist',
      openerState: 'building',
      recentRide: { workoutType: 'endurance', intensityVsExpected: 'as_expected', wasPrescribed: true },
      blockPhase: 'base',
      blockWeek: 3,
      formState: 'fatigued',
      hasUpcomingRace: false,
    }),
  },
  {
    role: 'assistant',
    content: '{"opener":"Right on pattern.","rideDescriptor":"long session","intensityModifier":"","blockInterpretation":"exactly where the plan wants you"}',
  },
  {
    role: 'user',
    content: JSON.stringify({
      archetype: 'hammer',
      openerState: 'building',
      recentRide: { workoutType: 'threshold', intensityVsExpected: 'harder', wasPrescribed: true },
      blockPhase: 'build',
      blockWeek: 2,
      formState: 'deeply_fatigued',
      hasUpcomingRace: false,
    }),
  },
  {
    role: 'assistant',
    content: '{"opener":"Good. That one hurt.","rideDescriptor":"threshold work","intensityModifier":"bit back","blockInterpretation":"which is the whole point right now"}',
  },
  {
    role: 'user',
    content: JSON.stringify({
      archetype: 'encourager',
      openerState: 'recovering',
      recentRide: { workoutType: 'recovery', intensityVsExpected: 'as_expected', wasPrescribed: true },
      blockPhase: 'recovery',
      blockWeek: 1,
      formState: 'fresh',
      hasUpcomingRace: false,
    }),
  },
  {
    role: 'assistant',
    content: '{"opener":"Nice work resting.","rideDescriptor":"recovery spin","intensityModifier":"","blockInterpretation":"the body is absorbing the work"}',
  },
];

function parseJsonResponse(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/m, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
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
 * Generate and validate the voice response.
 *
 * @returns {Promise<object>} HeroVoiceResponse wrapper: { fields, fieldsValid, ... }
 */
export async function generateHeroVoice(context, opts = {}) {
  const overrides = getArchetypeOverrides(context.archetype);
  const denylist = buildDenylist(context);

  // Cold-start path skips the Haiku round-trip entirely.
  if (context.coldStart?.active) {
    return {
      fields: {
        opener: overrides.fallbacks.coldStart || overrides.fallbacks.opener,
        rideDescriptor: '',
        intensityModifier: '',
        blockInterpretation: overrides.fallbacks.blockInterpretation,
      },
      fieldsValid: { opener: true, rideDescriptor: true, intensityModifier: true, blockInterpretation: true },
      fallbackCount: 4,
      fullFallback: true,
      coldStart: true,
      source: 'cold_start_fallback',
    };
  }

  const request = buildHeroVoiceRequest(context);

  const client = opts.anthropic || new Anthropic({
    apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY,
  });

  let raw = null;
  let parsed = null;
  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      system: buildSystemPrompt(request),
      messages: [
        ...CALIBRATION_EXAMPLES,
        { role: 'user', content: JSON.stringify(request) },
      ],
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

export { VOICE_RESPONSE_FIELDS, FIELD_RULES, STATIC_PROPER_NOUNS, HAIKU_MODEL, buildHeroVoiceRequest };
