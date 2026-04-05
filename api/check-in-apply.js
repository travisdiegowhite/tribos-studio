/**
 * Check-In Apply
 *
 * Called when an athlete accepts a check-in recommendation.
 * Records the decision AND applies the planned_mutation to planned_workouts.
 *
 * POST /api/check-in-apply
 * Body: { check_in_id }
 * Auth: Bearer <JWT>
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const VALID_MUTATION_TYPES = ['modify', 'swap', 'insert_rest', 'drop', 'replace'];
const VALID_TARGETS = ['next_quality', 'tomorrow', 'next'];

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

  const { check_in_id } = req.body;
  if (!check_in_id) {
    return res.status(400).json({ error: 'check_in_id required' });
  }

  try {
    // Fetch the check-in and verify ownership
    const { data: checkIn, error: fetchError } = await supabase
      .from('coach_check_ins')
      .select('id, user_id, recommendation')
      .eq('id', check_in_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !checkIn) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    // Check for existing decision (idempotency)
    const { data: existingDecision } = await supabase
      .from('coach_check_in_decisions')
      .select('id')
      .eq('check_in_id', check_in_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingDecision) {
      return res.status(409).json({ error: 'Decision already recorded for this check-in' });
    }

    const recommendation = checkIn.recommendation;
    const mutation = recommendation?.planned_mutation;
    const summary = recommendation
      ? `${recommendation.action}: ${recommendation.detail}`
      : 'Accepted check-in';

    // Apply the mutation if present and valid
    let mutationResult = null;
    if (mutation && VALID_MUTATION_TYPES.includes(mutation.type) && VALID_TARGETS.includes(mutation.target)) {
      mutationResult = await applyMutation(user.id, mutation);
    }

    // Record the decision
    const { data: decision, error: decisionError } = await supabase
      .from('coach_check_in_decisions')
      .insert({
        user_id: user.id,
        check_in_id,
        decision: 'accept',
        recommendation_summary: summary,
        outcome_notes: mutationResult ? JSON.stringify(mutationResult) : null,
      })
      .select()
      .single();

    if (decisionError) {
      throw decisionError;
    }

    return res.status(200).json({
      status: 'applied',
      decision,
      mutation: mutationResult,
    });
  } catch (error) {
    console.error('check-in-apply error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Apply a planned mutation to the user's active training plan.
 */
async function applyMutation(userId, mutation) {
  // Get user's timezone for accurate date calculations
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = profile?.timezone || 'America/New_York';

  // Compute today and tomorrow in the user's timezone
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });
  const tomorrowDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toLocaleDateString('en-CA', { timeZone: tz });

  // Find active plan
  const { data: plan } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return { applied: false, reason: 'no_active_plan' };
  }

  // Fetch upcoming unfinished workouts
  const { data: upcoming } = await supabase
    .from('planned_workouts')
    .select('id, scheduled_date, name, workout_type, target_tss, target_duration, is_quality')
    .eq('plan_id', plan.id)
    .eq('user_id', userId)
    .gte('scheduled_date', today)
    .eq('completed', false)
    .order('scheduled_date', { ascending: true })
    .limit(14);

  if (!upcoming || upcoming.length === 0) {
    return { applied: false, reason: 'no_upcoming_workouts' };
  }

  // Resolve target workout
  const target = resolveTarget(upcoming, mutation.target, tomorrowStr);
  if (!target) {
    return { applied: false, reason: `no_workout_matching_target_${mutation.target}` };
  }

  switch (mutation.type) {
    case 'modify': {
      const scaleFactor = Math.max(0.5, Math.min(0.9, mutation.scale_factor || 0.7));
      const newTss = target.target_tss ? Math.round(target.target_tss * scaleFactor) : null;
      const newDuration = target.target_duration ? Math.round(target.target_duration * scaleFactor) : null;

      const updates = {};
      if (newTss !== null) updates.target_tss = newTss;
      if (newDuration !== null) updates.target_duration = newDuration;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('planned_workouts')
          .update(updates)
          .eq('id', target.id)
          .eq('user_id', userId);
      }

      return {
        applied: true,
        action: 'modify',
        workout_id: target.id,
        workout_name: target.name,
        date: target.scheduled_date,
        original_tss: target.target_tss,
        new_tss: newTss,
        scale_factor: scaleFactor,
      };
    }

    case 'swap': {
      const qualityDate = new Date(target.scheduled_date);
      const swapDate = new Date(qualityDate);
      swapDate.setDate(swapDate.getDate() + 2);
      const swapDateStr = swapDate.toISOString().split('T')[0];

      const swapTarget = upcoming.find(w => w.scheduled_date === swapDateStr);
      if (!swapTarget) {
        return { applied: false, reason: 'no_workout_at_swap_date' };
      }

      await Promise.all([
        supabase
          .from('planned_workouts')
          .update({ scheduled_date: swapDateStr })
          .eq('id', target.id)
          .eq('user_id', userId),
        supabase
          .from('planned_workouts')
          .update({ scheduled_date: target.scheduled_date })
          .eq('id', swapTarget.id)
          .eq('user_id', userId),
      ]);

      return {
        applied: true,
        action: 'swap',
        swapped: [
          { id: target.id, name: target.name, moved_to: swapDateStr },
          { id: swapTarget.id, name: swapTarget.name, moved_to: target.scheduled_date },
        ],
      };
    }

    case 'insert_rest': {
      await supabase
        .from('planned_workouts')
        .update({
          target_tss: 0,
          workout_type: 'rest',
          name: 'Rest Day (coach adjustment)',
        })
        .eq('id', target.id)
        .eq('user_id', userId);

      return {
        applied: true,
        action: 'insert_rest',
        workout_id: target.id,
        original_name: target.name,
        date: target.scheduled_date,
      };
    }

    case 'drop': {
      await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', target.id)
        .eq('user_id', userId);

      return {
        applied: true,
        action: 'drop',
        workout_id: target.id,
        workout_name: target.name,
        date: target.scheduled_date,
      };
    }

    case 'replace': {
      if (!mutation.replacement) {
        return { applied: false, reason: 'replace_missing_replacement_data' };
      }

      const r = mutation.replacement;
      await supabase
        .from('planned_workouts')
        .update({
          workout_type: r.workout_type || 'endurance',
          name: r.name || 'Coach Replacement',
          target_tss: r.target_tss || null,
          target_duration: r.target_duration || null,
        })
        .eq('id', target.id)
        .eq('user_id', userId);

      return {
        applied: true,
        action: 'replace',
        workout_id: target.id,
        original_name: target.name,
        new_name: r.name,
        date: target.scheduled_date,
      };
    }

    default:
      return { applied: false, reason: 'unknown_mutation_type' };
  }
}

/**
 * Resolve which workout to target based on the mutation target field.
 */
function resolveTarget(upcoming, target, tomorrowStr) {
  switch (target) {
    case 'tomorrow':
      return upcoming.find(w => w.scheduled_date === tomorrowStr) || null;
    case 'next_quality':
      return upcoming.find(w => w.is_quality === true) || upcoming[0] || null;
    case 'next':
      return upcoming[0] || null;
    default:
      return upcoming[0] || null;
  }
}
