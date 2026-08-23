/**
 * Is this planned session a "quality" session — one whose training value is
 * lost if it is moved, shortened, or ridden fatigued?
 *
 * WHY THIS IS DERIVED RATHER THAN READ
 * ------------------------------------
 * `planned_workouts.is_quality` was added by migration 058 as
 * `NOT NULL DEFAULT false` and **no code has ever written it**. Every row in
 * production is therefore `false`, which silently disabled every consumer:
 *
 *   - api/deviation-resolve.js  `upcoming.find(w => w.is_quality === true)`
 *   - api/check-in-apply.js     `'next_quality'` target resolution
 *   - api/process-deviation.js / api/training-load-projection.js, which feed
 *     `src/lib/training/deviation-detection.ts:64` — its
 *     `findIndex(d => d.is_quality)` always returned -1, so the whole
 *     "protect the next hard session" branch never ran.
 *
 * The coach therefore always fell through to `upcoming[0]` and protected
 * whatever happened to be next, including a recovery spin.
 *
 * Deriving from `workout_type` needs no backfill, cannot drift out of date,
 * and is correct for rows written by every generator.
 *
 * Keep this set in sync with HARD_TYPES in
 * src/views/today-spine/beats/buildBeats.ts:55, which drives the Today spine's
 * "planned-hard" styling. `tempo` is deliberately excluded from both.
 */

const QUALITY_WORKOUT_TYPES = new Set([
  'threshold',
  'sweet_spot',
  'vo2max',
  'anaerobic',
  'intervals',
  'sprint',
  'race',
  'racing',
  'race_sim',
]);

/**
 * @param {{workout_type?: string|null, session_type?: string|null}|null} workout
 * @returns {boolean}
 */
export function isQualityWorkout(workout) {
  if (!workout) return false;
  const type = workout.workout_type || workout.session_type;
  return !!type && QUALITY_WORKOUT_TYPES.has(String(type).toLowerCase());
}

export { QUALITY_WORKOUT_TYPES };
