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
import { fetchEntryById } from './utils/calendarRead.js';
import { updateEntry, createEntry } from './utils/calendarWrite.js';
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

  // Verify the entry belongs to this athlete and is not yet completed.
  // fetchEntryById scopes to the user, which on the service-role client is the
  // whole check rather than a second one.
  const workout = await fetchEntryById(userId, planned_workout_id);

  if (!workout) {
    return { success: false, error: 'Session not found on this athlete\'s calendar' };
  }
  if (workout.completed) {
    return { success: false, error: 'Workout already completed — cannot modify' };
  }

  // The calendar has ONE load column and ONE duration column, so the
  // canonical/legacy pairs the old table needed collapse to a single field
  // each. `updated_at` is maintained by a trigger, not written here.
  const updates = {};

  switch (op) {
    case 'skip': {
      updates.type = 'rest';
      updates.workout_type = 'rest';
      updates.title = 'Rest Day (coach adjustment)';
      updates.target_load = 0;
      updates.target_duration_min = 0;
      break;
    }
    case 'extend': {
      const addMinutes = Math.abs(delta_minutes || 0);
      updates.target_duration_min = (workout.target_duration || 60) + addMinutes;
      if (new_rss != null) updates.target_load = new_rss;
      break;
    }
    case 'reduce': {
      const removeMinutes = Math.abs(delta_minutes || 0);
      updates.target_duration_min = Math.max(15, (workout.target_duration || 60) - removeMinutes);
      if (new_rss != null) updates.target_load = new_rss;
      break;
    }
    case 'swap': {
      if (new_type) updates.workout_type = new_type;
      if (new_rss != null) updates.target_load = new_rss;
      break;
    }
    case 'add': {
      // 'add' creates a new entry rather than changing the one addressed.
      // createEntry allocates the slot, so an added session stacks onto an
      // occupied day instead of colliding with it — which is what a double day
      // is, and the only sensible reading of "add a session on that date".
      const insertedRss = new_rss || 50;
      const created = await createEntry(
        userId,
        mod.scheduled_date || workout.scheduled_date,
        {
          type: 'workout',
          title: new_type ? `Coach Added — ${new_type}` : 'Coach Added Session',
          workout_type: new_type || 'endurance',
          target_load: insertedRss,
          target_duration_min: delta_minutes || 60,
        },
        { source: 'coach', planId: workout.plan_id },
      );
      return { success: created.success, error: created.error };
    }
    default:
      return { success: false, error: `Unknown op: ${op}` };
  }

  const result = await updateEntry(userId, planned_workout_id, updates);
  return { success: result.success, error: result.error };
}
