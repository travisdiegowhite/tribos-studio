// Server-side FIT File Parser
// Parses FIT files from Garmin to extract GPS data and encode as polyline
// Used by Garmin webhook to get route data from activities
//
// Parser: @garmin/fitsdk (Garmin's official FIT JavaScript SDK).
// Replaced easy-fit 0.0.8 (pre-1.0, unmaintained) on 2026-06-13 after
// discovering it returned 0 records from a 537 KB Edge 540 FIT file —
// the device format had moved past what the old library could read.
// Garmin's own SDK supports every device they make by definition.

import { computePerRideAnalytics } from './advancedRideAnalytics.js';
import { buildFitCoachContext } from './fitCoachContext.js';

// @garmin/fitsdk is ESM-only ("type": "module" in its package.json).
// Vercel's serverless runtime loads this file as CJS because the root
// package.json has no "type": "module", so a static `import { Decoder,
// Stream } from '@garmin/fitsdk'` becomes `require()` and throws
// ERR_REQUIRE_ESM at module load — taking down /api/garmin-activities,
// /api/garmin-webhook-process, and every other endpoint that imports
// this file. Dynamic import() is allowed from CJS hosts; the returned
// promise is cached so we only pay the load cost once per cold start.
let _fitsdkPromise = null;
function loadFitSdk() {
  if (!_fitsdkPromise) _fitsdkPromise = import('@garmin/fitsdk');
  return _fitsdkPromise;
}

// FIT semicircles → degrees conversion factor.
// FIT stores positions as int32 semicircles where 0x80000000 == 180°.
const SEMICIRCLES_TO_DEGREES = 180 / Math.pow(2, 31);

// Maximum valid values for FIT data fields
// FIT protocol uses sentinel values (e.g., 0xFFFF = 65535 for uint16) to indicate "invalid/no data"
// These must be filtered out before any metric calculations
// Exported so the Activity Details JSON path (api/utils/garmin/activityDetailsParser.js)
// applies the same sentinel filters when ingesting Garmin's Pull endpoint payloads.
export const MAX_VALID_POWER_WATTS = 2500;    // Covers elite track sprinters
export const MAX_VALID_HR_BPM = 250;          // Physiological maximum
export const MAX_VALID_CADENCE_RPM = 250;     // Covers high-cadence drills

/**
 * Reshape @garmin/fitsdk's output into the snake_case shape the existing
 * extract* functions below already speak. The SDK uses camelCase field
 * names per FIT spec convention; our downstream code uses snake_case from
 * the easy-fit era. Doing the rename at this boundary keeps the change
 * contained — extractTrackPoints / extractAllDataPoints / extractSummary
 * stay byte-identical, no downstream consumer needs updating.
 *
 * Position values: FIT stores lat/long in semicircles, not degrees. The
 * SDK's applyScaleAndOffset doesn't convert (semicircles have no scale in
 * the FIT profile) so we do it explicitly here.
 */
function normalizeMessagesToLegacyShape(messages) {
  const records = (messages.recordMesgs || []).map((r) => ({
    timestamp:        r.timestamp ?? null,
    position_lat:     r.positionLat != null  ? r.positionLat  * SEMICIRCLES_TO_DEGREES : null,
    position_long:    r.positionLong != null ? r.positionLong * SEMICIRCLES_TO_DEGREES : null,
    altitude:         r.altitude ?? null,
    enhanced_altitude:r.enhancedAltitude ?? null,
    speed:            r.speed ?? null,
    enhanced_speed:   r.enhancedSpeed ?? null,
    heart_rate:       r.heartRate ?? null,
    cadence:          r.cadence ?? null,
    power:            r.power ?? null,
    distance:         r.distance ?? null,
    temperature:      r.temperature ?? null,
  }));

  const sessions = (messages.sessionMesgs || []).map((s) => ({
    start_time:             s.startTime ?? null,
    total_distance:         s.totalDistance ?? null,
    total_timer_time:       s.totalTimerTime ?? null,
    total_elapsed_time:     s.totalElapsedTime ?? null,
    total_ascent:           s.totalAscent ?? null,
    total_descent:          s.totalDescent ?? null,
    avg_speed:              s.avgSpeed ?? s.enhancedAvgSpeed ?? null,
    max_speed:              s.maxSpeed ?? s.enhancedMaxSpeed ?? null,
    avg_heart_rate:         s.avgHeartRate ?? null,
    max_heart_rate:         s.maxHeartRate ?? null,
    avg_power:              s.avgPower ?? null,
    max_power:              s.maxPower ?? null,
    avg_cadence:            s.avgCadence ?? null,
    max_cadence:            s.maxCadence ?? null,
    sport:                  s.sport ?? null,
    sub_sport:              s.subSport ?? null,
    normalized_power:       s.normalizedPower ?? null,
    training_stress_score:  s.trainingStressScore ?? null,
    intensity_factor:       s.intensityFactor ?? null,
    threshold_power:        s.thresholdPower ?? null,
    total_work:             s.totalWork ?? null,
    total_calories:         s.totalCalories ?? null,
  }));

  const activity = (messages.activityMesgs || []).map((a) => ({
    timestamp: a.timestamp ?? null,
    total_timer_time: a.totalTimerTime ?? null,
  }));

  const file_id = (messages.fileIdMesgs || []).map((f) => ({
    manufacturer:   f.manufacturer ?? null,
    garmin_product: f.garminProduct ?? null,
    product:        f.product ?? null,
    serial_number:  f.serialNumber ?? null,
  }));

  const laps = (messages.lapMesgs || []);

  return { records, sessions, activity, file_id, laps };
}

/**
 * Parse a FIT file buffer and extract GPS track points + summary + streams.
 *
 * @param {Buffer|ArrayBuffer} fitBuffer - The raw FIT file data.
 * @returns {Promise<Object>} Parsed data including trackPoints, allDataPoints,
 *   summary, powerMetrics, rideAnalytics, recordCount, hasGpsData, hasPowerData.
 */
export async function parseFitFile(fitBuffer) {
  const { Decoder, Stream } = await loadFitSdk();
  return new Promise((resolve, reject) => {
    try {
      const buffer = Buffer.isBuffer(fitBuffer) ? fitBuffer : Buffer.from(fitBuffer);
      const stream = Stream.fromBuffer(buffer);

      const decoder = new Decoder(stream);
      if (!decoder.isFIT()) {
        reject(new Error('Not a valid FIT file (header signature missing)'));
        return;
      }

      // Decode the file. SDK options:
      //   applyScaleAndOffset: numeric fields get scale/offset applied
      //     (e.g. speed in m/s rather than raw uint16)
      //   convertDateTimesToDates: timestamps become JavaScript Date objects
      //   expandSubFields / expandComponents: makes accumulated fields like
      //     distance and time-in-zone available alongside the raw components
      //   mergeHeartRates: if the file has both BLE HR and ANT+ HR streams,
      //     prefers the one with more samples (newer Garmin devices often
      //     record both)
      const { messages, errors } = decoder.read({
        applyScaleAndOffset: true,
        expandSubFields: true,
        expandComponents: true,
        convertTypesToStrings: true,
        convertDateTimesToDates: true,
        mergeHeartRates: true,
      });

      if (errors && errors.length > 0) {
        // FIT decode produces errors as it goes (e.g. unknown message types
        // from a newer device profile). Most are non-fatal — log the first
        // few for visibility but don't reject.
        console.warn(`⚠️ FIT decode produced ${errors.length} non-fatal errors. First 3:`,
          errors.slice(0, 3).map((e) => e?.message || String(e)));
      }

      const data = normalizeMessagesToLegacyShape(messages);

      try {
        // Extract GPS track points (for polyline/map)
        const trackPoints = extractTrackPoints(data.records || []);

          // Extract ALL data points (including indoor rides without GPS)
          // This is critical for power data extraction
          const allDataPoints = extractAllDataPoints(data.records || []);

          const summary = extractSummary(data);

          // Extract power stream from ALL data points, not just GPS points
          // This fixes the bug where indoor rides had no power data
          const powerStream = extractPowerStream(allDataPoints);
          let powerMetrics = null;

          if (powerStream && powerStream.length > 0) {
            // Use device-calculated NP if available, otherwise calculate from stream
            const normalizedPower = summary?.normalizedPower || calculateNormalizedPower(powerStream);
            const powerCurveSummary = calculatePowerCurveSummary(powerStream);

            // Calculate average power from the stream
            const avgPowerFromStream = calculateAveragePower(powerStream);

            // Calculate max power from stream (already filtered for sentinel values)
            const maxPowerFromStream = powerStream.length > 0 ? Math.max(...powerStream) : null;

            // Calculate mechanical work (kJ) from power stream
            // Each sample is ~1 second, so sum of watts = joules
            const workKj = Math.round(powerStream.reduce((sum, p) => sum + p, 0) / 1000);

            powerMetrics = {
              normalizedPower,
              maxPower: maxPowerFromStream || summary?.maxPower || null,
              // Use calculated average if not in summary, or if stream-calculated is more accurate
              avgPower: avgPowerFromStream || summary?.avgPower || null,
              trainingStressScore: summary?.trainingStressScore || null,
              intensityFactor: summary?.intensityFactor || null,
              thresholdPower: summary?.threshold_power || null,
              powerCurveSummary,
              workKj: workKj > 0 ? workKj : null,
              hasPowerData: true,
              powerSampleCount: powerStream.length
            };

            console.log(`⚡ Power metrics extracted: NP=${normalizedPower}W, Avg=${avgPowerFromStream}W, Max=${powerMetrics.maxPower}W, Work=${workKj}kJ, Samples=${powerStream.length}`);
          }

          // Compute advanced per-ride analytics from full-resolution streams
          let rideAnalytics = null;
          try {
            const hrStreamFull = allDataPoints
              .map(p => p.heartRate)
              .filter(v => v !== null && v !== undefined);
            const cadenceStreamFull = allDataPoints
              .map(p => p.cadence)
              .filter(v => v !== null && v !== undefined);

            rideAnalytics = computePerRideAnalytics({
              powerStream: powerStream || [],
              hrStream: hrStreamFull.length > 60 ? hrStreamFull : null,
              cadenceStream: cadenceStreamFull.length > 60 ? cadenceStreamFull : null,
              ftp: summary?.threshold_power || null,
              maxHR: summary?.maxHeartRate || null,
            });
          } catch (analyticsError) {
            console.warn('⚠️ Advanced ride analytics failed (non-fatal):', analyticsError.message);
          }

          // Diagnostic: a FIT file that decoded successfully but produced
          // zero record messages is unusual. Could be a manual-entry FIT,
          // a summary-only device file, or a corrupted upload. Log the
          // message-type breakdown to make troubleshooting fast.
          if ((data.records?.length || 0) === 0) {
            // SDK rarely returns 0 records for a real activity, but if it
            // does (e.g. a manual-entry FIT or device summary-only file),
            // log the message-type breakdown so we can see what the SDK
            // actually parsed before reporting empty.
            const msgTypeCounts = Object.fromEntries(
              Object.entries(messages).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
            );
            console.warn(
              `[FIT:PARSE-EMPTY] @garmin/fitsdk returned 0 records. Message-type counts: ${JSON.stringify(msgTypeCounts)}`
            );
          }

          resolve({
            trackPoints,
            allDataPoints,
            summary,
            powerMetrics,
            rideAnalytics,
            recordCount: data.records?.length || 0,
            hasGpsData: trackPoints.length > 0,
            hasPowerData: powerMetrics?.hasPowerData || false
          });
      } catch (parseError) {
        reject(new Error(`Failed to process FIT data: ${parseError.message}`));
      }
    } catch (error) {
      reject(new Error(`FIT parser initialization failed: ${error.message}`));
    }
  });
}

/**
 * Extract GPS track points from FIT records
 */
function extractTrackPoints(records) {
  const trackPoints = [];

  for (const record of records) {
    // Only include records with valid position data
    if (record.position_lat != null && record.position_long != null) {
      // Position values arrive here in degrees — normalizeMessagesToLegacyShape
      // already converted from FIT's native semicircles representation.
      trackPoints.push({
        latitude: record.position_lat,
        longitude: record.position_long,
        elevation: record.enhanced_altitude || record.altitude || null,
        timestamp: record.timestamp instanceof Date
          ? record.timestamp.toISOString()
          : record.timestamp,
        heartRate: record.heart_rate > 0 && record.heart_rate < MAX_VALID_HR_BPM ? record.heart_rate : null,
        power: record.power > 0 && record.power < MAX_VALID_POWER_WATTS ? record.power : null,
        cadence: record.cadence > 0 && record.cadence < MAX_VALID_CADENCE_RPM ? record.cadence : null,
        speed: record.enhanced_speed || record.speed || null,
        distance: record.distance || null
      });
    }
  }

  return trackPoints;
}

/**
 * Extract ALL data points from FIT records (including those without GPS)
 * This is critical for indoor rides where we have power but no GPS
 */
function extractAllDataPoints(records) {
  const dataPoints = [];

  for (const record of records) {
    // Include ANY record that has useful data (power, HR, cadence, etc.)
    // Don't require GPS - indoor rides won't have it
    if (record.timestamp != null) {
      dataPoints.push({
        timestamp: record.timestamp instanceof Date
          ? record.timestamp.toISOString()
          : record.timestamp,
        power: record.power > 0 && record.power < MAX_VALID_POWER_WATTS ? record.power : null,
        heartRate: record.heart_rate > 0 && record.heart_rate < MAX_VALID_HR_BPM ? record.heart_rate : null,
        cadence: record.cadence > 0 && record.cadence < MAX_VALID_CADENCE_RPM ? record.cadence : null,
        speed: record.enhanced_speed ?? record.speed ?? null,
        distance: record.distance ?? null,
        elevation: record.enhanced_altitude ?? record.altitude ?? null,
        // Include GPS if available
        latitude: record.position_lat ?? null,
        longitude: record.position_long ?? null
      });
    }
  }

  return dataPoints;
}

/**
 * Extract summary data from FIT file
 */
function extractSummary(data) {
  const session = data.sessions?.[0];
  const fileId = data.file_id?.[0];
  const activity = data.activity?.[0];

  if (session) {
    // Helper to validate a value is within a reasonable range
    const validRange = (val, max) => (val > 0 && val < max) ? val : null;

    // Normalize the ride's start time to an ISO string, preferring the
    // session value but falling back to activity / first record timestamps
    // and guarding against the FIT protocol's sentinel/bad dates.
    const currentYear = new Date().getFullYear();
    const isValidDate = (d) => d && !Number.isNaN(d.getTime()) && d.getFullYear() >= 2010 && d.getFullYear() <= currentYear + 1;
    let startTime = null;
    const rawTs = session.start_time || activity?.timestamp || data.records?.[0]?.timestamp;
    if (rawTs instanceof Date) {
      if (isValidDate(rawTs)) startTime = rawTs.toISOString();
    } else if (typeof rawTs === 'string') {
      const d = new Date(rawTs);
      if (isValidDate(d)) startTime = d.toISOString();
    } else if (typeof rawTs === 'number') {
      const FIT_EPOCH = 631065600;
      let d;
      if (rawTs > 1e12) d = new Date(rawTs);
      else if (rawTs > 1e9) d = new Date(rawTs * 1000);
      else d = new Date((rawTs + FIT_EPOCH) * 1000);
      if (isValidDate(d)) startTime = d.toISOString();
    }

    return {
      totalDistance: session.total_distance || 0,
      totalTime: session.total_timer_time || session.total_elapsed_time || 0,
      totalElapsedTime: session.total_elapsed_time || session.total_timer_time || 0,
      totalAscent: session.total_ascent || 0,
      totalDescent: session.total_descent || 0,
      avgSpeed: session.avg_speed || null,
      maxSpeed: session.max_speed || null,
      avgHeartRate: validRange(session.avg_heart_rate, MAX_VALID_HR_BPM),
      maxHeartRate: validRange(session.max_heart_rate, MAX_VALID_HR_BPM),
      avgPower: validRange(session.avg_power, MAX_VALID_POWER_WATTS),
      maxPower: validRange(session.max_power, MAX_VALID_POWER_WATTS),
      avgCadence: validRange(session.avg_cadence, MAX_VALID_CADENCE_RPM),
      maxCadence: validRange(session.max_cadence, MAX_VALID_CADENCE_RPM),
      sport: session.sport || 'cycling',
      subSport: session.sub_sport || null,
      // Ride metadata used by the manual-upload endpoint to build the
      // activity row. Garmin/Wahoo callers ignore these extra fields.
      startTime,
      manufacturer: fileId?.manufacturer || null,
      product: fileId?.garmin_product || fileId?.product || null,
      serialNumber: fileId?.serial_number || null,
      // Power metrics from device (if available)
      normalizedPower: validRange(session.normalized_power, MAX_VALID_POWER_WATTS),
      trainingStressScore: session.training_stress_score || null,
      intensityFactor: session.intensity_factor || null,
      threshold_power: validRange(session.threshold_power, MAX_VALID_POWER_WATTS),
      totalWork: session.total_work || null, // joules from device
      totalCalories: session.total_calories || null
    };
  }

  return null;
}

/**
 * Calculate Normalized Power from power stream
 * NP = 4th root of average of (30-second rolling average)^4
 * This weights high-intensity efforts more heavily than simple average
 */
export function calculateNormalizedPower(powerValues) {
  if (!powerValues || powerValues.length < 30) {
    return null;
  }

  // Calculate 30-second rolling averages
  const rollingAvgs = [];
  for (let i = 29; i < powerValues.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) {
      sum += powerValues[j] || 0;
    }
    rollingAvgs.push(sum / 30);
  }

  if (rollingAvgs.length === 0) return null;

  // Calculate 4th power of each rolling average
  const fourthPowers = rollingAvgs.map(avg => Math.pow(avg, 4));

  // Average of 4th powers
  const avgFourthPower = fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // 4th root = Normalized Power
  return Math.round(Math.pow(avgFourthPower, 0.25));
}

/**
 * Calculate Mean Maximal Power (MMP) at a given duration
 * Returns the best average power for that duration
 */
function calculateMMP(powerValues, durationSeconds) {
  if (!powerValues || powerValues.length < durationSeconds) {
    return null;
  }

  let maxAvg = 0;
  let windowSum = 0;

  // Initialize first window
  for (let i = 0; i < durationSeconds; i++) {
    windowSum += powerValues[i] || 0;
  }
  maxAvg = windowSum / durationSeconds;

  // Slide window
  for (let i = durationSeconds; i < powerValues.length; i++) {
    windowSum = windowSum - (powerValues[i - durationSeconds] || 0) + (powerValues[i] || 0);
    const avg = windowSum / durationSeconds;
    if (avg > maxAvg) {
      maxAvg = avg;
    }
  }

  return Math.round(maxAvg);
}

/**
 * Calculate power curve summary (MMP at key durations)
 * This enables power curve analysis without storing full streams
 */
export function calculatePowerCurveSummary(powerValues) {
  if (!powerValues || powerValues.length < 5) {
    return null;
  }

  // Key durations for power curve (in seconds)
  const durations = {
    '1s': 1,
    '5s': 5,
    '10s': 10,
    '30s': 30,
    '60s': 60,
    '120s': 120,
    '300s': 300,   // 5 min
    '600s': 600,   // 10 min
    '1200s': 1200, // 20 min
    '1800s': 1800, // 30 min
    '3600s': 3600  // 60 min
  };

  const summary = {};

  for (const [label, seconds] of Object.entries(durations)) {
    const mmp = calculateMMP(powerValues, seconds);
    if (mmp !== null && mmp > 0) {
      summary[label] = mmp;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

/**
 * Extract power values from data points (1-second resolution assumed)
 * Works with both trackPoints (GPS) and allDataPoints (including indoor)
 */
function extractPowerStream(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return null;
  }

  // Filter out null/zero AND sentinel values (e.g., 65535 = 0xFFFF from FIT protocol)
  const powerValues = dataPoints
    .filter(p => p.power !== null && p.power !== undefined && p.power > 0 && p.power < MAX_VALID_POWER_WATTS)
    .map(p => p.power);

  return powerValues.length > 0 ? powerValues : null;
}

/**
 * Calculate average power from a power stream
 */
export function calculateAveragePower(powerValues) {
  if (!powerValues || powerValues.length === 0) {
    return null;
  }

  // Filter out zeros for average (zeros often indicate coasting/not pedaling)
  // But keep them for NP calculation (they affect the rolling average)
  const nonZeroPower = powerValues.filter(p => p > 0);

  if (nonZeroPower.length === 0) {
    return null;
  }

  const sum = nonZeroPower.reduce((a, b) => a + b, 0);
  return Math.round(sum / nonZeroPower.length);
}

/**
 * Encode GPS track points as a polyline string (Google polyline format)
 * This is the same format Strava uses for map_summary_polyline
 * @param {Array} trackPoints - Array of {latitude, longitude} objects
 * @param {number} precision - Coordinate precision (default 5 = 0.00001 degrees)
 * @returns {string|null} Encoded polyline string or null if no points
 */
export function encodePolyline(trackPoints, precision = 5) {
  if (!trackPoints || trackPoints.length === 0) {
    return null;
  }

  const factor = Math.pow(10, precision);
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of trackPoints) {
    if (point.latitude == null || point.longitude == null) continue;

    const lat = Math.round(point.latitude * factor);
    const lng = Math.round(point.longitude * factor);

    encoded += encodeSignedNumber(lat - prevLat);
    encoded += encodeSignedNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Encode a signed number for polyline
 */
function encodeSignedNumber(num) {
  let sgn_num = num << 1;
  if (num < 0) {
    sgn_num = ~sgn_num;
  }

  let encoded = '';
  while (sgn_num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (sgn_num & 0x1f)) + 63);
    sgn_num >>= 5;
  }
  encoded += String.fromCharCode(sgn_num + 63);
  return encoded;
}

/**
 * Simplify track points to reduce polyline size
 * Uses Ramer-Douglas-Peucker algorithm
 * @param {Array} points - Array of track points
 * @param {number} tolerance - Simplification tolerance in degrees (default ~11m)
 * @returns {Array} Simplified points
 */
export function simplifyTrack(points, tolerance = 0.0001) {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = simplifyTrack(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyTrack(points.slice(maxIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }

  // Otherwise, return just the endpoints
  return [first, last];
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(point.longitude - lineStart.longitude, 2) +
      Math.pow(point.latitude - lineStart.latitude, 2)
    );
  }

  const t = ((point.longitude - lineStart.longitude) * dx +
             (point.latitude - lineStart.latitude) * dy) / (dx * dx + dy * dy);

  const nearestX = lineStart.longitude + t * dx;
  const nearestY = lineStart.latitude + t * dy;

  return Math.sqrt(
    Math.pow(point.longitude - nearestX, 2) +
    Math.pow(point.latitude - nearestY, 2)
  );
}

/**
 * Build parallel metric arrays from simplified track points
 * Used for colored route rendering on the map (by speed, power, elevation, HR)
 * Returns null if fewer than 2 points
 */
export function buildActivityStreams(simplifiedPoints) {
  if (!simplifiedPoints || simplifiedPoints.length < 2) return null;

  const coords = [];
  const elevation = [];
  const power = [];
  const speed = [];
  const heartRate = [];
  const cadence = [];

  let hasElevation = false;
  let hasPower = false;
  let hasSpeed = false;
  let hasHeartRate = false;

  for (const pt of simplifiedPoints) {
    if (pt.latitude == null || pt.longitude == null) continue;

    coords.push([pt.longitude, pt.latitude]);
    elevation.push(pt.elevation ?? null);
    power.push(pt.power ?? null);
    speed.push(pt.speed ?? null);
    heartRate.push(pt.heartRate ?? null);
    cadence.push(pt.cadence ?? null);

    if (pt.elevation != null) hasElevation = true;
    if (pt.power != null) hasPower = true;
    if (pt.speed != null) hasSpeed = true;
    if (pt.heartRate != null) hasHeartRate = true;
  }

  if (coords.length < 2) return null;

  // Only include streams that have data
  const streams = { coords };
  if (hasElevation) streams.elevation = elevation;
  if (hasPower) streams.power = power;
  if (hasSpeed) streams.speed = speed;
  if (hasHeartRate) streams.heartRate = heartRate;

  return streams;
}

/**
 * Build metric streams from allDataPoints (no GPS required).
 * Uses point index as implicit time axis.
 * Fallback for indoor rides or when GPS simplification drops too many points.
 */
export function buildActivityStreamsFromDataPoints(allDataPoints) {
  if (!allDataPoints || allDataPoints.length < 2) return null;

  const power = [];
  const speed = [];
  const heartRate = [];
  const cadence = [];
  const elevation = [];

  let hasPower = false, hasSpeed = false, hasHeartRate = false, hasElevation = false;

  for (const pt of allDataPoints) {
    power.push(pt.power ?? null);
    speed.push(pt.speed ?? null);
    heartRate.push(pt.heartRate ?? null);
    cadence.push(pt.cadence ?? null);
    elevation.push(pt.elevation ?? null);

    if (pt.power != null) hasPower = true;
    if (pt.speed != null) hasSpeed = true;
    if (pt.heartRate != null) hasHeartRate = true;
    if (pt.elevation != null) hasElevation = true;
  }

  if (!hasPower && !hasSpeed && !hasHeartRate) return null;

  const streams = {};
  if (hasPower) streams.power = power;
  if (hasSpeed) streams.speed = speed;
  if (hasHeartRate) streams.heartRate = heartRate;
  if (hasPower || hasHeartRate) streams.cadence = cadence;
  if (hasElevation) streams.elevation = elevation;

  return streams;
}

/**
 * Parse a raw FIT file buffer and run the full analytics pipeline:
 * polyline encoding, activity streams, advanced ride analytics, and the deep
 * FIT coach context. Used by every ingestion path (Garmin, Wahoo, manual
 * upload) so they all emit identical row shapes.
 *
 * @param {Buffer|ArrayBuffer} fitBuffer - Raw FIT file bytes (already decompressed)
 * @param {Object} [athlete] - Optional athlete profile for FIT coach context
 * @param {number} [athlete.ftp] - Functional Threshold Power (watts)
 * @param {number} [athlete.maxHR] - Maximum heart rate (bpm)
 * @param {Object} [athlete.powerZones] - user_profiles.power_zones shape { z1:{min,max}, ..., z7:{min,max} }
 * @returns {Promise<{polyline: string|null, activityStreams: Object|null, summary: Object|null, powerMetrics: Object|null, rideAnalytics: Object|null, fitCoachContext: Object|null, pointCount: number, simplifiedCount: number, hasPowerData: boolean, error: string|null}>}
 */
export async function parseFitBuffer(fitBuffer, athlete = null) {
  try {
    const buf = Buffer.isBuffer(fitBuffer) ? fitBuffer : Buffer.from(fitBuffer);

    const parsed = await parseFitFile(buf);

    console.log(`📍 FIT file parsed: ${parsed.trackPoints.length} GPS points, ${parsed.recordCount} total records`);

    let polyline = null;
    let activityStreams = null;
    let simplifiedCount = 0;

    if (parsed.hasGpsData) {
      const simplified = simplifyTrack(parsed.trackPoints);
      simplifiedCount = simplified.length;
      console.log(`📉 Track simplified: ${parsed.trackPoints.length} → ${simplified.length} points`);

      polyline = encodePolyline(simplified);
      activityStreams = buildActivityStreams(simplified);
    } else {
      console.log('ℹ️ FIT file has no GPS data (indoor activity?)');
    }

    // Fallback: build metric streams from allDataPoints when GPS-based streams unavailable
    if (!activityStreams && parsed.allDataPoints?.length >= 2) {
      activityStreams = buildActivityStreamsFromDataPoints(parsed.allDataPoints);
      if (activityStreams) {
        console.log(`📊 Built metric streams from ${parsed.allDataPoints.length} data points (no GPS coords)`);
      }
    }

    // Build the deep AI coach analysis context (resampled uniform-interval
    // time series + decoupling, dropouts, power-zone distribution, cadence
    // bands). Persisted on activities.fit_coach_context for lazy generation
    // of the long-form ride analysis narrative.
    let fitCoachContext = null;
    try {
      if (parsed.allDataPoints?.length >= 60) {
        fitCoachContext = buildFitCoachContext({
          allDataPoints: parsed.allDataPoints,
          ftp: athlete?.ftp ?? parsed.summary?.threshold_power ?? null,
          maxHR: athlete?.maxHR ?? parsed.summary?.maxHeartRate ?? null,
          powerZones: athlete?.powerZones ?? null,
        });
        if (fitCoachContext) {
          console.log(`🧠 FIT coach context built: ${fitCoachContext.sample_count} samples @ ${fitCoachContext.interval_seconds}s`);
        }
      }
    } catch (coachCtxError) {
      console.warn('⚠️ FIT coach context build failed (non-fatal):', coachCtxError.message);
    }

    return {
      polyline,
      activityStreams,
      summary: parsed.summary,
      powerMetrics: parsed.powerMetrics,
      rideAnalytics: parsed.rideAnalytics,
      fitCoachContext,
      pointCount: parsed.trackPoints.length,
      simplifiedCount,
      hasPowerData: parsed.hasPowerData,
      error: null
    };
  } catch (error) {
    console.error('❌ FIT file processing error:', error.message);
    return {
      polyline: null,
      activityStreams: null,
      summary: null,
      powerMetrics: null,
      rideAnalytics: null,
      fitCoachContext: null,
      pointCount: 0,
      simplifiedCount: 0,
      hasPowerData: false,
      error: error.message
    };
  }
}

/**
 * Download and parse a FIT file from URL, returning encoded polyline and full
 * analytics. Thin wrapper around parseFitBuffer that handles the network step.
 * @param {string} url - URL to download FIT file from
 * @param {string} accessToken - Bearer token for authentication
 * @param {Object} [athlete] - Optional athlete profile for FIT coach context
 * @param {number} [athlete.ftp] - Functional Threshold Power (watts)
 * @param {number} [athlete.maxHR] - Maximum heart rate (bpm)
 * @param {Object} [athlete.powerZones] - user_profiles.power_zones shape { z1:{min,max}, ..., z7:{min,max} }
 * @returns {Promise<Object>} Same shape as parseFitBuffer, or an error object on download failure
 */
// FIT files from Garmin/Wahoo are typically 50KB–2MB. A 30 s ceiling means
// a hung download can't eat the entire 60 s function budget — without this,
// one slow FIT fetch in a batch stalled every following event in the queue
// behind it. Kept generous so legitimately large multi-hour activity files
// (rare, but happen on 6+ hour rides at 1 s sample rate) still succeed.
const FIT_DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Download a FIT file from a URL (typically a Garmin callbackURL or Wahoo file
 * link), optionally retain the raw bytes to Supabase Storage, then parse.
 *
 * Why retain: Garmin callbackURLs expire 24h after issue and return 410 on
 * re-fetch. Once we miss the window OR our parser fails on the file, the data
 * is unrecoverable. Retaining the bytes lets us reprocess any past activity
 * with a newer parser, without depending on Garmin.
 *
 * @param {string} url - Pre-signed Garmin URL (or Wahoo file link).
 * @param {string} accessToken - OAuth Bearer token for the partner.
 * @param {object|null} athlete - Athlete profile for power-zone calculations.
 * @param {object|null} storageOptions - When provided, the downloaded bytes are
 *   uploaded to Supabase Storage and the returned object includes
 *   `fit_storage_path`. Required keys:
 *     - supabase: a Supabase client (admin/service role)
 *     - userId: the Tribos user_id (string UUID)
 *     - activityId: the activities.id (string UUID; used as the object key)
 *     - bucket: optional, defaults to 'garmin-fit'
 *   If omitted, no upload happens (backwards-compatible).
 * @returns {Promise<object>} Same parseFitBuffer shape, plus optional
 *   `fit_storage_path` and possibly `error`.
 */
export async function downloadAndParseFitFile(url, accessToken, athlete = null, storageOptions = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIT_DOWNLOAD_TIMEOUT_MS);
  try {
    console.log('📥 Downloading FIT file...');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/octet-stream, application/fit, */*'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FIT file download failed:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 200)
      });
      return {
        polyline: null,
        summary: null,
        error: `Download failed: ${response.status} ${response.statusText}`
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    console.log(`📦 FIT file downloaded: ${(fileSize / 1024).toFixed(1)} KB`);

    if (fileSize < 12) {
      return {
        polyline: null,
        summary: null,
        error: 'FIT file too small to be valid'
      };
    }

    const fitBuffer = Buffer.from(arrayBuffer);

    // Retain the raw bytes BEFORE parsing. If parse fails or yields nothing,
    // we still have the file for future reprocessing. Upload failure is
    // non-fatal — we log and continue with parse.
    let fit_storage_path = null;
    if (storageOptions?.supabase && storageOptions?.userId && storageOptions?.activityId) {
      const bucket = storageOptions.bucket || 'garmin-fit';
      const objectKey = `garmin/${storageOptions.userId}/${storageOptions.activityId}.fit`;
      try {
        const { error: uploadErr } = await storageOptions.supabase.storage
          .from(bucket)
          .upload(objectKey, fitBuffer, {
            contentType: 'application/octet-stream',
            upsert: true,            // re-uploads (e.g. reprocessing) overwrite
            cacheControl: 'private, max-age=0'
          });
        if (uploadErr) {
          console.warn(`⚠️ FIT retention to Storage failed (non-fatal): ${uploadErr.message}`);
        } else {
          fit_storage_path = objectKey;
          console.log(`💾 Retained FIT bytes: ${objectKey} (${(fileSize / 1024).toFixed(1)} KB)`);
        }
      } catch (storageErr) {
        console.warn(`⚠️ FIT retention threw (non-fatal): ${storageErr.message}`);
      }
    }

    const parsed = await parseFitBuffer(fitBuffer, athlete);
    return fit_storage_path ? { ...parsed, fit_storage_path } : parsed;
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const msg = isTimeout
      ? `FIT download timed out after ${FIT_DOWNLOAD_TIMEOUT_MS / 1000}s`
      : error.message;
    console.error('❌ FIT file download/processing error:', msg);
    return {
      polyline: null,
      summary: null,
      powerMetrics: null,
      error: msg,
      timedOut: isTimeout || undefined,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  parseFitFile,
  parseFitBuffer,
  encodePolyline,
  simplifyTrack,
  downloadAndParseFitFile
};
