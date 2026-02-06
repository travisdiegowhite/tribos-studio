/**
 * Garmin activity filtering logic
 * Pure functions - no external dependencies
 */

/**
 * Check if an activity type should be filtered out (health/monitoring data, not real workouts)
 * Returns true if the activity should be SKIPPED as an activity import
 */
export function shouldFilterActivityType(garminType) {
  const lowerType = (garminType || '').toLowerCase();

  const healthMonitoringTypes = [
    'sedentary',           // Sitting/inactive periods
    'sleep',               // Sleep tracking
    'uncategorized',       // Generic monitoring data
    'generic',             // Non-specific activity
    'all_day_tracking',    // 24/7 monitoring
    'monitoring',          // Device monitoring
    'daily_summary',       // Daily health summary
    'respiration',         // Breathing exercises
    'breathwork',          // Breathing exercises
    'meditation',          // Mental wellness
    'nap',                 // Short sleep
  ];

  return healthMonitoringTypes.includes(lowerType);
}

/**
 * Check if a Garmin activity type is an indoor/trainer activity
 */
export function isIndoorActivityType(garminType) {
  const lowerType = (garminType || '').toLowerCase();
  const indoorTypes = [
    'indoor_cycling', 'virtual_ride', 'indoor_running', 'treadmill_running',
    'indoor_walking', 'treadmill_walking', 'indoor_rowing', 'lap_swimming',
    'indoor_cardio', 'elliptical', 'stair_climbing', 'indoor_climbing',
  ];
  return indoorTypes.includes(lowerType);
}

/**
 * Check if activity has minimum metrics to be considered a real workout
 * Filters out trivial auto-detected movements
 */
export function hasMinimumActivityMetrics(activityInfo) {
  const durationSeconds = activityInfo.durationInSeconds ||
                          activityInfo.movingDurationInSeconds ||
                          activityInfo.elapsedDurationInSeconds || 0;
  const distanceMeters = activityInfo.distanceInMeters || activityInfo.distance || 0;

  const MIN_DURATION_SECONDS = 120; // 2 minutes
  const MIN_DISTANCE_METERS = 100;  // 100 meters

  return durationSeconds >= MIN_DURATION_SECONDS || distanceMeters >= MIN_DISTANCE_METERS;
}
