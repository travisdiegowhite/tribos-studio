/**
 * COROS activity data building and type mapping
 * Pure functions - no external dependencies
 */

/**
 * Map COROS workout type (mode/subMode) to standard format (Strava-compatible)
 */
export function mapCorosWorkoutType(mode, subMode) {
  const key = `${mode}_${subMode}`;
  const typeMap = {
    // Cycling activities
    '9_1': 'Ride',            // Outdoor Bike
    '9_2': 'VirtualRide',     // Indoor Bike
    '9_3': 'EBikeRide',       // E-Bike
    '9_4': 'MountainBikeRide', // Mountain Bike
    '9_5': 'EBikeRide',       // E-Mountain Bike
    '9_6': 'GravelRide',      // Gravel Bike

    // Running activities
    '8_1': 'Run',             // Outdoor Run
    '8_2': 'Run',             // Indoor Run
    '15_1': 'TrailRun',       // Trail Run
    '20_1': 'Run',            // Track Run

    // Swimming
    '10_1': 'Swim',           // Open Water
    '10_2': 'Swim',           // Pool Swim

    // Multi-sport
    '13_1': 'Workout',        // Triathlon
    '13_2': 'Workout',        // Multisport
    '13_3': 'BackcountrySki', // Ski Touring
    '13_4': 'Workout',        // Outdoor Climb

    // Hiking / Walking
    '14_1': 'Hike',           // Mountain Climb
    '16_1': 'Hike',           // Hike
    '31_1': 'Walk',           // Walk

    // Winter sports
    '19_1': 'NordicSki',      // XC Ski
    '21_1': 'AlpineSki',      // Ski
    '21_2': 'Snowboard',      // Snowboard
    '29_1': 'BackcountrySki', // Ski Touring

    // Cardio / Gym
    '18_1': 'Workout',        // GPS Cardio
    '18_2': 'Workout',        // Gym Cardio
    '23_2': 'WeightTraining', // Strength
    '34_2': 'Workout',        // Jump Rope
    '41_2': 'Elliptical',     // Elliptical
    '42_2': 'Yoga',           // Yoga
    '43_2': 'Workout',        // Pilates
    '44_2': 'Workout',        // Boxing

    // Water sports
    '24_1': 'Rowing',         // Rowing
    '24_2': 'Rowing',         // Indoor Rower
    '25_1': 'Kayaking',       // Whitewater
    '26_1': 'Kayaking',       // Flatwater
    '27_1': 'Surfing',        // Windsurfing
    '28_1': 'Surfing',        // Speedsurfing

    // Ball sports
    '36_2': 'Workout',        // Badminton
    '37_2': 'Workout',        // Table Tennis
    '38_1': 'Workout',        // Basketball
    '39_1': 'Workout',        // Soccer
    '40_1': 'Workout',        // Pickleball
    '47_1': 'Workout',        // Tennis

    // Aviation
    '22_1': 'Workout',        // Pilot

    // Climbing
    '33_2': 'Workout',        // Single-Pitch
    '33_3': 'Workout',        // Bouldering

    // Fishing
    '32_2': 'Workout',        // Shore fishing
    '32_4': 'Kayaking',       // Kayak fishing

    // Other
    '45_1': 'Workout',        // Frisbee
    '46_1': 'Workout',        // Skateboard
    '98_1': 'Workout',        // Custom sport outdoor
    '99_2': 'Workout',        // Custom sport indoor
  };

  return typeMap[key] || 'Workout';
}

/**
 * Check if a COROS workout type is an indoor activity
 */
export function isIndoorCorosActivity(mode, subMode) {
  const indoorTypes = new Set([
    '8_2',   // Indoor Run
    '9_2',   // Indoor Bike
    '10_2',  // Pool Swim
    '18_2',  // Gym Cardio
    '23_2',  // Strength
    '24_2',  // Indoor Rower
    '34_2',  // Jump Rope
    '41_2',  // Elliptical
    '42_2',  // Yoga
    '43_2',  // Pilates
    '44_2',  // Boxing
    '36_2',  // Badminton
    '37_2',  // Table Tennis
    '99_2',  // Custom sport indoor
  ]);
  return indoorTypes.has(`${mode}_${subMode}`);
}

/**
 * Get human-readable workout type name from COROS mode/subMode
 */
function getWorkoutTypeName(mode, subMode) {
  const key = `${mode}_${subMode}`;
  const nameMap = {
    '8_1': 'Run', '8_2': 'Indoor Run',
    '9_1': 'Ride', '9_2': 'Indoor Ride', '9_3': 'E-Bike Ride',
    '9_4': 'Mountain Bike Ride', '9_5': 'E-Mountain Bike Ride', '9_6': 'Gravel Ride',
    '10_1': 'Open Water Swim', '10_2': 'Pool Swim',
    '13_1': 'Triathlon', '13_2': 'Multisport',
    '14_1': 'Mountain Climb', '15_1': 'Trail Run', '16_1': 'Hike',
    '18_1': 'GPS Cardio', '18_2': 'Gym Cardio',
    '19_1': 'XC Ski', '20_1': 'Track Run',
    '21_1': 'Ski', '21_2': 'Snowboard',
    '23_2': 'Strength Training', '24_1': 'Row', '24_2': 'Indoor Row',
    '29_1': 'Ski Touring', '31_1': 'Walk',
    '38_1': 'Basketball', '39_1': 'Soccer', '40_1': 'Pickleball', '47_1': 'Tennis',
    '42_2': 'Yoga', '43_2': 'Pilates', '44_2': 'Boxing',
    '34_2': 'Jump Rope', '41_2': 'Elliptical',
  };
  return nameMap[key] || 'Workout';
}

/**
 * Generate a descriptive activity name from COROS workout data
 */
export function generateCorosActivityName(mode, subMode, startTime) {
  const date = startTime ? new Date(startTime * 1000) : new Date();
  const timeOfDay = date.getHours() < 12 ? 'Morning' :
                    date.getHours() < 17 ? 'Afternoon' : 'Evening';
  const typeName = getWorkoutTypeName(mode, subMode);
  return `${timeOfDay} ${typeName}`;
}

/**
 * Convert COROS 15-minute timezone system to UTC offset in seconds
 * COROS timezone: value * 15 minutes = UTC offset
 * e.g., 32 = UTC+08:00 (32 * 15 = 480 minutes = 8 hours)
 */
export function corosTimezoneToOffsetSeconds(timezoneValue) {
  if (timezoneValue == null) return 0;
  return timezoneValue * 15 * 60; // Convert to seconds
}

/**
 * Build activity data object for storage in the activities table.
 * Converts COROS field formats to the tribos standard schema.
 */
export function buildCorosActivityData(userId, workout, source = 'webhook') {
  const mode = workout.mode;
  const subMode = workout.subMode;
  const startTimezoneOffsetSeconds = corosTimezoneToOffsetSeconds(workout.startTimezone);

  // Convert avgSpeed from sec/km (pace) to m/s
  // avgSpeed in COROS = seconds per kilometer
  let averageSpeedMps = null;
  if (workout.avgSpeed && workout.avgSpeed > 0) {
    averageSpeedMps = 1000 / workout.avgSpeed;
  }

  const elapsedTime = (workout.endTime && workout.startTime)
    ? workout.endTime - workout.startTime
    : (workout.duration || null);

  return {
    user_id: userId,
    provider: 'coros',
    provider_activity_id: workout.labelId,
    name: generateCorosActivityName(mode, subMode, workout.startTime),
    type: mapCorosWorkoutType(mode, subMode),
    sport_type: `coros_${mode}_${subMode}`,
    start_date: workout.startTime
      ? new Date(workout.startTime * 1000).toISOString()
      : new Date().toISOString(),
    start_date_local: workout.startTime
      ? new Date((workout.startTime + startTimezoneOffsetSeconds) * 1000).toISOString()
      : new Date().toISOString(),
    // Distance (COROS sends in meters)
    distance: workout.distance ?? null,
    // Duration
    moving_time: workout.duration ?? elapsedTime,
    elapsed_time: elapsedTime,
    // Speed (converted from sec/km to m/s)
    average_speed: averageSpeedMps,
    // Cadence (COROS: step/min or RPM depending on activity)
    average_cadence: workout.avgFrequency ?? null,
    // Steps
    steps: workout.step ?? null,
    // Calories (COROS sends in calories, convert to kcal)
    calories: workout.calorie ? Math.round(workout.calorie / 1000) : null,
    // Training flags
    trainer: isIndoorCorosActivity(mode, subMode),
    // Device info
    device_name: workout.deviceName || 'COROS',
    // Store ALL original data so nothing is lost
    raw_data: workout,
    imported_from: source,
    updated_at: new Date().toISOString()
  };
}
