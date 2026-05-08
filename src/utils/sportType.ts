/**
 * Sport-type helpers for activity views.
 *
 * Activities arrive from many providers with inconsistent sport labelling:
 * Strava uses `sport_type` ("Ride", "Run", "VirtualRun", "TrailRun", ...) and
 * an older `type` field; Garmin/Wahoo set `sport_type` directly via the
 * normalized values from `SportType` ('cycling' | 'running' | 'other').
 * GPX/FIT imports default to 'cycling'.
 *
 * These helpers normalize the field and answer two questions the UI keeps
 * asking:
 *   - is this a running activity? (don't show power-derived UI)
 *   - is power-based analysis valid for this activity? (cycling, or
 *     anything with device-measured watts)
 */

import type { SportType } from '../types/training';

type ActivityLike = {
  sport_type?: string | null;
  type?: string | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
} | null | undefined;

const RUNNING_TOKENS = new Set([
  'run',
  'running',
  'virtualrun',
  'trailrun',
  'treadmillrun',
]);

const CYCLING_TOKENS = new Set([
  'ride',
  'cycling',
  'virtualride',
  'gravelride',
  'mountainbikeride',
  'ebikeride',
  'handcycle',
  'velomobile',
]);

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Best-effort sport classification. Returns 'cycling' / 'running' / 'other'.
 * Preference order: explicit `sport_type`, then Strava-style `type`.
 */
export function getActivitySport(activity: ActivityLike): SportType {
  if (!activity) return 'other';
  const candidates = [activity.sport_type, activity.type];
  for (const raw of candidates) {
    const token = normalizeToken(raw);
    if (!token) continue;
    if (RUNNING_TOKENS.has(token)) return 'running';
    if (CYCLING_TOKENS.has(token)) return 'cycling';
    if (token.includes('run')) return 'running';
    if (token.includes('ride') || token.includes('cycl')) return 'cycling';
  }
  return 'other';
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
 * Sport-aware label for the training-load metric. The canonical name is
 * "rss" but users still recognize "TSS" for cycling power-based load. For
 * runs we surface a sport-neutral "Load" until rTSS lands in Phase 2.
 */
export function getLoadLabel(activity: ActivityLike): 'TSS' | 'Load' {
  return isPowerSport(activity) ? 'TSS' : 'Load';
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
