// Turn a Wahoo workout_summary (+ its nested workout) into an `activities` row.
//
// Wahoo API facts this module exists to get right (cloud-api.wahooligan.com):
//   - Decimal fields arrive as STRINGS ("3600.0"), so every metric is parsed,
//     and integer columns (moving_time, elapsed_time) are rounded — Postgres
//     rejects "3600.0" for an integer column.
//   - The type is a numeric `workout_type_id` on the workout, not a string.
//   - The FIT file URL is `workout_summary.file.url`.
//   - There is no max HR / max speed in the summary (the FIT supplies those),
//     and `activities` has NO `calories` column — writing one fails the insert.
//
// Metrics are dual-written legacy + canonical per CLAUDE.md § Metrics Rollout.

import { mapWahooWorkoutType } from './workoutTypes.js';
import { sanitizeStressScore } from '../stressScoreSanitizer.js';
import { rideIntensityFields } from '../rideIntensity.js';

/** Parse a Wahoo number-or-numeric-string. Returns null for anything else. */
export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function int(value) {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

/**
 * Wall-clock local time for `isoUtc` in IANA zone `timeZone`, written as a
 * fake-UTC ISO string — the same convention Garmin/COROS/Strava use for
 * `start_date_local`. Returns null when the zone is missing or unknown, so
 * readers fall back to `start_date`.
 */
export function toLocalFakeUtc(isoUtc, timeZone) {
  if (!isoUtc || !timeZone) return null;
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(date).map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    return new Date(local).toISOString();
  } catch {
    return null; // RangeError: unknown time zone
  }
}

/**
 * Pull the summary and the workout out of whatever Wahoo handed us.
 *
 * - Webhook: `{ workout_summary: { ..., workout: {...} } }`
 * - GET /v1/workouts list item / GET /v1/workouts/:id: `{ ...workout, workout_summary: {...} }`
 *
 * @returns {{ summary: object|null, workout: object|null }}
 */
export function splitWahooPayload({ summary = null, workout = null } = {}) {
  const s = summary || workout?.workout_summary || null;
  const w = workout || summary?.workout || null;
  return { summary: s, workout: w };
}

/**
 * Build the activities row. Returns `{ row: null, skipReason }` for workouts
 * we do not import.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {object|null} args.summary  Wahoo workout_summary
 * @param {object} args.workout       Wahoo workout
 * @param {number|null} [args.ftp]    athlete FTP for ride intensity
 * @param {string} args.source        'wahoo_webhook' | 'wahoo_manual_sync'
 * @param {object} [args.raw]         payload to keep in raw_data
 */
export function buildWahooActivity({ userId, summary, workout, ftp = null, source, raw = null }) {
  if (!workout?.id) return { row: null, skipReason: 'missing workout id' };

  const mapped = mapWahooWorkoutType(workout.workout_type_id);
  if (!mapped) {
    return { row: null, skipReason: `unsupported workout_type_id ${workout.workout_type_id}` };
  }

  // A workout with no summary yet is still in progress (or was planned and
  // never ridden). The workout_summary webhook arrives once it is finished.
  if (!summary) return { row: null, skipReason: 'no workout_summary yet' };

  const s = summary;
  const startDate = workout.starts || s.created_at || workout.created_at || null;
  if (!startDate) return { row: null, skipReason: 'missing start time' };

  const isRun = mapped.type.includes('Run');
  const np = int(s.power_bike_np_last);
  const tss = sanitizeStressScore(num(s.power_bike_tss_last));
  const work = num(s.work_accum); // joules

  const row = {
    user_id: userId,
    provider: 'wahoo',
    provider_activity_id: String(workout.id),
    name: (workout.name && String(workout.name).trim()) || s.name || (isRun ? 'Wahoo run' : 'Wahoo ride'),
    type: mapped.type,
    // Strava-style so the shared classifier (sportTypes.js) buckets it; the
    // Wahoo enum name is kept in raw_data.
    sport_type: mapped.type,
    start_date: new Date(startDate).toISOString(),
    start_date_local: toLocalFakeUtc(startDate, s.time_zone),
    distance: num(s.distance_accum), // meters
    moving_time: int(s.duration_active_accum), // seconds
    elapsed_time: int(s.duration_total_accum),
    total_elevation_gain: num(s.ascent_accum),
    average_speed: num(s.speed_avg), // m/s
    average_watts: num(s.power_avg),
    average_heartrate: num(s.heart_rate_avg),
    average_cadence: num(s.cadence_avg),
    kilojoules: work != null ? Math.round(work / 10) / 100 : null,
    trainer: mapped.trainer,
    raw_data: { ...(raw || { workout, workout_summary: summary }), wahoo_type: mapped.name },
    imported_from: source,
  };

  // Device-computed power metrics from the summary. The FIT parse (when it
  // succeeds) overrides these with stream-derived values.
  if (np != null && np > 0) {
    row.normalized_power = np;
    row.effective_power = np;
    Object.assign(row, rideIntensityFields(np, ftp));
  }
  if (tss != null) {
    row.tss = tss;
    row.rss = tss;
  }

  // Drop nulls so an insert never sends a column we do not have a value for
  // (and an update never erases a better value with null).
  for (const key of Object.keys(row)) {
    if (row[key] === null || row[key] === undefined) delete row[key];
  }

  return { row, skipReason: null };
}

/**
 * Fields from a parsed FIT (api/utils/fitParser.js) to write onto the row.
 * Mirrors Garmin's applyParsedResultToActivity — copied rather than imported
 * because the Garmin stack is frozen.
 */
export function fitResultToActivityFields(result, ftp = null) {
  const fields = {};
  if (!result || result.error) return fields;

  if (result.polyline) fields.map_summary_polyline = result.polyline;
  if (result.activityStreams) fields.activity_streams = result.activityStreams;
  if (result.rideAnalytics) fields.ride_analytics = result.rideAnalytics;
  if (result.fitCoachContext) fields.fit_coach_context = result.fitCoachContext;
  if (result.fit_storage_path) fields.fit_storage_path = result.fit_storage_path;

  const summary = result.summary || {};
  if (summary.maxHeartRate) fields.max_heartrate = summary.maxHeartRate;
  if (summary.maxSpeed) fields.max_speed = summary.maxSpeed;

  const pm = result.powerMetrics;
  if (pm) {
    if (pm.avgPower) fields.average_watts = pm.avgPower;
    if (pm.normalizedPower) {
      fields.normalized_power = pm.normalizedPower;
      fields.effective_power = pm.normalizedPower;
      Object.assign(fields, rideIntensityFields(pm.normalizedPower, ftp));
    }
    if (pm.maxPower) fields.max_watts = pm.maxPower;
    const tssSafe = sanitizeStressScore(pm.trainingStressScore);
    if (tssSafe != null) {
      fields.tss = tssSafe;
      fields.rss = tssSafe;
    }
    if (pm.intensityFactor) {
      fields.intensity_factor = pm.intensityFactor;
      fields.ride_intensity = pm.intensityFactor;
    }
    if (pm.powerCurveSummary) fields.power_curve_summary = pm.powerCurveSummary;
    if (pm.workKj) fields.kilojoules = pm.workKj;
    fields.device_watts = true;
  }
  return fields;
}
