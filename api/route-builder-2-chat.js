// Vercel API Route: Route Builder 2.0 chat-to-mutation translator
//
// Translates a natural-language user request into a single Mutation
// object that the Route Builder 2.0 executor can apply. Returns
// `{ mutation }` for actionable inputs and `{ refusal }` when the
// request is out of scope or ambiguous.
//
// Uses Claude with a forced tool-use schema so the model can only emit
// well-formed mutations. The Mutation taxonomy mirrors
// `src/routing/executor/types.ts` — keep them in sync when types
// change.

import Anthropic from '@anthropic-ai/sdk';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

const MODEL = 'claude-opus-4-7';

const MUTATION_TOOL = {
  name: 'apply_mutation',
  description:
    'Produce exactly one mutation to apply to the current route. Pick the single mutation that best matches the user request. If the request is out of scope or ambiguous, call refuse_request instead.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [
          'extend_distance',
          'shorten_distance',
          'trim_route',
          'reverse_route',
          'smooth_route',
          'change_route_shape',
          'increase_climbing',
          'reduce_climbing',
          'change_climb_character',
          'change_surface_mix',
          'change_traffic_preference',
          'avoid_exposure',
          'anchor_at_poi',
          'avoid_segment_by_property',
          'swap_to_familiar',
          'swap_to_unfamiliar',
          'optimize_for',
        ],
      },
      delta_km: {
        type: 'number',
        description: 'For extend_distance / shorten_distance. Positive km value.',
      },
      from: { type: 'string', enum: ['start', 'end'] },
      amount_km: { type: 'number' },
      target_shape: { type: 'string', enum: ['loop', 'out_and_back', 'point_to_point'] },
      smooth_target: {
        type: 'string',
        enum: ['remove_doublebacks', 'remove_dead_ends', 'simplify_turns'],
      },
      magnitude: { type: 'string', enum: ['small', 'moderate', 'large'] },
      climb_character: {
        type: 'string',
        enum: ['punchy', 'sustained', 'rolling', 'flat'],
      },
      surface_road: { type: 'number', description: '0..1 — share of road surface' },
      surface_gravel: { type: 'number', description: '0..1 — share of gravel' },
      surface_path: { type: 'number', description: '0..1 — share of path/dirt' },
      traffic_preference: { type: 'string', enum: ['low', 'minimal'] },
      exposure_type: { type: 'string', enum: ['wind', 'sun'] },
      poi_query: { type: 'string', description: 'POI name or category for anchor_at_poi.' },
      poi_type: {
        type: 'string',
        enum: ['coffee', 'water', 'food', 'bike_shop', 'restroom', 'viewpoint'],
      },
      position_hint: { type: 'string', enum: ['start', 'middle', 'end'] },
      avoid_property: {
        type: 'string',
        enum: ['steep_climb', 'exposed', 'busy_road', 'rough_surface'],
      },
      region: { type: 'string' },
      optimize_criterion: {
        type: 'string',
        enum: ['scenery', 'training_value', 'speed', 'social'],
      },
    },
    required: ['type'],
  },
};

const REFUSE_TOOL = {
  name: 'refuse_request',
  description:
    'Use when the request is unrelated to route editing, ambiguous, requires multiple mutations, or cannot be mapped to one of the supported mutation types.',
  input_schema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'A short, friendly explanation (under 120 chars) for the user.',
      },
    },
    required: ['reason'],
  },
};

const SYSTEM_PROMPT = `You are the route-edit translator for Tribos.studio's Route Builder 2.0. You receive a user's free-form request and the current route summary. Pick EXACTLY ONE mutation to apply, or refuse.

Rules:
- Always pick the simplest single mutation that matches the user's intent.
- Use sensible defaults for missing parameters (e.g., delta_km = 5 if user says "a bit more").
- If the user wants to "make it hillier" / "more climbing", use increase_climbing with magnitude=moderate.
- If the user wants "shorter / longer", use shorten_distance / extend_distance with delta_km.
- If the user wants to add a coffee/water/food stop, use anchor_at_poi.
- If the user wants to avoid hills/busy roads/rough surfaces, use avoid_segment_by_property.
- If the user wants "more gravel" / "less road", use change_surface_mix with weights summing to ~1.0.
- If the request needs multiple mutations (e.g., "make it hillier AND longer"), pick the most important one and mention the other in a refusal — but only if both are critical. Usually pick one.
- Refuse if: request is conversational ("hi", "thanks"), out-of-scope, or unsupported (e.g., "remove turn at km 12").

Return ONLY a tool call. Never plain text.`;

function buildMutation(input) {
  const out = { type: input.type };
  switch (input.type) {
    case 'extend_distance':
    case 'shorten_distance':
      if (typeof input.delta_km === 'number') out.delta_km = input.delta_km;
      else out.delta_km = 5;
      break;
    case 'trim_route':
      out.from = input.from === 'end' ? 'end' : 'start';
      out.amount_km = typeof input.amount_km === 'number' ? input.amount_km : 2;
      break;
    case 'change_route_shape':
      out.target = input.target_shape ?? 'loop';
      break;
    case 'smooth_route':
      out.target = input.smooth_target ?? 'simplify_turns';
      break;
    case 'increase_climbing':
    case 'reduce_climbing':
      out.magnitude = input.magnitude ?? 'moderate';
      break;
    case 'change_climb_character':
      out.target = input.climb_character ?? 'rolling';
      break;
    case 'change_surface_mix': {
      const road = typeof input.surface_road === 'number' ? input.surface_road : 0.5;
      const gravel = typeof input.surface_gravel === 'number' ? input.surface_gravel : 0.4;
      const path = typeof input.surface_path === 'number' ? input.surface_path : 0.1;
      out.target = { road, gravel, path };
      break;
    }
    case 'change_traffic_preference':
      out.target = input.traffic_preference ?? 'low';
      break;
    case 'avoid_exposure':
      out.exposure_type = input.exposure_type ?? 'wind';
      break;
    case 'anchor_at_poi':
      out.poi_query = input.poi_query ?? 'coffee shop';
      if (input.poi_type) out.poi_type = input.poi_type;
      if (input.position_hint) out.position_hint = input.position_hint;
      break;
    case 'avoid_segment_by_property':
      out.property = input.avoid_property ?? 'busy_road';
      break;
    case 'swap_to_familiar':
    case 'swap_to_unfamiliar':
      out.region = input.region ?? 'route';
      break;
    case 'optimize_for':
      out.criterion = input.optimize_criterion ?? 'scenery';
      break;
    case 'reverse_route':
      break;
    default:
      return null;
  }
  return out;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const limited = await rateLimitMiddleware(req, res, 'route-builder-2-chat', 30, 1);
  if (limited) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('MISSING ANTHROPIC_API_KEY');
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  const { text, currentRoute, context } = req.body ?? {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const userContent = JSON.stringify({
    user_message: text.trim(),
    current_route: currentRoute ?? null,
    context: context ?? null,
  });

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [MUTATION_TOOL, REFUSE_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = (response.content ?? []).find((b) => b.type === 'tool_use');
    if (!toolUse) {
      res.status(200).json({
        refusal: "I couldn't parse that into a route change. Try rephrasing?",
      });
      return;
    }

    if (toolUse.name === 'refuse_request') {
      const reason = toolUse.input?.reason ?? "I can't help with that one — try a route change.";
      res.status(200).json({ refusal: reason });
      return;
    }

    if (toolUse.name === 'apply_mutation') {
      const mutation = buildMutation(toolUse.input ?? {});
      if (!mutation) {
        res.status(200).json({ refusal: 'Got an unknown mutation type — try rephrasing.' });
        return;
      }
      res.status(200).json({ mutation });
      return;
    }

    res.status(200).json({ refusal: 'Unknown tool response.' });
  } catch (e) {
    console.error('[route-builder-2-chat] Claude error', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Translator failed',
    });
  }
}
