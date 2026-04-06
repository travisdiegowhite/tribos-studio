// Vercel API Route: Coach Intel Strip
// Lightweight endpoint for one-line weekly training briefings
// Uses claude-haiku-4-5 for cost efficiency

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
import { PERSONA_DATA } from './utils/personaData.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  // CORS
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Rate limit: 20 requests per 5 minutes (generous — calls are cached client-side)
    const rateLimitResult = await rateLimitMiddleware(req, res, 'COACH_INTEL', 20, 5);
    if (rateLimitResult !== null) return;

    const {
      weekNumber,
      scheduledWorkouts = [],
      currentTSB,
      currentATL,
      currentCTL,
      daysToRace,
      coachPersona = 'pragmatist',
    } = req.body;

    // Get persona voice
    const persona = PERSONA_DATA[coachPersona] || PERSONA_DATA.pragmatist;

    // Build context summary
    const workoutSummary = scheduledWorkouts.length > 0
      ? scheduledWorkouts.map(w => `${w.name || w.workout_type} (${w.target_tss || 0} TSS)`).join(', ')
      : 'No workouts scheduled';

    const totalTSS = scheduledWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);

    const prompt = `You are ${persona.name}, a cycling coach. ${persona.voice}

Week ${weekNumber || '?'} summary:
- Scheduled workouts: ${workoutSummary}
- Total planned TSS: ${totalTSS}
- Current form (TSB): ${currentTSB ?? 'unknown'}
- Acute load (ATL): ${currentATL ?? 'unknown'}
- Chronic load (CTL): ${currentCTL ?? 'unknown'}
${daysToRace ? `- Days to next race: ${daysToRace}` : ''}

Generate a single-sentence weekly training briefing (max 120 characters) in your persona voice. No greeting, no sign-off. Just the insight.`;

    const claude = new Anthropic({ apiKey });
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20241022',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    const briefing = response.content[0]?.text?.trim() || 'Stay consistent this week.';

    return res.status(200).json({
      success: true,
      briefing,
      personaName: persona.name,
      weekNumber,
    });
  } catch (error) {
    console.error('Coach Intel error:', error);
    return res.status(500).json({ error: 'Failed to generate briefing' });
  }
}
