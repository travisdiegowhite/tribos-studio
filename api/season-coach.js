// Vercel API Route: the season planner's coach (Season tab, Phase 5).
//
// Asked only on request, never on a move. The browser sends the season as the
// engine computed it (src/lib/season/coachPayload.ts): races with pre-formatted
// dates, verdicts and sentences, plus what changed since the last
// conversation. This endpoint adds the athlete's persona and asks Claude to
// explain the cost of the change in 2–4 sentences.
//
// No tools, no calendar writes: the coach cannot change the plan. It narrates
// the engine's numbers and never computes a date (see seasonCoachPrompt.js).

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { requireAuth } from './utils/auth.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import { setupCors } from './utils/cors.js';
import { getCoachPersona } from './utils/routeCoachContext.js';
import {
  MAX_PAYLOAD_BYTES,
  PayloadError,
  buildSeasonCoachSystemPrompt,
  renderPayload,
  sanitizePayload,
} from './utils/seasonCoachPrompt.js';

const MODEL = 'claude-opus-5-5';
// Thinking is always on for this model; low effort keeps a short commentary
// quick and cheap, and max_tokens leaves room for thinking plus the reply.
const EFFORT = 'low';
const MAX_TOKENS = 4000;
// If a safeguard declines, the API re-runs the request on a fallback model.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[season-coach] MISSING ANTHROPIC_API_KEY');
    return res.status(500).json({ success: false, error: 'Season coach not configured' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if ((await rateLimitByUser(req, res, 'SEASON_COACH', user.id, 10, 5)) !== null) return;
  if ((await enforceAiQuota(req, res, user.id)) !== null) return;

  let payload;
  try {
    if (JSON.stringify(req.body ?? {}).length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ success: false, error: 'That season is too large to send to the coach.' });
    }
    payload = sanitizePayload(req.body?.payload);
  } catch (err) {
    if (err instanceof PayloadError) return res.status(400).json({ success: false, error: err.message });
    throw err;
  }
  const seasonPlanId = typeof req.body?.seasonPlanId === 'string' ? req.body.seasonPlanId : null;

  try {
    const [personaId, riderName] = await Promise.all([
      getCoachPersona(supabase, user.id),
      getRiderName(user.id),
    ]);
    const { system, personaName } = buildSeasonCoachSystemPrompt({ personaId, riderName });
    const userText = renderPayload(payload);

    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system,
      messages: [{ role: 'user', content: userText }],
    });

    if (response.stop_reason === 'refusal') {
      console.warn('[season-coach] refusal', response.stop_details?.category ?? null);
      return res.status(502).json({ success: false, error: "The coach couldn't answer that one. Try rephrasing your question." });
    }
    const message = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!message) {
      return res.status(502).json({ success: false, error: 'The coach came back empty. Try again in a moment.' });
    }

    await logExchange(user.id, payload, message, seasonPlanId);
    return res.status(200).json({ success: true, message, personaName });
  } catch (error) {
    console.error('[season-coach] error:', error?.status ?? '', error?.message ?? error);
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ success: false, error: 'The coach is busy. Try again in a minute.' });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return res.status(500).json({ success: false, error: 'Service authentication error' });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return res.status(400).json({ success: false, error: 'The coach request was invalid.' });
    }
    return res.status(500).json({ success: false, error: 'The coach request failed. Try again in a moment.' });
  }
}

async function getRiderName(userId) {
  try {
    const { data } = await supabase
      .from('user_coach_settings')
      .select('user_preferred_name')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.user_preferred_name ?? null;
  } catch {
    return null;
  }
}

/** Keep the exchange for quality review. Best effort: a failed log never fails the reply. */
async function logExchange(userId, payload, message, seasonPlanId) {
  try {
    const context = {
      surface: 'season_planner',
      season_plan_id: seasonPlanId,
      changes: payload.changes,
      first_look: payload.firstLook,
      verdict_counts: payload.races.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {}),
    };
    const rows = [
      {
        user_id: userId,
        role: 'user',
        message: payload.question ?? 'What do you think of my season?',
        message_type: 'chat',
        coach_type: 'strategist',
        context_snapshot: context,
      },
      { user_id: userId, role: 'coach', message, message_type: 'chat', coach_type: 'strategist', context_snapshot: context },
    ];
    const { error } = await supabase.from('coach_conversations').insert(rows);
    if (error) console.error('[season-coach] could not log exchange:', error.message);
  } catch (err) {
    console.error('[season-coach] could not log exchange:', err?.message ?? err);
  }
}
