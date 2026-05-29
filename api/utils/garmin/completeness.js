// JS mirror of the SQL view `garmin_completeness_audit` (migration 093).
// Used by api/garmin-webhook-process.js on every Garmin activity write and
// (Phase 4) by api/garmin-reconcile.js to decide when an activity is "done"
// vs still in the summary_only/needs_resync queue.
//
// CRITICAL: keep this in sync with the view in
// database/migrations/093_garmin_activity_completeness.sql. The completeness
// audit endpoint (api/admin-garmin-health.js) compares stored vs derived; any
// drift means this helper and the SQL diverged.

const RIDE_TYPES = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'];
const RUN_TYPES = ['Run', 'TrailRun'];

/**
 * Derive the data_completeness flag from an activity row's fields.
 *
 * @param {object} a - Activity row or partial activity-data object. Must
 *   include at minimum: type, activity_streams. For rides also: device_watts,
 *   trainer, map_summary_polyline, power_curve_summary, normalized_power,
 *   effective_power.
 * @returns {'summary_only'|'full'|null} Returns null for non-Garmin rows
 *   (provider explicitly set to something other than 'garmin'). When
 *   provider is undefined/null, the predicate is applied — all callers
 *   are inside Garmin code paths.
 *
 *   Note: never returns 'needs_resync' or 'unrecoverable' — those are
 *   reconciliation-cron transitions, not write-path derivations.
 */
export function deriveCompleteness(a) {
  if (!a) return null;
  if (a.provider != null && a.provider !== 'garmin') return null;

  const hasStreams = a.activity_streams != null;
  const hasPolyline = a.map_summary_polyline != null;
  const hasPcurve = a.power_curve_summary != null;
  const hasNp = a.normalized_power != null || a.effective_power != null;

  if (RIDE_TYPES.includes(a.type)) {
    if (a.device_watts === true) {
      return (hasStreams && hasPcurve && hasNp) ? 'full' : 'summary_only';
    }
    return (hasStreams && (a.trainer === true || hasPolyline)) ? 'full' : 'summary_only';
  }

  if (RUN_TYPES.includes(a.type)) {
    return hasStreams ? 'full' : 'summary_only';
  }

  // All other Garmin activity types (Walk, Swim, Training, WeightTraining, etc.)
  return hasStreams ? 'full' : 'summary_only';
}

/**
 * Re-fetch the activity row (only the columns deriveCompleteness reads) and
 * write its current completeness. Use after any partial UPDATE that may have
 * added the missing fields (streams, power curve, polyline, etc.). Tolerant
 * of the activity having been deleted between the original update and now.
 *
 * @param {object} supabase - Server-side supabase client.
 * @param {string} activityId - Activity UUID.
 * @returns {Promise<{updated: boolean, status: string|null, error?: string}>}
 */
export async function refreshCompleteness(supabase, activityId) {
  if (!activityId) return { updated: false, status: null };
  try {
    const { data: row, error: selErr } = await supabase
      .from('activities')
      .select('provider, type, device_watts, trainer, activity_streams, map_summary_polyline, power_curve_summary, normalized_power, effective_power')
      .eq('id', activityId)
      .maybeSingle();
    if (selErr || !row) {
      return { updated: false, status: null, error: selErr?.message || 'row not found' };
    }
    const status = deriveCompleteness(row);
    if (status === null) return { updated: false, status: null };

    const { error: updErr } = await supabase
      .from('activities')
      .update({ data_completeness: status })
      .eq('id', activityId);
    if (updErr) return { updated: false, status, error: updErr.message };

    return { updated: true, status };
  } catch (err) {
    return { updated: false, status: null, error: err.message };
  }
}
