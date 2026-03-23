/**
 * Coaching Persona Classification
 *
 * POST endpoint that classifies a user's coaching persona from
 * intake interview answers via Claude.
 * Rate limited: 5 requests per 10 minutes per user.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const CLASSIFICATION_PROMPT = `You are classifying a cyclist's coaching preference based on their intake interview answers.

PERSONA OPTIONS:
- hammer: Demanding, accountability-focused, high expectations
- scientist: Analytical, physiological, data-driven explanation
- encourager: Warm, process-focused, consistency over perfection
- pragmatist: Realistic, life-aware, forward-looking
- competitor: Race-focused, results-driven, competitive framing

INTAKE ANSWERS:
Q1 (missed workout response): {answer_1}
Q2 (season goal): {answer_2}
Q3 (response to hard weeks): {answer_3}
Q4 (weekly hours): {answer_4}
Q5 (what a coach provides): {answer_5}

Return ONLY valid JSON. No preamble.
{
  "persona": "<persona_id>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explaining the assignment>",
  "secondary": "<second-best persona_id if confidence < 0.75>"
}`;

const VALID_PERSONAS = ['hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'];

// Simple in-memory rate limiter (per-user, resets on cold start)
const rateLimits = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const maxRequests = 5;

  const entry = rateLimits.get(userId);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimits.set(userId, { windowStart: now, count: 1 });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Service not configured' });
    }

    const { answers, userId } = req.body;

    if (!answers || !userId) {
      return res.status(400).json({ error: 'Missing answers or userId' });
    }

    if (!answers.q1 || !answers.q2 || !answers.q3 || !answers.q4 || !answers.q5) {
      return res.status(400).json({ error: 'All 5 intake answers are required' });
    }

    // Rate limit check
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ error: 'Too many classification requests. Try again later.' });
    }

    const claude = new Anthropic({ apiKey });

    const prompt = CLASSIFICATION_PROMPT
      .replace('{answer_1}', answers.q1)
      .replace('{answer_2}', answers.q2)
      .replace('{answer_3}', answers.q3)
      .replace('{answer_4}', answers.q4)
      .replace('{answer_5}', answers.q5);

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    let classification;

    try {
      classification = JSON.parse(text);
    } catch {
      console.error('Failed to parse classification response:', text);
      classification = {
        persona: 'pragmatist',
        confidence: 0.5,
        reasoning: 'Classification failed, defaulting to pragmatist.',
        secondary: null,
      };
    }

    // Validate persona values
    if (!VALID_PERSONAS.includes(classification.persona)) {
      classification.persona = 'pragmatist';
    }
    if (classification.secondary && !VALID_PERSONAS.includes(classification.secondary)) {
      classification.secondary = null;
    }

    // Store persona + intake answers
    const { error: updateError } = await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: userId,
        coaching_persona: classification.persona,
        persona_set_at: new Date().toISOString(),
        persona_set_by: 'intake',
        intake_answers: answers,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (updateError) {
      console.error('Failed to save persona:', updateError);
    }

    return res.status(200).json({
      success: true,
      classification,
    });
  } catch (error) {
    console.error('Persona classification error:', error);
    return res.status(500).json({
      error: 'Failed to classify persona',
      message: error.message,
    });
  }
}
