/**
 * Activity RPE capture.
 *
 * POST /api/activity-rpe  body: { activity_id, rpe }   (auth: Bearer JWT)
 *
 * Persists the athlete's subjective RPE (1-10 Foster scale) onto
 * activities.rpe_score. Server-side with an owner check so it works regardless
 * of client RLS. Feeds the "high-compliance + low-RPE" progression signal.
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { activity_id, rpe } = req.body ?? {};
  const rpeNum = Number(rpe);
  if (!activity_id || !Number.isFinite(rpeNum) || rpeNum < 1 || rpeNum > 10) {
    return res.status(400).json({ error: 'activity_id and rpe (1-10) required' });
  }

  try {
    const { error } = await supabase
      .from('activities')
      .update({ rpe_score: Math.round(rpeNum) })
      .eq('id', activity_id)
      .eq('user_id', user.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[activity-rpe] error:', err);
    return res.status(500).json({ error: 'Failed to save RPE', detail: err?.message ?? String(err) });
  }
}
