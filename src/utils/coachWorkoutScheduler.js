// Shared helper for adding a coach-recommended workout to the athlete's calendar.
//
// Both coach surfaces (CoachCommandBar — the global modal, and CoachCard — the
// dashboard chat) used to carry their own divergent copies of this logic. The
// command bar version silently failed when the athlete had no active plan; this
// helper auto-creates a "coach_recommended" plan instead, so a recommendation is
// always actionable. It also dual-writes the canonical (target_rss) and legacy
// (target_tss) columns per the metrics-rollout policy in CLAUDE.md.

import { getWorkoutById } from '../data/workoutLibrary';
import { resolveScheduledDate } from './dateUtils';
import { upsertSessionOnDate } from '../lib/calendar/calendarMutations';

// planned_workouts.workout_type is a constrained enum; map free-form types onto it.
const VALID_WORKOUT_TYPES = [
  'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
  'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest',
];

/**
 * Resolve (or create) the plan a coach workout should attach to.
 * @returns {Promise<string|null>} plan id, or null on failure
 */
async function resolveActivePlanId(supabase, userId, planId) {
  if (planId) return planId;

  // Canonical active plan = most-recent-active, tie-broken by created_at.
  // Must match the dashboard/planner resolvers (usePlannerData,
  // TrainingDashboard) so the coach writes to the SAME plan those surfaces
  // display. Diverging sort keys were the root cause of coach-added rides
  // landing in a plan the planner wasn't showing.
  const { data: activePlan } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activePlan) return activePlan.id;

  // No active plan — auto-create a lightweight one so the athlete isn't blocked.
  const today = new Date();
  const startDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const { data: newPlan, error: planError } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      template_id: 'coach_recommended',
      name: 'Coach Recommended Workouts',
      duration_weeks: 52,
      methodology: 'coach_guided',
      goal: 'general_fitness',
      fitness_level: 'intermediate',
      started_at: startDateStr,
      start_date: startDateStr,
      status: 'active',
    })
    .select('id')
    .single();

  if (planError) throw planError;
  return newPlan.id;
}

/**
 * Add a coach-recommended workout to the athlete's calendar.
 *
 * @param {object} supabase  Browser Supabase client (from src/lib/supabase.js)
 * @param {object} args
 * @param {string} args.userId
 * @param {object} args.recommendation  Coach tool payload: { workout_id, scheduled_date, reason, workout_type?, target_rss?, target_tss?, duration_minutes?, name? }
 * @param {string|null} [args.planId]   Plan to attach to; resolved/created if omitted
 * @returns {Promise<{ success: boolean, replaced?: boolean, workoutName?: string, scheduledDate?: string, planId?: string, error?: string }>}
 */
export async function scheduleCoachWorkout(supabase, { userId, recommendation, planId = null }) {
  if (!userId || !recommendation?.workout_id) {
    return { success: false, error: 'Missing user or workout' };
  }

  try {
    const workout = getWorkoutById(recommendation.workout_id);
    const workoutName = workout?.name || recommendation.name || recommendation.workout_id || 'Workout';

    const resolvedPlanId = await resolveActivePlanId(supabase, userId, planId);
    if (!resolvedPlanId) {
      return { success: false, error: 'Could not find or create a training plan' };
    }

    const scheduledDate = resolveScheduledDate(recommendation.scheduled_date);
    const dayOfWeek = new Date(scheduledDate + 'T12:00:00').getDay();

    const normalizedType = (workout?.workoutType || workout?.category || recommendation.workout_type || '')
      .toLowerCase().replace(/[\s-]/g, '_');
    const dbWorkoutType = VALID_WORKOUT_TYPES.includes(normalizedType) ? normalizedType : 'endurance';

    // Dual-write canonical (RSS) + legacy (TSS) load columns from whatever is available.
    const targetLoad = workout?.targetTSS ?? recommendation.target_rss ?? recommendation.target_tss ?? null;
    const targetDuration = workout?.duration ?? recommendation.duration_minutes ?? null;

    // One call detects the displaced session AND writes, so "replaced X" comes
    // from what actually happened rather than from a separate earlier read that
    // could disagree with it. The calendar has one load column, so the
    // canonical/legacy dual-write the old table needed does not arise.
    const saved = await upsertSessionOnDate(userId, scheduledDate, {
      type: 'workout',
      title: workoutName,
      workout_id: recommendation.workout_id,
      workout_type: dbWorkoutType,
      target_load: targetLoad,
      target_duration_min: targetDuration,
      notes: recommendation.reason ? `Coach recommendation: ${recommendation.reason}` : '',
      source: 'coach',
    }, { planId: resolvedPlanId });

    if (!saved.success) throw new Error(saved.error);

    return {
      success: true,
      replaced: !!saved.replacedName,
      replacedName: saved.replacedName || null,
      workoutName,
      scheduledDate,
      planId: resolvedPlanId,
    };
  } catch (err) {
    console.error('scheduleCoachWorkout failed:', err);
    return { success: false, error: err.message || 'Failed to add workout to calendar' };
  }
}
