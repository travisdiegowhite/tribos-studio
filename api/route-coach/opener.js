// Vercel API Route: Route Builder coach opener (Unit 4, PR-4B)
//
// Returns a persona-voiced opening line for the Route Builder chat
// panel. No LLM call — a static per-persona lookup keyed off the
// rider's coaching_persona. Cheap enough to fetch once per session.

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { setupCors } from '../utils/cors.js';

const PERSONA_OPENERS = {
  hammer: 'What needs fixing on this route?',
  scientist: 'What aspect of this route would you like to refine?',
  encourager: 'How can I help you make this ride better today?',
  pragmatist: 'What needs adjusting on this route?',
  competitor: "What's the goal — and what needs to change to get there?",
};

const FALLBACK = "Tell me what you'd like to change about this route.";

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const token = authHeader.slice(7);
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or expired authentication token' });
    }

    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', authUser.id)
      .maybeSingle();

    const personaId = settings?.coaching_persona;
    const message =
      personaId && personaId !== 'pending' && PERSONA_OPENERS[personaId]
        ? PERSONA_OPENERS[personaId]
        : FALLBACK;

    return res.status(200).json({ success: true, message });
  } catch (err) {
    console.error('[route-coach/opener] error:', err);
    return res.status(200).json({ success: true, message: FALLBACK });
  }
}
