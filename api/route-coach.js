// Vercel API Route: Route Builder coach conversation (Unit 4, PR-4A)
//
// A Claude-powered conversational refinement surface for the Route
// Builder. Reads everything Units 1–3 wired into the prompt pipeline
// (coaching persona, today's prescription, fitness state, familiar
// roads) and emits structured route edits via tool-use.
//
// Architecture: the server runs the conversation and the tool DECISION;
// the client APPLIES the geometry. The route-builder routing stack
// (Stadia/BRouter) is browser-coupled and cannot run in a serverless
// function, so this endpoint validates Claude's apply_route_edit call
// and returns a normalized `proposedEdit`. The client (PR-4B) feeds
// proposedEdit.editIntent into v1's applyRouteEdit.
//
// Adapts the /api/coach.js pattern: same auth gate, same persona-aware
// prompt construction, same single messages.create shape (not streaming).

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
import { ROUTE_EDIT_TOOLS, normalizeRouteEdit } from './utils/routeEditTools.js';
import {
  collectRouteCoachContext,
  buildRouteCoachSystemPrompt,
} from './utils/routeCoachContext.js';

const MODEL = 'claude-sonnet-4-6';
const RECENT_WINDOW = 10;
const MAX_TOOL_USE_ROUNDS = 4;

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[route-coach] MISSING ANTHROPIC_API_KEY');
      return res.status(500).json({ success: false, error: 'Route coach not configured' });
    }

    const {
      message,
      conversationHistory = [],
      routeId,
      routeSnapshot,
      userLocalDate = null,
      maxTokens = 1024,
    } = req.body ?? {};

    // ── Validation ──────────────────────────────────────────────────────────
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Valid message is required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message too long (max 5,000)' });
    }
    if (routeId !== null && routeId !== undefined && typeof routeId !== 'string') {
      return res
        .status(400)
        .json({ success: false, error: 'routeId must be a string when provided' });
    }
    // routeId may be null/undefined — that's allowed; persistence just won't happen.
    if (!routeSnapshot?.geometry?.coordinates?.length) {
      return res
        .status(400)
        .json({ success: false, error: 'routeSnapshot with geometry is required' });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      console.error('[route-coach] auth validation failed:', authError?.message);
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or expired authentication token' });
    }
    const userId = authUser.id;

    // ── Rate limit (per user, separate bucket from /api/coach) ──────────────
    const limited = await rateLimitByUser(req, res, 'ROUTE_COACH', userId, 20, 5);
    if (limited !== null) return;

    // ── Context assembly (persona + Units 1–3) ──────────────────────────────
    const { persona, prescription, fitnessState, familiarRoads, weather } =
      await collectRouteCoachContext(supabase, userId, routeSnapshot);

    const systemPrompt = buildRouteCoachSystemPrompt({
      persona,
      prescription,
      fitnessState,
      familiarRoads,
      weather,
      routeSnapshot,
      userLocalDate,
    });

    // ── Conversation history windowing ──────────────────────────────────────
    const windowed = (Array.isArray(conversationHistory) ? conversationHistory : [])
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-RECENT_WINDOW)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
    // Claude requires the first message to be a user turn.
    while (windowed.length > 0 && windowed[0].role === 'assistant') windowed.shift();
    // Avoid two consecutive user turns once the new message is appended.
    while (windowed.length > 0 && windowed[windowed.length - 1].role === 'user') windowed.pop();

    const messages = [...windowed, { role: 'user', content: message.trim() }];

    // ── Claude call with bounded tool-use loop ──────────────────────────────
    const claude = new Anthropic({ apiKey });
    const createParams = {
      model: MODEL,
      max_tokens: Math.min(Number(maxTokens) || 1024, 4096),
      temperature: 0.7,
      system: systemPrompt,
      tools: ROUTE_EDIT_TOOLS,
    };

    let response = await claude.messages.create({ ...createParams, messages });
    // Collect every valid edit in a turn so a compound request ("hillier AND
    // longer") applies all of them — the client applies them in sequence.
    const proposedEdits = [];
    let finalText = '';
    let usage = response.usage ?? null;
    let rounds = 0;

    while (true) {
      rounds += 1;
      usage = response.usage ?? usage;

      const text = (response.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (text) finalText = text;

      if (response.stop_reason !== 'tool_use') break;

      const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
      const toolResults = [];
      let validEdit = false;

      for (const tu of toolUses) {
        if (tu.name === 'apply_route_edit') {
          const normalized = normalizeRouteEdit(tu.input, routeSnapshot);
          if (normalized.ok) {
            proposedEdits.push(normalized);
            validEdit = true;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify({
                ok: true,
                status: 'pending_client_apply',
                summary: normalized.summary,
              }),
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify({ ok: false, reason: normalized.reason }),
              is_error: true,
            });
          }
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify({ ok: false, reason: `unknown tool "${tu.name}"` }),
            is_error: true,
          });
        }
      }

      // Happy path: a valid edit was proposed — Claude's prose this round
      // is the proposal. End the turn (no need to feed tool results back).
      if (validEdit) break;
      if (rounds >= MAX_TOOL_USE_ROUNDS) break;

      // Recovery path: every tool call was invalid. Feed the errors back
      // so Claude can pick a supported intent or ask a clarifying question.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await claude.messages.create({ ...createParams, messages });
    }

    if (!finalText) {
      finalText = proposedEdits.length
        ? 'Here is the change to your route.'
        : "I didn't quite catch that — what would you like to change about the route?";
    }

    return res.status(200).json({
      success: true,
      message: finalText,
      proposedEdits,
      // Back-compat single-edit field for any caller not yet reading the array.
      proposedEdit: proposedEdits[0] ?? null,
      persona: persona ?? null,
      usage,
    });
  } catch (err) {
    console.error('[route-coach] error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Route coach request failed',
    });
  }
}
