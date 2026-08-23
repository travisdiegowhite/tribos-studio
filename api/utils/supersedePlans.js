/**
 * Retire the athlete's prior active plans when a new one is activated.
 *
 * WHY DETACH RATHER THAN DELETE
 * -----------------------------
 * The original code deleted every future `planned_workouts` row belonging to
 * the prior plans. Two things were wrong with that. First, the delete's result
 * was never checked, so when it silently did nothing (2026-08-22) the athlete
 * ended up with two plans' sessions stacked on every day from Aug 21 to Sep 25
 * and no error anywhere. Second — and worse — when it *did* work it destroyed
 * sessions the athlete had hand-moved or the coach had adjusted, because a row
 * does not stop being true just because the plan that seeded it retired.
 *
 * So: plans SEED the calendar, the calendar OWNS the rows. Retiring a plan
 * therefore
 *   1. deletes only untouched machine fill (nobody will miss generated rows
 *      nobody has looked at),
 *   2. detaches everything else the athlete or coach touched by setting
 *      `plan_id = NULL` — it stays on the calendar, now plan-free,
 *   3. leaves completed and past rows attached so history keeps its provenance,
 *   4. marks the plan `superseded`, distinguishing "we replaced it" from the
 *      `completed` an athlete earns by finishing.
 *
 * Every statement's `{ error, count }` is checked and surfaced. The previous
 * fire-and-forget style is what let a total no-op reach production unnoticed.
 *
 * Safe to run before the `(user_id, scheduled_date, slot)` migration: detached
 * rows carry `plan_id = NULL`, and Postgres treats NULLs as distinct, so they
 * cannot collide on `unique_plan_scheduled_date`.
 *
 * SHARED BY BOTH RUNTIMES. This module is deliberately dependency-free and takes
 * the Supabase client as a parameter, so the browser twin
 * (src/utils/coachPlanActivation.js) can import it directly rather than keeping
 * a second copy that drifts. Do not import supabaseAdmin or any node-only
 * module here — that would pull the service-role client into the client bundle.
 */

/** Columns whose presence proves a human or the coach has touched the row. */
const TOUCH_MARKERS = [
  'activity_id',
  'original_scheduled_date',
  'original_workout_id',
  'adjustment_reason',
];

/** `source` values that identify rows a generator produced wholesale. */
const MACHINE_SOURCES = ['arc', 'coach_static'];

/**
 * @param {object} supabase - Supabase client (admin singleton server-side).
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.fromDate - YYYY-MM-DD; rows on/after this date are in scope.
 * @param {string[]} [args.planIds] - Plans to retire. Omit to retire every
 *   active plan for the user.
 * @param {string[]} [args.exceptPlanIds] - Plans to leave alone (e.g. the one
 *   being created, when it already exists).
 * @returns {Promise<{success: boolean, planIds: string[], deleted: number,
 *   detached: number, error?: string}>}
 */
export async function supersedePriorPlans(supabase, { userId, fromDate, planIds, exceptPlanIds = [] }) {
  if (!userId) return { success: false, planIds: [], deleted: 0, detached: 0, error: 'Missing user' };
  if (!fromDate) return { success: false, planIds: [], deleted: 0, detached: 0, error: 'Missing fromDate' };

  let ids = planIds;
  if (!ids) {
    const { data, error } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) {
      return { success: false, planIds: [], deleted: 0, detached: 0, error: error.message };
    }
    ids = (data || []).map((p) => p.id);
  }
  ids = ids.filter((id) => id && !exceptPlanIds.includes(id));

  if (ids.length === 0) {
    return { success: true, planIds: [], deleted: 0, detached: 0 };
  }

  // 1. Delete untouched machine fill. Scoped by user_id as well as plan_id so a
  //    stale plan id can never reach another athlete's calendar.
  let del = supabase
    .from('planned_workouts')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .in('plan_id', ids)
    .gte('scheduled_date', fromDate)
    .in('source', MACHINE_SOURCES)
    .or('completed.is.null,completed.eq.false');
  for (const col of TOUCH_MARKERS) del = del.is(col, null);

  const { error: delError, count: deleted } = await del;
  if (delError) {
    return { success: false, planIds: ids, deleted: 0, detached: 0, error: delError.message };
  }

  // 2. Detach whatever survived — athlete edits, manual adds, coach
  //    adjustments, anything already linked to an activity. `source` is
  //    backfilled to 'manual' so the arc refill's "don't touch rows I didn't
  //    generate" guard (api/utils/arcRefill.js) recognises them deliberately
  //    rather than by their NULL happening to fail an equality test.
  const { error: detachError, count: detached } = await supabase
    .from('planned_workouts')
    .update({ plan_id: null, source: 'manual' }, { count: 'exact' })
    .eq('user_id', userId)
    .in('plan_id', ids)
    .gte('scheduled_date', fromDate)
    .or('completed.is.null,completed.eq.false');
  if (detachError) {
    return { success: false, planIds: ids, deleted: deleted ?? 0, detached: 0, error: detachError.message };
  }

  // 3. Past and completed rows keep their plan_id — history stays attributable.

  // 4. Mark the plans superseded. `training_plans.status` is bare TEXT with no
  //    CHECK constraint (009_training_plans.sql), so this needs no migration.
  const { error: planError } = await supabase
    .from('training_plans')
    .update({ status: 'superseded', ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids);
  if (planError) {
    return {
      success: false,
      planIds: ids,
      deleted: deleted ?? 0,
      detached: detached ?? 0,
      error: planError.message,
    };
  }

  return { success: true, planIds: ids, deleted: deleted ?? 0, detached: detached ?? 0 };
}
