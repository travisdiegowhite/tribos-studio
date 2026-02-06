/**
 * Garmin activity data building and type mapping
 * Pure functions - no external dependencies except activityFilters
 */

import { isIndoorActivityType } from './activityFilters.js';

/**
 * Map Garmin activity type to standard format (Strava-compatible)
 */
export function mapGarminActivityType(garminType) {
  const typeMap = {
    // Cycling activities
    'cycling': 'Ride',
    'road_biking': 'Ride',
    'road_cycling': 'Ride',
    'virtual_ride': 'VirtualRide',
    'indoor_cycling': 'VirtualRide',
    'mountain_biking': 'MountainBikeRide',
    'gravel_cycling': 'GravelRide',
    'cyclocross': 'Ride',
    'e_biking': 'EBikeRide',
    'bmx': 'Ride',
    'recumbent_cycling': 'Ride',
    'track_cycling': 'Ride',

    // Running activities
    'running': 'Run',
    'trail_running': 'TrailRun',
    'treadmill_running': 'Run',
    'indoor_running': 'Run',
    'track_running': 'Run',
    'ultra_run': 'Run',

    // Walking activities
    'walking': 'Walk',
    'casual_walking': 'Walk',
    'speed_walking': 'Walk',
    'indoor_walking': 'Walk',
    'treadmill_walking': 'Walk',

    // Hiking
    'hiking': 'Hike',

    // Swimming
    'swimming': 'Swim',
    'lap_swimming': 'Swim',
    'open_water_swimming': 'Swim',
    'pool_swimming': 'Swim',

    // Other sports
    'strength_training': 'WeightTraining',
    'cardio': 'Workout',
    'elliptical': 'Elliptical',
    'stair_climbing': 'StairStepper',
    'rowing': 'Rowing',
    'indoor_rowing': 'Rowing',
    'yoga': 'Yoga',
    'pilates': 'Workout',
    'fitness_equipment': 'Workout',

    // Winter sports
    'resort_skiing': 'AlpineSki',
    'resort_snowboarding': 'Snowboard',
    'cross_country_skiing': 'NordicSki',
    'backcountry_skiing': 'BackcountrySki',

    // Water sports
    'stand_up_paddleboarding': 'StandUpPaddling',
    'kayaking': 'Kayaking',
    'surfing': 'Surfing',

    // Multi-sport
    'multi_sport': 'Workout',
    'triathlon': 'Workout',
    'duathlon': 'Workout',
    'transition': 'Workout'
  };

  const lowerType = (garminType || '').toLowerCase().replace(/ /g, '_');
  return typeMap[lowerType] || 'Workout';
}

/**
 * Generate a descriptive activity name if Garmin doesn't provide one
 */
export function generateActivityName(activityType, startTimeInSeconds) {
  const date = startTimeInSeconds
    ? new Date(startTimeInSeconds * 1000)
    : new Date();

  const timeOfDay = date.getHours() < 12 ? 'Morning' :
                    date.getHours() < 17 ? 'Afternoon' : 'Evening';

  const typeNames = {
    'cycling': 'Ride',
    'road_biking': 'Road Ride',
    'road_cycling': 'Road Ride',
    'mountain_biking': 'Mountain Bike Ride',
    'gravel_cycling': 'Gravel Ride',
    'indoor_cycling': 'Indoor Ride',
    'virtual_ride': 'Virtual Ride',
    'e_biking': 'E-Bike Ride',
    'bmx': 'BMX Ride',
    'recumbent_cycling': 'Recumbent Ride',
    'track_cycling': 'Track Ride',
    'cyclocross': 'Cyclocross Ride',
    'running': 'Run',
    'trail_running': 'Trail Run',
    'treadmill_running': 'Treadmill Run',
    'indoor_running': 'Indoor Run',
    'track_running': 'Track Run',
    'ultra_run': 'Ultra Run',
    'walking': 'Walk',
    'casual_walking': 'Walk',
    'speed_walking': 'Speed Walk',
    'indoor_walking': 'Indoor Walk',
    'treadmill_walking': 'Treadmill Walk',
    'hiking': 'Hike',
    'swimming': 'Swim',
    'lap_swimming': 'Lap Swim',
    'open_water_swimming': 'Open Water Swim',
    'pool_swimming': 'Pool Swim',
    'strength_training': 'Strength Training',
    'cardio': 'Cardio Workout',
    'elliptical': 'Elliptical',
    'stair_climbing': 'Stair Climbing',
    'rowing': 'Row',
    'indoor_rowing': 'Indoor Row',
    'yoga': 'Yoga',
    'pilates': 'Pilates',
    'fitness_equipment': 'Workout',
    'resort_skiing': 'Ski',
    'resort_snowboarding': 'Snowboard',
    'cross_country_skiing': 'Nordic Ski',
    'backcountry_skiing': 'Backcountry Ski',
    'stand_up_paddleboarding': 'Paddleboard',
    'kayaking': 'Kayak',
    'surfing': 'Surf',
    'multi_sport': 'Workout',
    'triathlon': 'Triathlon',
    'duathlon': 'Duathlon',
    'transition': 'Transition'
  };

  const activityName = typeNames[(activityType || '').toLowerCase()] || 'Workout';
  return `${timeOfDay} ${activityName}`;
}

/**
 * Build activity data object with only columns that exist in the schema.
 * Centralizes all Garmin field name variations into one place.
 */
export function buildActivityData(userId, activityId, activityInfo, source = 'webhook') {
  return {
    user_id: userId,
    provider: 'garmin',
    provider_activity_id: activityId,
    name: activityInfo.activityName ||
          activityInfo.activityDescription ||
          generateActivityName(activityInfo.activityType, activityInfo.startTimeInSeconds),
    type: mapGarminActivityType(activityInfo.activityType),
    sport_type: activityInfo.activityType || null,
    start_date: activityInfo.startTimeInSeconds
      ? new Date(activityInfo.startTimeInSeconds * 1000).toISOString()
      : new Date().toISOString(),
    start_date_local: activityInfo.startTimeInSeconds
      ? new Date((activityInfo.startTimeInSeconds + (activityInfo.startTimeOffsetInSeconds || 0)) * 1000).toISOString()
      : new Date().toISOString(),
    // Distance (Garmin sends in meters)
    distance: activityInfo.distanceInMeters ?? activityInfo.distance ?? null,
    // Duration (Garmin sends in seconds)
    moving_time: activityInfo.movingDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
    elapsed_time: activityInfo.elapsedDurationInSeconds ?? activityInfo.durationInSeconds ?? activityInfo.duration ?? null,
    // Elevation (multiple possible field names from Garmin)
    total_elevation_gain: activityInfo.elevationGainInMeters
      ?? activityInfo.totalElevationGainInMeters
      ?? activityInfo.totalElevationGain
      ?? activityInfo.total_ascent
      ?? null,
    // Speed (m/s)
    average_speed: activityInfo.averageSpeedInMetersPerSecond ?? activityInfo.averageSpeed ?? activityInfo.avg_speed ?? null,
    max_speed: activityInfo.maxSpeedInMetersPerSecond ?? activityInfo.maxSpeed ?? activityInfo.max_speed ?? null,
    // Power (multiple possible field names from Garmin)
    average_watts: activityInfo.averageBikingPowerInWatts
      ?? activityInfo.averagePower
      ?? activityInfo.avgPower
      ?? activityInfo.avg_power
      ?? null,
    // Calories -> kilojoules (1 kcal = 4.184 kJ)
    kilojoules: activityInfo.activeKilocalories
      ? activityInfo.activeKilocalories * 4.184
      : (activityInfo.calories ? activityInfo.calories * 4.184 : null),
    // Heart rate (bpm)
    average_heartrate: activityInfo.averageHeartRateInBeatsPerMinute
      ?? activityInfo.averageHeartRate
      ?? activityInfo.avgHeartRate
      ?? activityInfo.avg_heart_rate
      ?? null,
    max_heartrate: activityInfo.maxHeartRateInBeatsPerMinute
      ?? activityInfo.maxHeartRate
      ?? activityInfo.max_heart_rate
      ?? null,
    // Cadence
    average_cadence: activityInfo.averageBikingCadenceInRPM
      ?? activityInfo.averageRunningCadenceInStepsPerMinute
      ?? activityInfo.avgCadence
      ?? activityInfo.avg_cadence
      ?? null,
    // Training flags
    trainer: isIndoorActivityType(activityInfo.activityType) ||
      (activityInfo.deviceName || '').toLowerCase().includes('indoor') ||
      (activityInfo.deviceName || '').toLowerCase().includes('trainer') ||
      false,
    // Store ALL original data in raw_data so nothing is lost
    raw_data: activityInfo,
    imported_from: source,
    updated_at: new Date().toISOString()
  };
}
