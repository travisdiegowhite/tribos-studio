/**
 * workoutRouteHref — build the "create a route for this workout" destination.
 *
 * Routes to the canonical builder at `/ride/new` (RB2), passing the query
 * contract RB2 reads (`workoutId`, `duration`, `distance`). Pure + testable;
 * the caller supplies the already-formatted scheduled date.
 */

export interface WorkoutRouteSource {
  workout_type?: string | null;
  workout_id?: string | null;
  name?: string | null;
  target_duration?: number | null;
  target_distance_km?: number | null;
}

export function buildWorkoutRouteHref(
  workout: WorkoutRouteSource,
  scheduledDate: string,
): string {
  const workoutType = workout.workout_type || 'endurance';
  const duration = String(workout.target_duration || 60);

  const params = new URLSearchParams({
    from: 'calendar',
    goal: workoutType,
    duration,
    scheduledDate,
  });
  if (workout.workout_id) params.set('workoutId', workout.workout_id);
  if (workout.target_distance_km) params.set('distance', String(workout.target_distance_km));
  if (workout.name) params.set('workoutName', workout.name);
  return `/ride/new?${params.toString()}`;
}
