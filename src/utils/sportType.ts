/**
 * Sport-type helpers for activity views.
 *
 * Activities arrive from many providers with inconsistent sport labelling
 * (Strava 'Run', Garmin 'TRAIL_RUNNING', lowercase 'running'). Classification
 * itself lives in `api/utils/sportTypes.js`; these helpers answer the two
 * questions the UI keeps asking:
 *   - is this a running activity? (don't show power-derived UI)
 *   - is power-based analysis valid for this activity? (cycling, or
 *     anything with device-measured watts)
 */

import type { SportType } from '../types/training';
import { sportTypeOfActivity } from '../../api/utils/sportTypes.js';

type ActivityLike = {
  sport_type?: string | null;
  type?: string | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
} | null | undefined;

/**
 * Best-effort sport classification. Returns 'cycling' / 'running' / 'other'.
 *
 * Delegates to the server classifier in `api/utils/sportTypes.js` so the
 * browser and the load pipeline can never disagree about what a row is. That
 * module speaks all three importer vocabularies (Strava 'Ride', Garmin
 * 'ROAD_BIKING', lowercase 'cycling'); the token list this file used to carry
 * filed Garmin 'ROAD_BIKING' under 'other'.
 */
export function getActivitySport(activity: ActivityLike): SportType {
  if (!activity) return 'other';
  return sportTypeOfActivity(activity) as SportType;
}

export function isRunningActivity(activity: ActivityLike): boolean {
  return getActivitySport(activity) === 'running';
}

export function isCyclingActivity(activity: ActivityLike): boolean {
  return getActivitySport(activity) === 'cycling';
}

/**
 * True when power-based analysis (NP, IF, TSS-from-power, power zones) is
 * meaningful for this activity. Cycling activities qualify; runs do not, even
 * if a footpod reported watts (running power is a different scale and not
 * comparable to cycling FTP).
 */
export function isPowerSport(activity: ActivityLike): boolean {
  const sport = getActivitySport(activity);
  if (sport === 'running') return false;
  if (sport === 'cycling') return true;
  // Unknown sport: only trust power if the device explicitly measured it.
  return Boolean(activity?.device_watts);
}

/**
 * Label for the training-load metric. RSS (Ride Stress Score) is the one
 * Tribos load vocabulary across sports — derivation differs by sport, the
 * name doesn't. Kept as a function so call sites stay sport-aware if a
 * per-sport label ever returns.
 */
export function getLoadLabel(_activity: ActivityLike): 'RSS' {
  return 'RSS';
}

/**
 * Sport-aware noun for an activity. Useful for replacing hardcoded "ride"
 * copy. Phase 4 will sweep the UI to use this everywhere.
 */
export function getActivityNoun(
  activity: ActivityLike,
  form: 'singular' | 'plural' = 'singular',
): string {
  const sport = getActivitySport(activity);
  if (sport === 'running') return form === 'plural' ? 'runs' : 'run';
  if (sport === 'cycling') return form === 'plural' ? 'rides' : 'ride';
  return form === 'plural' ? 'activities' : 'activity';
}
