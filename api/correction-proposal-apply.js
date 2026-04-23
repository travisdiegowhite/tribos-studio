/**
 * Correction Proposal Apply
 *
 * POST /api/correction-proposal-apply
 * Auth: Bearer <JWT>
 *
 * Accepts or declines a correction proposal. On accept, applies the
 * proposed workout modifications to planned_workouts.
 *
 * Body:
 *   {
 *     proposal_id: string,
 *     decision: 'accepted' | 'declined' | 'partial',
 *     accepted_session_ids?: string[]   // for partial — session_id strings
 *   }
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const VALID_DECISIONS = new Set(['accepted', 'declined', 'partial']);

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) return res.status(401).json({ error: 'unauthorized' });

  const { proposal_id, decision, accepted_session_ids = [] } = req.body || {};

  if (!proposal_id || !decision) {
    return res.status(400).json({ error: 'proposal_id and decision are required' });
  }
  if (!VALID_DECISIONS.has(decision)) {
    return res.status(400).json({ error: `Invalid decision. Must be one of: ${[...VALID_DECISIONS].join(', ')}` });
  }

  try {
    // Fetch proposal and verify ownership
    const { data: proposal, error: fetchError } = await supabase
      .from('coach_correction_proposals')
      .select('*')
      .eq('id', proposal_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.outcome !== 'pending') {
      return res.status(409).json({
        error: 'already_decided',
        message: `This proposal was already ${proposal.outcome}.`,
      });
    }

    // For decline: just record the decision
    if (decision === 'declined') {
      await supabase
        .from('coach_correction_proposals')
        .update({ outcome: 'declined', outcome_at: new Date().toISOString() })
        .eq('id', proposal_id);

      return res.status(200).json({ success: true, outcome: 'declined', applied: 0 });
    }

    // For accept or partial: apply the modifications
    const modifications = proposal.modifications || [];
    const toApply = decision === 'accepted'
      ? modifications
      : modifications.filter(m => (accepted_session_ids || []).includes(m.session_id));

    const applyResults = [];

    for (const mod of toApply) {
      if (!mod.planned_workout_id) {
        applyResults.push({ session_id: mod.session_id, success: false, error: 'Missing planned_workout_id' });
        continue;
      }

      try {
        const result = await applyModification(mod, user.id);
        applyResults.push({ session_id: mod.session_id, success: result.success, error: result.error });
      } catch (err) {
        applyResults.push({ session_id: mod.session_id, success: false, error: err.message });
      }
    }

    const appliedCount = applyResults.filter(r => r.success).length;
    const finalOutcome = decision === 'partial' ? 'partial' : 'accepted';

    await supabase
      .from('coach_correction_proposals')
      .update({
        outcome: finalOutcome,
        outcome_at: new Date().toISOString(),
        accepted_session_ids: accepted_session_ids,
      })
      .eq('id', proposal_id);

    return res.status(200).json({
      success: true,
      outcome: finalOutcome,
      applied: appliedCount,
      results: applyResults,
    });
  } catch (err) {
    console.error('Correction proposal apply error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

// ─── Modification applicator ──────────────────────────────────────────────────

async function applyModification(mod, userId) {
  const { planned_workout_id, op, delta_minutes, new_type, new_rss } = mod;

  // Verify the workout belongs to this user and is not yet completed
  const { data: workout, error: fetchError } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, scheduled_date, workout_type, name, target_duration, target_rss, completed')
    .eq('id', planned_workout_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError || !workout) {
    return { success: false, error: 'Workout not found or already belongs to another user' };
  }
  if (workout.completed) {
    return { success: false, error: 'Workout already completed — cannot modify' };
  }

  const now = new Date().toISOString();
  let updates = { updated_at: now };

  switch (op) {
    case 'skip': {
      updates.workout_type = 'rest';
      updates.name = 'Rest Day (coach adjustment)';
      updates.target_rss = 0;
      updates.target_duration = 0;
      break;
    }
    case 'extend': {
      const addMinutes = Math.abs(delta_minutes || 0);
      updates.target_duration = (workout.target_duration || workout.duration_minutes || 60) + addMinutes;
      if (new_rss != null) updates.target_rss = new_rss;
      break;
    }
    case 'reduce': {
      const removeMinutes = Math.abs(delta_minutes || 0);
      updates.target_duration = Math.max(
        15,
        (workout.target_duration || workout.duration_minutes || 60) - removeMinutes
      );
      if (new_rss != null) updates.target_rss = new_rss;
      break;
    }
    case 'swap': {
      if (new_type) updates.workout_type = new_type;
      if (new_rss != null) updates.target_rss = new_rss;
      break;
    }
    case 'add': {
      // 'add' inserts a new workout; the modification must have new_type and scheduled_date
      // We insert rather than update the existing row
      const { error: insertError } = await supabase
        .from('planned_workouts')
        .insert({
          user_id: userId,
          plan_id: workout.plan_id,
          scheduled_date: mod.scheduled_date || workout.scheduled_date,
          workout_type: new_type || 'endurance',
          name: new_type ? `Coach Added — ${new_type}` : 'Coach Added Session',
          target_rss: new_rss || 50,
          target_duration: delta_minutes || 60,
          completed: false,
        });
      return { success: !insertError, error: insertError?.message };
    }
    default:
      return { success: false, error: `Unknown op: ${op}` };
  }

  const { error: updateError } = await supabase
    .from('planned_workouts')
    .update(updates)
    .eq('id', planned_workout_id);

  return { success: !updateError, error: updateError?.message };
}
