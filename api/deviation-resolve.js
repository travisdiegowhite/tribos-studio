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
import { isQualityWorkout } from './utils/qualitySession.js';
import { fetchPlannedSessions } from './utils/calendarRead.js';
import { updateEntry, deleteEntry, swapEntries } from './utils/calendarWrite.js';
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

  // The next two weeks from the CALENDAR. The active-plan lookup that used to
  // gate this is gone: an entry belongs to the athlete, so a deviation can now
  // be resolved against a session the coach scheduled without a plan — which
  // this endpoint used to refuse outright.
  const upcoming = await fetchPlannedSessions(userId, {
    from: tomorrowStr,
    limit: 14,
    includeCompleted: false,
  });

  if (upcoming.length === 0) {
    return { applied: false, reason: 'no_upcoming_workouts' };
  }

  const nextQuality = upcoming.find(isQualityWorkout);
  const tomorrowWorkout = upcoming.find(w => w.scheduled_date === tomorrowStr);

  switch (option) {
    case 'modify': {
      // Reduce next quality workout TSS and duration by 30%
      const target = nextQuality || upcoming[0];
      const newTss = target.target_tss ? Math.round(target.target_tss * 0.7) : null;
      const newDuration = target.target_duration ? Math.round(target.target_duration * 0.7) : null;

      const updates = {};
      if (newTss !== null) updates.target_load = newTss;
      if (newDuration !== null) updates.target_duration_min = newDuration;

      if (Object.keys(updates).length > 0) {
        const result = await updateEntry(userId, target.id, updates);
        if (!result.success) return { applied: false, reason: result.error };
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

      // Two plain date updates would collide on UNIQUE (user_id, date, slot);
      // swapEntries parks one row on a sentinel slot first.
      const swapped = await swapEntries(userId, nextQuality.id, swapTarget.id);
      if (!swapped.success) return { applied: false, reason: swapped.error };

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

      const rested = await updateEntry(userId, tomorrowWorkout.id, {
        type: 'rest',
        workout_type: 'rest',
        title: 'Rest Day (deviation adjustment)',
        target_load: 0,
      });
      if (!rested.success) return { applied: false, reason: rested.error };

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

      const dropped = await deleteEntry(userId, target.id);
      if (!dropped.success) return { applied: false, reason: dropped.error };

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
