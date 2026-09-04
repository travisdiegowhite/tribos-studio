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

/**
 * True when a webhook item is a bare FIT-file ping: it carries a callbackURL
 * but none of the distance/duration fields a summary would have.
 *
 * Garmin normally delivers an activity twice — a CONNECT_ACTIVITY summary and
 * an ACTIVITY_FILE_DATA ping pointing at the FIT file. Sometimes only the ping
 * arrives (2026-09-03: a 116 km ride whose summary never came). The ping has
 * the name, type and start time but no metrics, so running
 * `hasMinimumActivityMetrics` on it reads 0 m / 0 s and rejects a real ride
 * as "too short". Callers use this to download the FIT first and take the
 * summary from its session message instead.
 */
export function isFitPingWithoutMetrics(item, fileUrl = item?.callbackURL) {
  if (!item || typeof fileUrl !== 'string' || !fileUrl) return false;
  const hasDuration = [item.durationInSeconds, item.movingDurationInSeconds, item.elapsedDurationInSeconds]
    .some((v) => typeof v === 'number' && v > 0);
  const hasDistance = [item.distanceInMeters, item.distance]
    .some((v) => typeof v === 'number' && v > 0);
  return !hasDuration && !hasDistance;
}

/**
 * Fill a FIT-ping item with the summary fields from the parsed FIT session so
 * it looks like the CONNECT_ACTIVITY summary Garmin did not send. Values the
 * ping already carries win; the FIT only fills gaps. Field names are the
 * Garmin camelCase names `buildActivityData` and `hasMinimumActivityMetrics`
 * read. Returns a new object; never mutates the input.
 *
 * @param {object} item - the ACTIVITY_FILE_DATA item (callbackURL, name, type, start)
 * @param {object|null} fitSummary - `summary` from parseFitBuffer / extractSummary
 */
export function activityInfoFromFitSummary(item, fitSummary) {
  const base = { ...(item || {}) };
  if (!fitSummary) return base;

  const positive = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const fill = (key, value) => {
    if (base[key] == null && value != null) base[key] = value;
  };

  // FIT session timers are fractional seconds (e.g. 4804.834); Garmin's own
  // summary sends whole seconds and activities.moving_time / elapsed_time are
  // INTEGER columns, so a fractional value fails the insert.
  const wholeSeconds = (v) => {
    const p = positive(v);
    return p == null ? null : Math.round(p);
  };
  const elapsed = wholeSeconds(fitSummary.totalElapsedTime) ?? wholeSeconds(fitSummary.totalTime);
  const moving = wholeSeconds(fitSummary.totalTime) ?? elapsed;

  fill('distanceInMeters', positive(fitSummary.totalDistance));
  fill('durationInSeconds', elapsed);
  fill('elapsedDurationInSeconds', elapsed);
  fill('movingDurationInSeconds', moving);
  fill('totalElevationGainInMeters', positive(fitSummary.totalAscent));
  fill('averageSpeedInMetersPerSecond', positive(fitSummary.avgSpeed));
  fill('maxSpeedInMetersPerSecond', positive(fitSummary.maxSpeed));
  // Sport-neutral names: the builder reads averagePower / avgCadence for
  // cycling and running alike, so a FIT run does not get a "biking" field.
  fill('averagePower', positive(fitSummary.avgPower));
  fill('averageHeartRateInBeatsPerMinute', positive(fitSummary.avgHeartRate));
  fill('maxHeartRateInBeatsPerMinute', positive(fitSummary.maxHeartRate));
  fill('avgCadence', positive(fitSummary.avgCadence));

  if (base.startTimeInSeconds == null && typeof fitSummary.startTime === 'string') {
    const ms = Date.parse(fitSummary.startTime);
    if (Number.isFinite(ms)) base.startTimeInSeconds = Math.floor(ms / 1000);
  }

  base.summarySource = 'fit_session';
  return base;
}
