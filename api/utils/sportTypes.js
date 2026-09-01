/**
 * Sport Type Utilities
 * Shared constants and helpers for multi-sport activity support
 */

// Strava/Garmin activity type constants
export const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
export const RUNNING_TYPES = ['Run', 'VirtualRun', 'TrailRun'];
export const OTHER_TYPES = [
  'Walk', 'Hike', 'Swim', 'WeightTraining', 'Yoga', 'Workout',
  'Elliptical', 'StairStepper', 'Rowing', 'AlpineSki', 'Snowboard',
  'NordicSki', 'BackcountrySki', 'StandUpPaddling', 'Kayaking', 'Surfing',
];
// The IMPORT allowlist, deliberately Strava-only and deliberately NOT widened
// by the classifier work below: it decides which webhook payloads get stored,
// which is a different question from how a stored row is bucketed.
export const SUPPORTED_ACTIVITY_TYPES = [...CYCLING_TYPES, ...RUNNING_TYPES];

// ─── Three vocabularies, one classifier ──────────────────────────────────────
//
// `activities` carries the sport in two columns written by different importers,
// and between them they speak three vocabularies:
//
//   type        Strava-style, and consistently normalised: 'Ride', 'Run',
//               'VirtualRide', 'GravelRide', 'TrailRun'.
//   sport_type  whatever the source sent — Strava-style from Strava,
//               SCREAMING_SNAKE from Garmin ('ROAD_BIKING', 'TRAIL_RUNNING'),
//               and lowercase from other importers ('cycling', 'running').
//
// getSportType used to match Strava names only, so a Garmin 'ROAD_BIKING'
// returned 'other'. Any caller preferring sport_type over type therefore
// mis-bucketed roughly 1,700 rides and 400 runs a year — including the coach's
// own SERVER TRAINING SNAPSHOT, which reported a Garmin athlete's whole week
// under "other".
//
// Matching is done on a normalised key (uppercased, non-alphanumerics
// stripped) so all three vocabularies collapse onto the same entries.

const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Every spelling of "this was a ride" seen across the importers. */
const CYCLING_KEYS = new Set([
  // Strava
  'RIDE', 'VIRTUALRIDE', 'EBIKERIDE', 'GRAVELRIDE', 'MOUNTAINBIKERIDE', 'HANDCYCLE', 'VELOMOBILE',
  // Garmin
  'CYCLING', 'ROADBIKING', 'GRAVELCYCLING', 'MOUNTAINBIKING', 'INDOORCYCLING', 'VIRTUALRIDE',
  'CYCLOCROSS', 'TRACKCYCLING', 'BMX', 'EBIKEFITNESS', 'EBIKEMOUNTAIN', 'RECUMBENTCYCLING',
  'GRAVELCYCLINGWS', 'MOUNTAINBIKINGWS',
].map(norm));

/** Every spelling of "this was a run". */
const RUNNING_KEYS = new Set([
  // Strava
  'RUN', 'VIRTUALRUN', 'TRAILRUN',
  // Garmin
  'RUNNING', 'TRAILRUNNING', 'TREADMILLRUNNING', 'INDOORRUNNING', 'TRACKRUNNING',
  'OBSTACLERUN', 'STREETRUNNING', 'ULTRARUN',
].map(norm));

/**
 * Conservative fallback for a spelling nobody has seen yet. Garmin adds sport
 * types faster than anyone updates a list, so an unrecognised value gets one
 * substring check rather than being silently filed under "other".
 *
 * Deliberately narrow: 'BIKE'/'CYCL' and 'RUN' do not appear in any non-target
 * sport name in the live data. Note the order — 'MOUNTAINBIKERUN' style
 * hybrids do not exist, but if one appears, cycling wins, which is the safer
 * bucket for a ride-shaped activity.
 */
function fallbackSport(key) {
  if (key.includes('BIKE') || key.includes('CYCL')) return 'cycling';
  if (key.includes('RUN')) return 'running';
  return 'other';
}

/**
 * Get the high-level sport type from any importer's activity-type string.
 *
 * Accepts all three vocabularies — 'Ride', 'ROAD_BIKING' and 'cycling' all
 * return 'cycling'.
 *
 * @param {string} activityType - e.g. 'Ride', 'ROAD_BIKING', 'cycling', 'TrailRun'
 * @returns {'cycling'|'running'|'other'}
 */
export function getSportType(activityType) {
  const key = norm(activityType);
  if (!key) return 'other';
  if (CYCLING_KEYS.has(key)) return 'cycling';
  if (RUNNING_KEYS.has(key)) return 'running';
  return fallbackSport(key);
}

/**
 * The sport of an activity ROW, reading whichever of its two columns actually
 * says something.
 *
 * Prefer this over calling getSportType on one field. `sport_type` is usually
 * the more specific of the two (Garmin's 'E_BIKE_FITNESS' lands in `type` as
 * the useless 'Workout'), but it is also the one that can hold an importer's
 * junk value, so a non-answer there falls through to `type`.
 *
 * @param {{type?: string|null, sport_type?: string|null}} activity
 * @returns {'cycling'|'running'|'other'}
 */
export function sportTypeOfActivity(activity) {
  const fromSportType = getSportType(activity?.sport_type);
  if (fromSportType !== 'other') return fromSportType;
  return getSportType(activity?.type);
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
  return getSportType(activityType) === 'cycling';
}

/**
 * Check if an activity type is running
 * @param {string} activityType
 * @returns {boolean}
 */
export function isRunningType(activityType) {
  return getSportType(activityType) === 'running';
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
