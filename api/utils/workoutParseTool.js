/**
 * The tool Claude fills in when parsing a rider's description of a workout.
 *
 * The pinned SDK (@anthropic-ai/sdk@0.71) predates `output_config` structured
 * outputs, so tool use is how a typed result is obtained — the same technique
 * `routeEditTools.js` uses for route edits. `normalizeWorkoutParse` below is
 * the server-side gate: the model proposes, this validates, and a half-built
 * structure is rejected rather than stored. A partial parse would produce
 * confidently wrong routing implications downstream, which is worse than
 * admitting the description couldn't be read.
 */

/** Zones the app understands (types/training.ts TrainingZone). */
const ZONES = [1, 2, 3, 3.5, 4, 5, 6, 7];

const SEGMENT_PROPS = {
  duration: {
    type: 'number',
    description: 'Length in MINUTES. Use decimals for sub-minute efforts (0.5 = 30s).',
  },
  zone: {
    type: ['number', 'null'],
    description: 'Training zone 1-7 (3.5 = sweet spot). Null when not specified.',
  },
  powerPctFTP: { type: 'number', description: 'Target power as a % of FTP, when stated.' },
  cadence: { type: 'string', description: 'Cadence instruction, when stated (e.g. "60-70rpm").' },
  description: { type: 'string', description: "Short label, e.g. 'Threshold'." },
};

const SEGMENT_SCHEMA = {
  type: 'object',
  properties: SEGMENT_PROPS,
  required: ['duration'],
};

export const WORKOUT_PARSE_TOOLS = [
  {
    name: 'record_workout',
    description:
      'Record the structured form of the workout the rider described. Call ' +
      'this exactly once, only when the description is specific enough to ' +
      'lay out as warmup / main / cooldown. If it is too vague to structure ' +
      '(e.g. "ride easy for a bit"), do not call this tool — explain what is ' +
      'missing instead.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name, e.g. "4x8 Threshold".' },
        category: {
          type: 'string',
          enum: [
            'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold',
            'vo2max', 'anaerobic', 'climbing', 'racing',
          ],
          description: 'Closest category for the main work.',
        },
        terrainType: {
          type: 'string',
          enum: ['flat', 'rolling', 'hilly'],
          description:
            'Terrain the session needs. Steady efforts and short intervals ' +
            'usually want flat; sustained climbing work wants hilly. This ' +
            'steers the route, so choose it from what the work requires.',
        },
        focusArea: {
          type: 'string',
          description: 'Physiological focus, e.g. "lactate_threshold", "aerobic_base".',
        },
        intensityFactor: {
          type: 'number',
          description: 'Whole-session intensity as a fraction of FTP (0.5-1.15).',
        },
        estimatedTSS: { type: 'number', description: 'Rough training stress score.' },
        structure: {
          type: 'object',
          description: 'Warmup, main set, cooldown. Durations are MINUTES.',
          properties: {
            warmup: { ...SEGMENT_SCHEMA, description: 'Warmup, or omit if none stated.' },
            cooldown: { ...SEGMENT_SCHEMA, description: 'Cooldown, or omit if none stated.' },
            main: {
              type: 'array',
              description:
                'The main set in order. A repeated effort is one entry with ' +
                'type "repeat"; a single steady block is a plain segment.',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['repeat'] },
                  sets: { type: 'number', description: 'Number of repetitions.' },
                  work: SEGMENT_SCHEMA,
                  rest: SEGMENT_SCHEMA,
                  ...SEGMENT_PROPS,
                },
              },
            },
          },
          required: ['main'],
        },
      },
      required: ['name', 'category', 'terrainType', 'structure'],
    },
  },
];

const CATEGORIES = new Set([
  'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold',
  'vo2max', 'anaerobic', 'climbing', 'racing',
]);
const TERRAINS = new Set(['flat', 'rolling', 'hilly']);

function num(value, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Normalize one segment. Returns null when it has no usable duration. */
function normalizeSegment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const duration = num(raw.duration, { min: 0.05, max: 600 });
  if (duration === null) return null;
  const zone = ZONES.includes(Number(raw.zone)) ? Number(raw.zone) : null;
  const segment = { duration, zone, description: '' };
  if (typeof raw.description === 'string') segment.description = raw.description.slice(0, 120);
  const pct = num(raw.powerPctFTP, { min: 20, max: 250 });
  if (pct !== null) segment.powerPctFTP = pct;
  if (typeof raw.cadence === 'string') segment.cadence = raw.cadence.slice(0, 40);
  return segment;
}

function normalizeMainNode(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'repeat') {
    const work = normalizeSegment(raw.work);
    if (!work) return null;
    const sets = num(raw.sets, { min: 1, max: 60 });
    return {
      type: 'repeat',
      sets: sets === null ? 1 : Math.round(sets),
      work,
      // A repeat with no stated recovery is legitimate (e.g. over-unders).
      rest: normalizeSegment(raw.rest) ?? { duration: 0, zone: null },
    };
  }
  return normalizeSegment(raw);
}

/**
 * Validate a `record_workout` tool input.
 *
 * @returns {{ok: true, workout: object} | {ok: false, reason: string}}
 */
export function normalizeWorkoutParse(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'missing tool input' };
  }

  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  if (!name) return { ok: false, reason: 'the workout needs a name' };

  const category = CATEGORIES.has(input.category) ? input.category : 'endurance';
  const terrainType = TERRAINS.has(input.terrainType) ? input.terrainType : 'rolling';

  const rawMain = Array.isArray(input.structure?.main) ? input.structure.main : [];
  const main = rawMain.map(normalizeMainNode).filter(Boolean);
  if (main.length === 0) {
    // The whole point of parsing is the main set. Without it there is nothing
    // for the router to shape a route around.
    return { ok: false, reason: 'no main set could be read from that description' };
  }

  const structure = {
    warmup: normalizeSegment(input.structure?.warmup),
    main,
    cooldown: normalizeSegment(input.structure?.cooldown),
  };

  const workout = {
    name,
    category,
    structure,
    terrainType,
    focusArea:
      typeof input.focusArea === 'string' ? input.focusArea.trim().slice(0, 60) : null,
    intensityFactor: num(input.intensityFactor, { min: 0.3, max: 1.5 }),
    estimatedTSS: num(input.estimatedTSS, { min: 0, max: 1000 }),
  };

  return { ok: true, workout };
}

export { normalizeSegment, normalizeMainNode };
