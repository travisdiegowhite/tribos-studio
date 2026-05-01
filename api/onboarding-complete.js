/**
 * POST /api/onboarding-complete
 *
 * Called from the OnboardingModal on Screen 9 (Coach Reveal).
 * Performs all onboarding completion in one atomic call:
 *   1. Classifies coaching persona from answers (Claude call)
 *   2. Generates a personalized opening message (Claude call)
 *   3. Saves all profile data to user_profiles
 *   4. Saves persona to user_coach_settings
 *   5. Saves opening message to coach_conversations
 *
 * Welcome email is sent separately by api/cron/welcome-email.js ~15 min post-signup.
 *
 * Returns: { persona, personaName, openingMessage, confidence, secondary }
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const PERSONA_NAMES = {
  hammer: 'The Hammer',
  scientist: 'The Scientist',
  encourager: 'The Encourager',
  pragmatist: 'The Pragmatist',
  competitor: 'The Competitor',
};

const PERSONA_VOICES = {
  hammer: 'Direct, brief, no filler. Short declarative sentences. Uses imperatives.',
  scientist: 'Calm, precise, explanatory. Uses physiological terminology naturally.',
  encourager: 'Warm, process-focused, affirming without being saccharine.',
  pragmatist: 'Grounded, conversational, practical and forward-focused.',
  competitor: 'Focused, forward-looking, frames everything in terms of results.',
};


const VALID_PERSONAS = ['hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'];

const CLASSIFICATION_PROMPT = `You are classifying a cyclist's coaching preference based on their onboarding answers.

PERSONA OPTIONS:
- hammer: Demanding, accountability-focused, high expectations
- scientist: Analytical, physiological, data-driven explanation
- encourager: Warm, process-focused, consistency over perfection
- pragmatist: Realistic, life-aware, forward-looking
- competitor: Race-focused, results-driven, competitive framing

ANSWERS:
Experience level: {experience}
Training goal: {goal}
Coaching style preference: {coaching_style}
Weekly hours: {hours}
Coach role preference: {coach_role}

PRIMARY SIGNALS come from coaching_style and coach_role. Experience and goal provide context.

Return ONLY valid JSON. No preamble.
{
  "persona": "<persona_id>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explaining the assignment>",
  "secondary": "<second-best persona_id if confidence < 0.75, else null>"
}`;

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    experience_level,
    primary_goal,
    target_event_name,
    target_event_date,
    weekly_hours_available,
    weekly_tss_estimate,
    preferred_terrain,
    ftp,
    units_preference,
    coaching_style_answer,
    coach_role_answer,
  } = req.body;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const claude = apiKey ? new Anthropic({ apiKey }) : null;

    // ── 1. Classify persona ──
    let persona = 'pragmatist';
    let confidence = 0.5;
    let secondary = null;
    let reasoning = '';

    if (claude && coaching_style_answer && coach_role_answer) {
      try {
        const prompt = CLASSIFICATION_PROMPT
          .replace('{experience}', experience_level || 'not provided')
          .replace('{goal}', primary_goal || 'not provided')
          .replace('{coaching_style}', coaching_style_answer)
          .replace('{hours}', weekly_hours_available ? `${weekly_hours_available} hrs/week` : 'not provided')
          .replace('{coach_role}', coach_role_answer);

        const response = await claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0]?.text || '';
        const classification = JSON.parse(text);

        if (VALID_PERSONAS.includes(classification.persona)) {
          persona = classification.persona;
        }
        confidence = typeof classification.confidence === 'number' ? classification.confidence : 0.5;
        secondary = classification.secondary && VALID_PERSONAS.includes(classification.secondary) ? classification.secondary : null;
        reasoning = classification.reasoning || '';
      } catch (classifyErr) {
        console.error('Persona classification failed, using pragmatist:', classifyErr.message);
      }
    }

    // ── 2. Generate opening message ──
    let openingMessage = 'Welcome. Let\u2019s take a look at where you are and figure out the best path forward.';

    if (claude) {
      try {
        const voice = PERSONA_VOICES[persona] || PERSONA_VOICES.pragmatist;
        const userContext = [
          experience_level && `Experience: ${experience_level}`,
          primary_goal && `Goal: ${primary_goal}`,
          target_event_name && `Target event: ${target_event_name}`,
          target_event_date && `Event date: ${target_event_date}`,
          weekly_hours_available && `Hours/week: ${weekly_hours_available}`,
          ftp && `FTP: ${ftp}W`,
        ].filter(Boolean).join('\n');

        const msgResponse = await claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: `You are ${PERSONA_NAMES[persona]}, a cycling coach. Voice: ${voice}`,
          messages: [{
            role: 'user',
            content: `Generate a brief, personal opening message (2-3 sentences) for a new user who just joined Tribos.

Their answers:
${userContext}

Write in your coaching voice. Reference something specific from their answers.
Do not introduce yourself — they already know who you are.
Do not use generic welcome language. Be direct and specific.
Maximum 3 sentences.`,
          }],
        });

        const msgText = msgResponse.content[0]?.text?.trim();
        if (msgText) openingMessage = msgText;
      } catch (msgErr) {
        console.error('Opening message generation failed:', msgErr.message);
      }
    }

    // ── 3. Save user_profiles ──
    const profileUpdate = {
      id: user.id,
      onboarding_completed: true,
      units_preference: units_preference || 'imperial',
      onboarding_persona_set: true,
      // Canonical persona home (migration 086) — Today view reads this.
      coach_persona_id: persona,
    };
    if (experience_level) profileUpdate.experience_level = experience_level;
    if (weekly_hours_available != null) profileUpdate.weekly_hours_available = weekly_hours_available;
    if (preferred_terrain) profileUpdate.preferred_terrain = preferred_terrain;
    if (primary_goal) profileUpdate.primary_goal = primary_goal;
    if (target_event_date) profileUpdate.target_event_date = target_event_date;
    if (target_event_name) profileUpdate.target_event_name = target_event_name;
    if (ftp != null) profileUpdate.ftp = ftp;
    if (weekly_tss_estimate != null) {
      // Dual-write during §1f rollout; migration 080 drops the legacy column.
      profileUpdate.weekly_tss_estimate = weekly_tss_estimate;
      profileUpdate.weekly_rss_estimate = weekly_tss_estimate;
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(profileUpdate);

    if (profileError) {
      console.error('Profile upsert error:', profileError);
    }

    // ── 4. Save persona to user_coach_settings ──
    const { error: personaError } = await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: user.id,
        coaching_persona: persona,
        persona_set_at: new Date().toISOString(),
        persona_set_by: 'onboarding',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (personaError) {
      console.error('Persona save error:', personaError);
    }

    // ── 5. Save opening message to coach_conversations ──
    const { error: msgError } = await supabase
      .from('coach_conversations')
      .insert({
        user_id: user.id,
        role: 'coach',
        message: openingMessage,
        message_type: 'chat',
        context_snapshot: { coach_type: 'training', source: 'onboarding' },
        coach_type: 'strategist',
        timestamp: new Date().toISOString(),
      });

    if (msgError) {
      console.error('Opening message save error:', msgError);
    }


    return res.status(200).json({
      persona,
      personaName: PERSONA_NAMES[persona],
      openingMessage,
      confidence,
      secondary,
      reasoning,
    });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

