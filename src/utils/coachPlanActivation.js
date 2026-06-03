import { redistributeWorkouts } from './trainingPlans';

/**
 * Activate a coach-generated training plan preview: complete any existing active plans,
 * create the new `training_plans` row, and batch-insert its `planned_workouts`.
 *
 * This is the single shared implementation behind every coach surface (CoachCard,
 * CoachCommandBar, the Today CoachConversation). It deliberately performs NO UI side
 * effects (no notifications, no event dispatch) — the caller owns those — so it stays
 * pure and unit-testable.
 *
 * Distance/load convention: dual-writes the canonical `target_rss` and legacy `target_tss`
 * columns from whichever the preview provides (per CLAUDE.md metrics-freeze policy).
 *
 * @param {object} supabase - Supabase client.
 * @param {object} args
 * @param {string} args.userId
 * @param {object} args.plan - The plan preview ({ name, methodology, goal, duration_weeks,
 *   start_date, workouts: [{ week_number, day_of_week, scheduled_date, workout_type,
 *   workout_id, name, target_rss|target_tss, duration_minutes }] }).
 * @param {object|null} [args.availability] - Optional { weeklyAvailability, dateOverrides,
 *   preferences }. When weeklyAvailability contains blocked days, workouts are redistributed
 *   to fit. Omit (or null) to skip redistribution.
 * @returns {Promise<{success: boolean, planId?: string, planName?: string,
 *   workoutCount?: number, redistributionCount?: number, error?: string}>}
 */
export async function activateTrainingPlan(supabase, { userId, plan, availability = null }) {
  if (!userId) return { success: false, error: 'Not signed in' };
  if (!plan || !Array.isArray(plan.workouts) || plan.workouts.length === 0) {
    return { success: false, error: 'Plan has no workouts to activate' };
  }

  try {
    // Mark existing active plans as completed so only the new one is active.
    await supabase
      .from('training_plans')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    const actualWorkouts = plan.workouts.filter(
      (w) => w.workout_type !== 'rest' && w.workout_id
    );

    const { data: newPlan, error: planError } = await supabase
      .from('training_plans')
      .insert({
        user_id: userId,
        template_id: `ai_coach_${plan.methodology}`,
        name: plan.name,
        duration_weeks: plan.duration_weeks,
        methodology: plan.methodology,
        goal: plan.goal,
        status: 'active',
        start_date: plan.start_date,
        current_week: 1,
        workouts_completed: 0,
        workouts_total: actualWorkouts.length,
        compliance_percentage: 0,
      })
      .select()
      .single();

    if (planError) throw planError;

    let workoutsToInsert = plan.workouts.map((w) => ({
      plan_id: newPlan.id,
      user_id: userId,
      week_number: w.week_number,
      day_of_week: w.day_of_week,
      scheduled_date: w.scheduled_date,
      workout_type: w.workout_type || 'rest',
      workout_id: w.workout_id || null,
      name: w.name || w.workout_id || 'Workout',
      // Dual-write canonical (RSS) + legacy (TSS) load columns per CLAUDE.md.
      target_rss: w.target_rss ?? w.target_tss ?? null,
      target_tss: w.target_rss ?? w.target_tss ?? null,
      target_duration: w.duration_minutes || null,
      duration_minutes: w.duration_minutes || 0,
      completed: false,
    }));

    // Schedule-aware redistribution when the athlete has blocked days configured.
    let redistributionCount = 0;
    const weeklyAvailability = availability?.weeklyAvailability ?? [];
    const hasBlockedDays = weeklyAvailability.some((d) => d.status === 'blocked');

    if (hasBlockedDays) {
      const workoutsForRedistribution = workoutsToInsert
        .filter((w) => w.workout_id && w.workout_type !== 'rest')
        .map((w) => ({
          originalDate: w.scheduled_date,
          dayOfWeek: w.day_of_week,
          weekNumber: w.week_number,
          workoutId: w.workout_id,
          workoutType: w.workout_type,
          targetTSS: w.target_tss,
          targetDuration: w.target_duration,
        }));

      const redistributions = redistributeWorkouts(
        workoutsForRedistribution,
        weeklyAvailability,
        availability?.dateOverrides ?? [],
        {
          maxWorkoutsPerWeek: availability?.preferences?.maxWorkoutsPerWeek ?? null,
          preferWeekendLongRides: availability?.preferences?.preferWeekendLongRides ?? true,
        }
      );

      const movedDates = new Map();
      for (const r of redistributions) {
        if (r.originalDate !== r.newDate) {
          movedDates.set(r.originalDate + '|' + r.workoutId, r.newDate);
          redistributionCount++;
        }
      }

      if (movedDates.size > 0) {
        workoutsToInsert = workoutsToInsert.map((w) => {
          const key = w.scheduled_date + '|' + w.workout_id;
          const newDate = movedDates.get(key);
          if (newDate) {
            const newDateObj = new Date(newDate + 'T12:00:00');
            return { ...w, scheduled_date: newDate, day_of_week: newDateObj.getDay() };
          }
          return w;
        });
      }
    }

    const { error: workoutsError } = await supabase
      .from('planned_workouts')
      .insert(workoutsToInsert);

    if (workoutsError) throw workoutsError;

    return {
      success: true,
      planId: newPlan.id,
      planName: plan.name,
      workoutCount: actualWorkouts.length,
      redistributionCount,
    };
  } catch (err) {
    console.error('activateTrainingPlan failed', err);
    return { success: false, error: err.message || 'Failed to activate training plan' };
  }
}
