// Vercel API Route: Classify coaching persona from intake interview
// Uses Claude Haiku for lightweight persona classification

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  "secondary": "<second-best persona_id if confidence < 0.75, otherwise null>"
}`;

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth validation
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { answers } = req.body;
    if (!answers || !answers.answer_1 || !answers.answer_2 || !answers.answer_3 || !answers.answer_4 || !answers.answer_5) {
      return res.status(400).json({ error: 'All 5 intake answers are required' });
    }

    // Build prompt with answers
    const prompt = CLASSIFICATION_PROMPT
      .replace('{answer_1}', answers.answer_1)
      .replace('{answer_2}', answers.answer_2)
      .replace('{answer_3}', answers.answer_3)
      .replace('{answer_4}', answers.answer_4)
      .replace('{answer_5}', answers.answer_5);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0]?.text || '';
    let classification;
    try {
      classification = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse classification response:', responseText);
      return res.status(500).json({ error: 'Classification failed — invalid response' });
    }

    // Validate persona
    const validPersonas = ['hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'];
    if (!validPersonas.includes(classification.persona)) {
      classification.persona = 'pragmatist';
      classification.confidence = 0.5;
    }

    // Save persona to user profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        coaching_persona: classification.persona,
        coaching_persona_set_at: new Date().toISOString(),
        coaching_persona_set_by: 'intake',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to save persona:', updateError);
      // Still return classification even if save fails
    }

    return res.status(200).json(classification);
  } catch (error) {
    console.error('❌ Persona classification error:', error.message);
    return res.status(500).json({ error: 'Classification failed' });
  }
}
