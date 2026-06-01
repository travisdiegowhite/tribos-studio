/**
 * workoutRouteHref — build the "create a route for this workout" destination.
 *
 * Routes to Route Builder 2.0 (`/route-builder-2`) when the user is in the v2
 * cohort, otherwise to the legacy v1 builder (`/routes/new`) with the exact
 * query contract v1 already reads (RouteBuilder.jsx). Pure + testable; the
 * caller supplies the already-formatted scheduled date and the access flag.
 */

export interface WorkoutRouteSource {
  workout_type?: string | null;
  workout_id?: string | null;
  name?: string | null;
  target_duration?: number | null;
  target_distance_km?: number | null;
}

/** v1 RouteBuilder's trainingGoal vocabulary. */
const WORKOUT_TYPE_TO_V1_GOAL: Record<string, string> = {
  endurance: 'endurance',
  tempo: 'endurance',
  threshold: 'intervals',
  vo2max: 'intervals',
  anaerobic: 'intervals',
  recovery: 'recovery',
  climbing: 'hills',
  racing: 'endurance',
};

export function buildWorkoutRouteHref(
  workout: WorkoutRouteSource,
  scheduledDate: string,
  hasV2Access: boolean,
): string {
  const workoutType = workout.workout_type || 'endurance';
  const duration = String(workout.target_duration || 60);

  if (hasV2Access) {
    const params = new URLSearchParams({
      from: 'calendar',
      goal: workoutType,
      duration,
      scheduledDate,
    });
    if (workout.workout_id) params.set('workoutId', workout.workout_id);
    if (workout.target_distance_km) params.set('distance', String(workout.target_distance_km));
    if (workout.name) params.set('workoutName', workout.name);
    return `/route-builder-2?${params.toString()}`;
  }

  // Legacy v1 contract (unchanged).
  const params = new URLSearchParams({
    from: 'calendar',
    workoutType,
    trainingGoal: WORKOUT_TYPE_TO_V1_GOAL[workoutType] || 'endurance',
    duration,
    scheduledDate,
  });
  if (workout.workout_id) params.set('workoutId', workout.workout_id);
  if (workout.target_distance_km) params.set('distance', String(workout.target_distance_km));
  if (workout.name) params.set('workoutName', workout.name);
  return `/routes/new?${params.toString()}`;
}
