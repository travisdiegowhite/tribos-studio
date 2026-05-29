/**
 * Activity Details JSON → fitParser-shape converter
 * =========================================================================
 *
 * Phase 7 of the Garmin reliability rollout. When Garmin's
 * ACTIVITY_FILE_DATA webhook never arrives (~70% of activities),
 * `api/garmin-reconcile.js` and `api/garmin-resync-activity.js` call the
 * `/wellness-api/rest/activityDetails` PULL endpoint (spec v1.2.5 §7.3)
 * which returns the same sample data as JSON instead of a FIT file.
 *
 * This module's `extractStreamsFromActivityDetails(detail)` converts ONE
 * element of that response array into the SAME object shape that
 * `parseFitBuffer` (api/utils/fitParser.js:616) returns from a FIT
 * download — so the downstream write path in `processFitFile`
 * (api/garmin-webhook-process.js:786-820) works unchanged.
 *
 * Sample mapping per spec §7.3:
 *
 *   samples[i] = {
 *     startTimeInSeconds:       ← absolute Unix seconds (NOT offset)
 *     latitudeInDegree:         degrees
 *     longitudeInDegree:        degrees
 *     elevationInMeters:        meters
 *     heartRate:                bpm (uint8)
 *     speedMetersPerSecond:     m/s
 *     totalDistanceInMeters:    meters cumulative
 *     timerDurationInSeconds:   timer time (paused excluded)
 *     clockDurationInSeconds:   wall clock
 *     movingDurationInSeconds:  moving time
 *     powerInWatts:             watts
 *     bikeCadenceInRPM:         rpm
 *     stepsPerMinute:           run cadence
 *     swimCadenceInStrokesPerMinute: pool stroke rate
 *     airTemperatureCelcius:    celsius
 *   }
 *
 * Sentinels: Garmin's JSON Pull omits absent fields rather than using FIT's
 * 0xFFFF/0xFF sentinel encoding, but devices occasionally emit out-of-range
 * placeholder values. We apply the same MAX_VALID_* guards `fitParser` uses
 * so the math downstream is identical.
 */

import {
  MAX_VALID_POWER_WATTS,
  MAX_VALID_HR_BPM,
  MAX_VALID_CADENCE_RPM,
  encodePolyline,
  simplifyTrack,
  buildActivityStreams,
  buildActivityStreamsFromDataPoints,
  calculateAveragePower,
  calculateNormalizedPower,
  calculatePowerCurveSummary,
} from '../fitParser.js';

/**
 * Convert one Activity Details element into the parseFitBuffer return shape.
 *
 * @param {Object} detail - One element of the §7.3 array. Required:
 *   `samples` (Array). Recommended: `summary` (Object), `activityId`,
 *   `summaryId`.
 * @returns {Object} Same shape as `parseFitBuffer`:
 *   { polyline, activityStreams, summary, powerMetrics,
 *     rideAnalytics, fitCoachContext, pointCount, simplifiedCount,
 *     hasPowerData, error }.
 *   On invalid input returns the empty-result shape with `error` set,
 *   matching parseFitBuffer's failure return so callers don't need
 *   a separate branch.
 */
export function extractStreamsFromActivityDetails(detail) {
  const emptyResult = {
    polyline: null,
    activityStreams: null,
    summary: null,
    powerMetrics: null,
    rideAnalytics: null,
    fitCoachContext: null,
    pointCount: 0,
    simplifiedCount: 0,
    hasPowerData: false,
    error: null,
  };

  if (!detail || typeof detail !== 'object') {
    return { ...emptyResult, error: 'detail is not an object' };
  }
  const samples = Array.isArray(detail.samples) ? detail.samples : [];
  if (samples.length === 0) {
    // Garmin returned a row but no per-second data. This happens for
    // manually-entered activities and devices that didn't record samples.
    // Surface as a non-error empty result — callers should NOT promote
    // the activity to 'full' but also shouldn't retry forever.
    return { ...emptyResult, summary: mapDetailSummary(detail) };
  }

  // ===== 1. Build the dataPoints array (matches fitParser.extractAllDataPoints) =====
  const points = [];
  for (const s of samples) {
    if (s == null || s.startTimeInSeconds == null) continue;
    const power = sentinelFilter(s.powerInWatts, MAX_VALID_POWER_WATTS);
    const heartRate = sentinelFilter(s.heartRate, MAX_VALID_HR_BPM);
    // bike cadence preferred for rides; fall back to step rate for runs
    const cadence = sentinelFilter(
      s.bikeCadenceInRPM ?? s.stepsPerMinute ?? s.swimCadenceInStrokesPerMinute,
      MAX_VALID_CADENCE_RPM,
    );
    points.push({
      timestamp: new Date(s.startTimeInSeconds * 1000).toISOString(),
      power,
      heartRate,
      cadence,
      speed: numOrNull(s.speedMetersPerSecond),
      distance: numOrNull(s.totalDistanceInMeters),
      elevation: numOrNull(s.elevationInMeters),
      latitude: numOrNull(s.latitudeInDegree),
      longitude: numOrNull(s.longitudeInDegree),
    });
  }

  if (points.length === 0) {
    return { ...emptyResult, summary: mapDetailSummary(detail) };
  }

  // ===== 2. Polyline (only if we have GPS) =====
  const gpsPoints = points.filter(p => p.latitude != null && p.longitude != null);
  let polyline = null;
  let simplified = null;
  let simplifiedCount = 0;
  if (gpsPoints.length > 0) {
    simplified = simplifyTrack(gpsPoints);
    simplifiedCount = simplified.length;
    polyline = encodePolyline(simplified);
  }

  // ===== 3. Activity streams =====
  // Prefer GPS-simplified streams (smaller payload, same data) and fall
  // back to the dense allDataPoints version for indoor / no-GPS rides.
  let activityStreams = null;
  if (simplified && simplified.length >= 2) {
    activityStreams = buildActivityStreams(simplified);
  }
  if (!activityStreams && points.length >= 2) {
    activityStreams = buildActivityStreamsFromDataPoints(points);
  }

  // ===== 4. Power metrics =====
  const powerStream = points.map(p => p.power).filter(v => v != null && v > 0);
  let powerMetrics = null;
  if (powerStream.length > 0) {
    const normalizedPower = calculateNormalizedPower(powerStream);
    const avgPower = calculateAveragePower(powerStream);
    const maxPower = Math.max(...powerStream);
    const powerCurveSummary = calculatePowerCurveSummary(powerStream);
    // Each sample is ~1 s, so sum(watts) ≈ joules; /1000 → kJ.
    const workKj = Math.round(powerStream.reduce((sum, p) => sum + p, 0) / 1000);
    powerMetrics = {
      normalizedPower,
      maxPower,
      avgPower,
      // §7.3 does not carry FIT's session-level TSS/IF/FTP fields. They'll
      // be computed downstream from NP + athlete FTP if needed.
      trainingStressScore: null,
      intensityFactor: null,
      thresholdPower: null,
      powerCurveSummary,
      workKj: workKj > 0 ? workKj : null,
      hasPowerData: true,
      powerSampleCount: powerStream.length,
    };
  }

  return {
    polyline,
    activityStreams,
    summary: mapDetailSummary(detail),
    powerMetrics,
    // rideAnalytics + fitCoachContext are derived from the same `points`
    // and could be computed here, but `completeness.js:38-42` only
    // requires streams + polyline + NP to flip to 'full'. Defer the
    // analytics build to a follow-up so a slow analytics path can't
    // stall recovery.
    rideAnalytics: null,
    fitCoachContext: null,
    pointCount: points.length,
    simplifiedCount,
    hasPowerData: powerMetrics?.hasPowerData ?? false,
    error: null,
  };
}

function sentinelFilter(v, max) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= max) return null;
  return n;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapDetailSummary(detail) {
  const s = detail.summary ?? {};
  return {
    // fitParser's summary uses these keys (api/utils/fitParser.js:616+).
    // Map §7.3's Garmin-style camelCase into the same shape so downstream
    // readers don't need a discriminator.
    duration: s.durationInSeconds ?? null,
    distance: s.distanceInMeters ?? null,
    avgHeartRate: s.averageHeartRateInBeatsPerMinute ?? null,
    maxHeartRate: s.maxHeartRateInBeatsPerMinute ?? null,
    avgSpeed: s.averageSpeedInMetersPerSecond ?? null,
    maxSpeed: s.maxSpeedInMetersPerSecond ?? null,
    elevationGain: s.totalElevationGainInMeters ?? null,
    elevationLoss: s.totalElevationLossInMeters ?? null,
    calories: s.activeKilocalories ?? null,
    deviceName: s.deviceName ?? null,
    activityType: s.activityType ?? null,
    activityName: s.activityName ?? null,
    startTime: s.startTimeInSeconds
      ? new Date(s.startTimeInSeconds * 1000).toISOString()
      : null,
    // The §7.3 sample-level summary does not include device-computed NP,
    // max power, IF, TSS, FTP. Leaving these null forces the calculated
    // values from powerMetrics to be used directly.
    normalizedPower: null,
    maxPower: null,
    avgPower: null,
    trainingStressScore: null,
    intensityFactor: null,
    threshold_power: null,
  };
}
