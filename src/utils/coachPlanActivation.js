import { redistributeWorkouts } from './trainingPlans';
import { insertSessions } from '../lib/calendar/calendarMutations';

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
    // Retire existing active plans so only the new one is active. Their
    // calendar rows are deliberately left alone — see the note in
    // api/coach.js. The one thing that WAS missing here is an error check.
    // 'completed' is constraint-mandated — see the note in api/coach.js.
    const { error: retireError } = await supabase
      .from('training_plans')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');
    if (retireError) {
      return { success: false, error: `Could not retire the previous plan: ${retireError.message}` };
    }

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

    // Calendar entry drafts. The calendar has one load column, so the
    // canonical/legacy dual-write the old table needed does not arise; readers
    // still see both names via the adapter. week_number and day_of_week are
    // dropped — both were derived from the plan's start date, and the calendar
    // derives them from the date itself. `weekNumber` is kept on the
    // redistribution input below, which is a pure function that needs it.
    let workoutsToInsert = plan.workouts.map((w) => ({
      date: w.scheduled_date,
      type: (w.workout_type || 'rest') === 'rest' ? 'rest' : 'workout',
      title: w.name || w.workout_id || 'Workout',
      workout_id: w.workout_id || null,
      workout_type: w.workout_type || 'rest',
      target_load: w.target_rss ?? w.target_tss ?? null,
      target_duration_min: w.duration_minutes || null,
      _weekNumber: w.week_number,
      _dayOfWeek: w.day_of_week,
    }));

    // Schedule-aware redistribution when the athlete has blocked days configured.
    let redistributionCount = 0;
    const weeklyAvailability = availability?.weeklyAvailability ?? [];
    const hasBlockedDays = weeklyAvailability.some((d) => d.status === 'blocked');

    if (hasBlockedDays) {
      const workoutsForRedistribution = workoutsToInsert
        .filter((w) => w.workout_id && w.workout_type !== 'rest')
        .map((w) => ({
          originalDate: w.date,
          dayOfWeek: w._dayOfWeek,
          weekNumber: w._weekNumber,
          workoutId: w.workout_id,
          workoutType: w.workout_type,
          targetTSS: w.target_load,
          targetDuration: w.target_duration_min,
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
          const newDate = movedDates.get(w.date + '|' + w.workout_id);
          return newDate ? { ...w, date: newDate } : w;
        });
      }
    }

    // Strip the scratch fields the redistributor needed; they are not columns.
    const drafts = workoutsToInsert.map(({ _weekNumber, _dayOfWeek, ...draft }) => draft);

    // Days the athlete has already filled are skipped, not overwritten, so
    // activating a plan cannot bury a race or a session they scheduled.
    const written = await insertSessions(userId, drafts, {
      source: 'coach',
      planId: newPlan.id,
    });
    if (!written.success) throw new Error(written.error);

    return {
      success: true,
      planId: newPlan.id,
      planName: plan.name,
      // What actually landed, not what was attempted.
      workoutCount: written.data.inserted,
      skippedCount: written.data.skipped,
      redistributionCount,
    };
  } catch (err) {
    console.error('activateTrainingPlan failed', err);
    return { success: false, error: err.message || 'Failed to activate training plan' };
  }
}
