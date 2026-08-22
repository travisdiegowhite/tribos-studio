/**
 * POST /api/parse-workout-text
 *
 * Turns a rider's description of a workout their coach gave them
 * ("4x8min @ threshold, 5min easy between") into the structured form the app
 * uses everywhere else.
 *
 * Riders coached by a human have workouts that are not in our library. Before
 * this existed there was no way to enter one, so those sessions reached route
 * generation as a bare duration — no terrain, no intervals — and the
 * routing-implications machinery in `promptBuilders.deriveRoutingImplications`
 * never fired for them.
 *
 * Runs once when the workout is saved, never on the route-building path, so a
 * capable model is worth it here: the input is messy coach shorthand and a
 * misread produces a confidently wrong route.
 *
 * Adapts the /api/route-coach.js pattern: same CORS, same auth gate, same
 * burst limit + daily quota, and the same tool-use technique for a typed
 * result (the pinned SDK predates `output_config` structured outputs).
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import { setupCors } from './utils/cors.js';
import { WORKOUT_PARSE_TOOLS, normalizeWorkoutParse } from './utils/workoutParseTool.js';

const MODEL = 'claude-opus-5';
const MAX_DESCRIPTION_CHARS = 2000;

const SYSTEM_PROMPT = `You convert a cyclist's description of a workout into structured form.

The description comes from a rider relaying what their coach prescribed, so
expect shorthand: "4x8 @ SS, 5' RBI", "2x20 FTP", "3 sets of 5x1min hard/1min
easy", "90min Z2 with 3x10 tempo". Read it the way a coach would.

Rules:
- Durations are MINUTES. "5'" or "5min" is 5. "30s" or "0:30" is 0.5.
- "RBI" / "rest between intervals" / "easy between" is the rest segment.
- Sweet spot is zone 3.5. FTP/threshold is zone 4. VO2 is zone 5.
- Nested sets ("3 sets of 5x1min") — record the inner effort as the repeat and
  multiply the sets, rather than inventing nesting the schema cannot hold.
- Pick terrainType from what the WORK requires, not from the rider's wording:
  sustained climbing work is "hilly"; steady efforts and short intervals are
  usually "flat"; unspecified endurance is "rolling". This steers the route the
  rider gets, so it matters.
- Include warmup/cooldown only when stated. Do not invent them.

If the description is too vague to lay out as a main set — "ride easy",
"do something hard" — do NOT call the tool. Say briefly what you would need.
Guessing produces a route built for a workout the rider never described.`;

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[parse-workout-text] MISSING ANTHROPIC_API_KEY');
      return res.status(500).json({ success: false, error: 'Workout parsing not configured' });
    }

    const { description, name = null } = req.body ?? {};

    // ── Validation ──────────────────────────────────────────────────────────
    if (typeof description !== 'string' || !description.trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'A workout description is required' });
    }
    if (description.length > MAX_DESCRIPTION_CHARS) {
      return res.status(400).json({
        success: false,
        error: `Description too long (max ${MAX_DESCRIPTION_CHARS.toLocaleString()})`,
      });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !authUser) {
      console.error('[parse-workout-text] auth validation failed:', authError?.message);
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or expired authentication token' });
    }
    const userId = authUser.id;

    // ── Rate limit + daily AI quota ─────────────────────────────────────────
    // Parsing happens on save, not per keystroke, so the burst allowance is
    // deliberately small.
    const limited = await rateLimitByUser(req, res, 'PARSE_WORKOUT', userId, 15, 5);
    if (limited) return;
    const quotaExceeded = await enforceAiQuota(req, res, userId);
    if (quotaExceeded !== null) return;

    // ── Parse ───────────────────────────────────────────────────────────────
    const claude = new Anthropic({ apiKey });
    const userText = name
      ? `Workout name: ${String(name).slice(0, 120)}\n\nDescription:\n${description.trim()}`
      : description.trim();

    const response = await claude.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: WORKOUT_PARSE_TOOLS,
      messages: [{ role: 'user', content: userText }],
    });

    const toolUse = (response.content || []).find(
      (block) => block.type === 'tool_use' && block.name === 'record_workout',
    );
    const prose = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    // No tool call means the model judged the description too vague. That is a
    // real answer, not a failure — return its explanation so the rider can add
    // what's missing rather than getting a route built on a guess.
    if (!toolUse) {
      return res.status(200).json({
        success: false,
        needsDetail: true,
        error: prose || "That description wasn't specific enough to structure.",
      });
    }

    const normalized = normalizeWorkoutParse(toolUse.input);
    if (!normalized.ok) {
      console.warn('[parse-workout-text] rejected tool input:', normalized.reason);
      return res.status(200).json({
        success: false,
        needsDetail: true,
        error: `That description wasn't specific enough to structure — ${normalized.reason}.`,
      });
    }

    return res.status(200).json({
      success: true,
      workout: normalized.workout,
      // The rider's own words, echoed back for storage alongside the parse so
      // a bad read stays recoverable by hand.
      description: description.trim(),
      usage: response.usage ?? null,
    });
  } catch (error) {
    console.error('[parse-workout-text] error:', error?.message);
    return res.status(500).json({ success: false, error: 'Could not parse that workout' });
  }
}
