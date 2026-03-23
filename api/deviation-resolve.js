/**
 * Deviation Resolve
 *
 * Called when an athlete accepts or dismisses a deviation recommendation.
 *
 * POST /api/deviation-resolve
 * Body: { deviation_id, selected_option }
 * Auth: Bearer <JWT>
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const VALID_OPTIONS = ['no_adjust', 'modify', 'swap', 'insert_rest', 'drop'];

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

  const { deviation_id, selected_option } = req.body;

  if (!deviation_id || !selected_option) {
    return res.status(400).json({ error: 'deviation_id and selected_option required' });
  }

  if (!VALID_OPTIONS.includes(selected_option)) {
    return res.status(400).json({ error: `Invalid option. Must be one of: ${VALID_OPTIONS.join(', ')}` });
  }

  try {
    // Verify the deviation belongs to this user
    const { data: deviation, error: fetchError } = await supabase
      .from('plan_deviations')
      .select('id, user_id, options_json, deviation_date')
      .eq('id', deviation_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !deviation) {
      return res.status(404).json({ error: 'Deviation not found' });
    }

    // Update the deviation record
    const { error: updateError } = await supabase
      .from('plan_deviations')
      .update({
        selected_option,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', deviation_id)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    // TODO: If option requires plan modification (swap, insert_rest, drop),
    // call plan mutation service to update planned_workouts table.
    // For now, we just record the decision. Plan mutation can be wired up
    // to the existing reshufflePlan() logic in useTrainingPlan.

    return res.status(200).json({ status: 'resolved', selected_option });
  } catch (error) {
    console.error('deviation-resolve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
