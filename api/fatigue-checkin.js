/**
 * Fatigue Check-in
 *
 * Records a morning readiness survey (leg feel, energy, motivation).
 *
 * POST /api/fatigue-checkin
 * Body: { leg_feel, energy, motivation, hrv_status?, notes? }
 * Auth: Bearer <JWT>
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { leg_feel, energy, motivation, hrv_status, notes } = req.body;

  // Validate required fields
  if (!leg_feel || !energy || !motivation) {
    return res.status(400).json({ error: 'leg_feel, energy, and motivation are required (1-5)' });
  }

  const validate = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (!validate(leg_feel) || !validate(energy) || !validate(motivation)) {
    return res.status(400).json({ error: 'leg_feel, energy, and motivation must be integers 1-5' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('fatigue_checkins')
      .upsert({
        user_id: user.id,
        date: today,
        leg_feel,
        energy,
        motivation,
        hrv_status: hrv_status || null,
        notes: notes || null,
      }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ status: 'saved', checkin: data });
  } catch (error) {
    console.error('fatigue-checkin error:', error);
    return res.status(500).json({ error: error.message });
  }
}
