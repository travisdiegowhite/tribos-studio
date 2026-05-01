/**
 * Route Ranker — v1
 *
 * Scores a user's saved routes against a planned workout and returns the
 * top 3 suggestions for the Today view.
 *
 * Kept in a single utility so the algorithm can be swapped for a learned
 * model later. Deliberately deterministic — does not consume
 * user_route_preferences or route_context_history yet.
 *
 * Scoring:
 *   +10  goal match  (workout_type → training_goal mapping)
 *    0–5 distance proximity (closer to target_duration × 25 km/h gets more)
 *   +1   recency boost (used in last 30 days)
 */

const WORKOUT_TYPE_TO_GOAL = {
  endurance: 'endurance',
  recovery: 'recovery',
  threshold: 'intervals',
  tempo: 'intervals',
  vo2max: 'intervals',
  sweet_spot: 'intervals',
  anaerobic: 'intervals',
  climbing: 'hills',
};

const ESTIMATED_SPEED_KMH = 25;

/**
 * Map a planned workout type → preferred route training_goal.
 * Returns null when there's no clear preference.
 */
export function workoutTypeToGoal(workoutType) {
  if (!workoutType) return null;
  return WORKOUT_TYPE_TO_GOAL[workoutType.toLowerCase()] || null;
}

/**
 * Score a single route against a workout. Pure function for testability.
 *
 * @param {object} route — row from `routes`
 * @param {object} ctx
 * @param {string|null} ctx.preferredGoal — derived from workout_type
 * @param {number|null} ctx.targetDurationMinutes
 * @param {boolean} ctx.climbFlagged — true if workout type is climbing-flagged
 * @param {Set<string>} ctx.recentlyUsedIds — route IDs used in last 30 days
 */
export function scoreRoute(route, ctx) {
  let score = 0;
  const reasons = [];

  if (ctx.climbFlagged && route.training_goal === 'hills') {
    score += 10;
    reasons.push('matches climbing focus');
  } else if (ctx.preferredGoal && route.training_goal === ctx.preferredGoal) {
    score += 10;
    reasons.push(`matches ${ctx.preferredGoal} goal`);
  }

  if (ctx.targetDurationMinutes && route.distance_km) {
    const targetKm = (ctx.targetDurationMinutes / 60) * ESTIMATED_SPEED_KMH;
    const deltaKm = Math.abs(route.distance_km - targetKm);
    // Award up to +5 inversely proportional to delta. 0 km off = +5, 25 km off = 0.
    const proximity = Math.max(0, 5 - deltaKm / 5);
    score += proximity;
    if (proximity > 2) reasons.push('distance close to plan');
  }

  if (ctx.recentlyUsedIds.has(route.id)) {
    score += 1;
    reasons.push('used recently');
  }

  return { score, reasons };
}

/**
 * Rank a user's routes against today's planned workout. Returns the top
 * `limit` routes (default 3).
 *
 * @param {Array<object>} routes — rows from `routes`
 * @param {object|null} workout — row from `planned_workouts` (or null/{} for no workout)
 * @param {Set<string>} recentlyUsedIds
 * @param {number} [limit=3]
 */
export function rankRoutes(routes, workout, recentlyUsedIds, limit = 3) {
  const workoutType = workout?.workout_type || null;
  const climbFlagged = workoutType === 'climbing' || /climb|hill/i.test(workout?.name || '');
  const preferredGoal = workoutTypeToGoal(workoutType);
  const targetDurationMinutes = workout?.duration_minutes || workout?.target_duration || null;

  const ctx = { preferredGoal, targetDurationMinutes, climbFlagged, recentlyUsedIds };

  return routes
    .map((r) => ({ route: r, ...scoreRoute(r, ctx) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
