// Vercel API Route: Route Builder coach opener (Unit 4, PR-4B)
//
// Returns a persona-voiced opening line for the Route Builder chat
// panel. No LLM call — static per-persona templates keyed off the
// rider's coaching_persona, optionally referencing the loaded route
// ("your 42 km loop") when the client sends a routeSnapshot. Cheap
// enough to fetch once (or twice, after a route loads) per session.

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { setupCors } from '../utils/cors.js';

const KM_TO_MI = 0.621371;
const MAX_NAME_LENGTH = 60;

/**
 * Build the route reference phrase from a (user-supplied, so defensively
 * validated) snapshot: "'Lookout Loop'" when named, else
 * "your 42 km loop" / "your 26 mi route". Null when nothing usable.
 */
function routeRef(snapshot, units) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const name = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
  if (name && name.length <= MAX_NAME_LENGTH) return `'${name}'`;

  const distanceKm = Number(snapshot.distance_km);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 2000) return null;

  const imperial = units === 'imperial';
  const distText = imperial
    ? `${Math.round(distanceKm * KM_TO_MI)} mi`
    : `${Math.round(distanceKm)} km`;
  const shape =
    snapshot.routeType === 'loop'
      ? 'loop'
      : snapshot.routeType === 'out_and_back'
        ? 'out-and-back'
        : 'route';
  return `your ${distText} ${shape}`;
}

// Openers as functions of the route reference. With ref = null the
// strings are EXACTLY the pre-route-aware versions — old clients that
// send no body see no change.
const PERSONA_OPENERS = {
  hammer: (ref) => (ref ? `What needs fixing on ${ref}?` : 'What needs fixing on this route?'),
  scientist: (ref) =>
    ref
      ? `What aspect of ${ref} would you like to refine?`
      : 'What aspect of this route would you like to refine?',
  encourager: (ref) =>
    ref
      ? `How can I help you make ${ref} even better today?`
      : 'How can I help you make this ride better today?',
  pragmatist: (ref) =>
    ref ? `What needs adjusting on ${ref}?` : 'What needs adjusting on this route?',
  competitor: (ref) =>
    ref
      ? `What's the goal for ${ref} — and what needs to change to get there?`
      : "What's the goal — and what needs to change to get there?",
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

    const { routeSnapshot = null, units = 'metric' } = req.body ?? {};
    const ref = routeRef(routeSnapshot, units === 'imperial' ? 'imperial' : 'metric');

    const personaId = settings?.coaching_persona;
    const message =
      personaId && personaId !== 'pending' && PERSONA_OPENERS[personaId]
        ? PERSONA_OPENERS[personaId](ref)
        : FALLBACK;

    return res.status(200).json({ success: true, message });
  } catch (err) {
    console.error('[route-coach/opener] error:', err);
    return res.status(200).json({ success: true, message: FALLBACK });
  }
}
