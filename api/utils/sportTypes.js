/**
 * Sport Type Utilities
 * Shared constants and helpers for multi-sport activity support
 */

// Strava/Garmin activity type constants
export const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
export const RUNNING_TYPES = ['Run', 'VirtualRun', 'TrailRun'];
export const SUPPORTED_ACTIVITY_TYPES = [...CYCLING_TYPES, ...RUNNING_TYPES];

/**
 * Get the high-level sport type from a Strava/Garmin activity type
 * @param {string} activityType - e.g. 'Ride', 'Run', 'TrailRun'
 * @returns {'cycling'|'running'|null}
 */
export function getSportType(activityType) {
  if (CYCLING_TYPES.includes(activityType)) return 'cycling';
  if (RUNNING_TYPES.includes(activityType)) return 'running';
  return null;
}

/**
 * Check if an activity type is supported for import
 * @param {string} activityType
 * @returns {boolean}
 */
export function isSupportedActivityType(activityType) {
  return SUPPORTED_ACTIVITY_TYPES.includes(activityType);
}

/**
 * Check if an activity type is cycling
 * @param {string} activityType
 * @returns {boolean}
 */
export function isCyclingType(activityType) {
  return CYCLING_TYPES.includes(activityType);
}

/**
 * Check if an activity type is running
 * @param {string} activityType
 * @returns {boolean}
 */
export function isRunningType(activityType) {
  return RUNNING_TYPES.includes(activityType);
}

/**
 * Calculate average pace in seconds per km from distance (meters) and time (seconds)
 * @param {number} distanceMeters
 * @param {number} movingTimeSeconds
 * @returns {number|null} pace in seconds per km, or null if inputs invalid
 */
export function calculatePaceSecsPerKm(distanceMeters, movingTimeSeconds) {
  if (!distanceMeters || distanceMeters <= 0 || !movingTimeSeconds || movingTimeSeconds <= 0) {
    return null;
  }
  const distanceKm = distanceMeters / 1000;
  return Math.round(movingTimeSeconds / distanceKm);
}

/**
 * Format pace in seconds per km to "M:SS" string
 * @param {number} paceSecsPerKm
 * @returns {string} e.g. "5:30"
 */
export function formatPace(paceSecsPerKm) {
  if (!paceSecsPerKm || paceSecsPerKm <= 0) return '--:--';
  const minutes = Math.floor(paceSecsPerKm / 60);
  const seconds = Math.round(paceSecsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
