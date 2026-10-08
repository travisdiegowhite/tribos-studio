/**
 * Strava activities that still import when Garmin/Wahoo is primary.
 *
 * With Strava auto-import off and Garmin or Wahoo connected
 * (`shouldSkipStravaIngest`), Strava ingestion is skipped because the device
 * provider delivers the same rides with richer FIT data. Virtual rides are the
 * exception: Zwift (and similar apps) sync into Garmin Connect as a partner
 * upload, and Garmin's API does not pass partner-originated activities on, so
 * a Zwift ride never reaches us from Garmin. Strava is the only source, and
 * skipping it lost every Zwift ride (2026-10-08: zero Garmin events for any
 * of them, every Strava event "Skipped: Strava auto-import disabled").
 *
 * If a virtual ride ever does arrive from Garmin too (a manual web upload),
 * the cross-provider dedup in activityDedup.js merges the two.
 */

export const VIRTUAL_ACTIVITY_TYPES = ['VirtualRide', 'VirtualRun'];

/**
 * True for a Strava activity Garmin/Wahoo cannot deliver, so it is imported
 * even while the user's Strava auto-import is off.
 */
export function isVirtualStravaActivity(activity) {
  if (!activity) return false;
  return VIRTUAL_ACTIVITY_TYPES.includes(activity.type)
    || VIRTUAL_ACTIVITY_TYPES.includes(activity.sport_type);
}
