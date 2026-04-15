/**
 * Training Load Projection
 *
 * Returns TSB projection for the next N days.
 * Used by the UI to render the forward-looking TSB chart.
 *
 * GET /api/training-load-projection?days=14
 * Auth: Bearer <JWT>
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
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

  const days = Number(req.query?.days ?? 14);

  try {
    // Get latest training load state.
    const { data: latestLoad } = await supabase
      .from('training_load_daily')
      .select('tfi, afi, form_score, date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const currentState = latestLoad
      ? { tfi: Number(latestLoad.tfi), afi: Number(latestLoad.afi), formScore: Number(latestLoad.form_score) }
      : { tfi: 42, afi: 42, formScore: 0 };

    // Get upcoming planned workouts
    const today = new Date().toISOString().split('T')[0];
    const { data: upcoming } = await supabase
      .from('planned_workouts')
      .select('scheduled_date, target_tss, is_quality, session_type, workout_type')
      .eq('user_id', user.id)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(days);

    const schedule = (upcoming ?? []).map(w => ({
      date: w.scheduled_date,
      rss: w.target_tss || 0,
      is_quality: w.is_quality || false,
      session_type: w.session_type || w.workout_type,
    }));

    const { projectSchedule } = await import('../src/lib/training/tsb-projection.ts');
    const projection = projectSchedule(currentState, schedule);

    return res.status(200).json({
      projection,
      current: currentState,
      latest_date: latestLoad?.date ?? null,
    });
  } catch (error) {
    console.error('training-load-projection error:', error);
    return res.status(500).json({ error: error.message });
  }
}
