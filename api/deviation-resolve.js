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

    // Apply plan mutations based on selected option
    let mutationResult = null;
    if (selected_option !== 'no_adjust') {
      mutationResult = await applyPlanMutation(supabase, user.id, deviation, selected_option);
    }

    return res.status(200).json({
      status: 'resolved',
      selected_option,
      mutation: mutationResult,
    });
  } catch (error) {
    console.error('deviation-resolve error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Apply plan mutations to planned_workouts based on the selected deviation option.
 */
async function applyPlanMutation(supabase, userId, deviation, option) {
  const deviationDate = deviation.deviation_date;

  // Get user's timezone for accurate "today"/"tomorrow"
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = profile?.timezone || 'America/New_York';

  // Compute today and tomorrow in the user's timezone
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD format
  const tomorrowDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toLocaleDateString('en-CA', { timeZone: tz });

  // Find the user's active plan
  const { data: plan } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!plan) {
    return { applied: false, reason: 'no_active_plan' };
  }

  const { data: upcoming } = await supabase
    .from('planned_workouts')
    .select('id, scheduled_date, name, workout_type, target_tss, target_duration, is_quality')
    .eq('plan_id', plan.id)
    .eq('user_id', userId)
    .gte('scheduled_date', tomorrowStr)
    .eq('completed', false)
    .order('scheduled_date', { ascending: true })
    .limit(14);

  if (!upcoming || upcoming.length === 0) {
    return { applied: false, reason: 'no_upcoming_workouts' };
  }

  const nextQuality = upcoming.find(w => w.is_quality === true);
  const tomorrowWorkout = upcoming.find(w => w.scheduled_date === tomorrowStr);

  switch (option) {
    case 'modify': {
      // Reduce next quality workout TSS and duration by 30%
      const target = nextQuality || upcoming[0];
      const newTss = target.target_tss ? Math.round(target.target_tss * 0.7) : null;
      const newDuration = target.target_duration ? Math.round(target.target_duration * 0.7) : null;

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
        original_tss: target.target_tss,
        new_tss: newTss,
      };
    }

    case 'swap': {
      // Swap the next quality workout with a workout 2 days later
      if (!nextQuality) {
        return { applied: false, reason: 'no_quality_workout_found' };
      }

      const qualityDate = new Date(nextQuality.scheduled_date);
      const swapDate = new Date(qualityDate);
      swapDate.setDate(swapDate.getDate() + 2);
      const swapDateStr = swapDate.toISOString().split('T')[0];

      const swapTarget = upcoming.find(w => w.scheduled_date === swapDateStr);
      if (!swapTarget) {
        return { applied: false, reason: 'no_workout_at_swap_date' };
      }

      // Swap scheduled dates
      await Promise.all([
        supabase
          .from('planned_workouts')
          .update({ scheduled_date: swapDateStr })
          .eq('id', nextQuality.id)
          .eq('user_id', userId),
        supabase
          .from('planned_workouts')
          .update({ scheduled_date: nextQuality.scheduled_date })
          .eq('id', swapTarget.id)
          .eq('user_id', userId),
      ]);

      return {
        applied: true,
        action: 'swap',
        swapped: [
          { id: nextQuality.id, name: nextQuality.name, moved_to: swapDateStr },
          { id: swapTarget.id, name: swapTarget.name, moved_to: nextQuality.scheduled_date },
        ],
      };
    }

    case 'insert_rest': {
      // Convert tomorrow's workout to a rest day
      if (!tomorrowWorkout) {
        return { applied: false, reason: 'no_workout_tomorrow' };
      }

      await supabase
        .from('planned_workouts')
        .update({
          target_tss: 0,
          workout_type: 'rest',
          name: 'Rest Day (deviation adjustment)',
        })
        .eq('id', tomorrowWorkout.id)
        .eq('user_id', userId);

      return {
        applied: true,
        action: 'insert_rest',
        workout_id: tomorrowWorkout.id,
        original_name: tomorrowWorkout.name,
        date: tomorrowStr,
      };
    }

    case 'drop': {
      // Delete the next quality workout
      const target = nextQuality || upcoming[0];

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

    default:
      return { applied: false, reason: 'unknown_option' };
  }
}
