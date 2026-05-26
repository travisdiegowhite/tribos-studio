// FIT File Parser Utility
// Parses .fit files from Garmin, Wahoo, and other cycling computers
// Uses easy-fit for browser compatibility

import EasyFit from 'easy-fit';
import pako from 'pako';

/**
 * Parse a FIT file buffer and extract activity data
 * @param {ArrayBuffer} fitBuffer - The raw FIT file data
 * @param {boolean} isCompressed - Whether the file is gzip compressed
 * @returns {Promise<Object>} Parsed activity data
 */
export function parseFitFile(fitBuffer, isCompressed = false) {
  return new Promise((resolve, reject) => {
    try {
      let processedBuffer = fitBuffer;

      // Decompress if needed (some .fit.gz files)
      if (isCompressed) {
        try {
          processedBuffer = pako.inflate(new Uint8Array(fitBuffer)).buffer;
        } catch (decompressError) {
          reject(new Error(`Failed to decompress FIT file: ${decompressError.message}`));
          return;
        }
      }

      const easyFit = new EasyFit({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list'
      });

      easyFit.parse(processedBuffer, (error, data) => {
        if (error) {
          reject(new Error(`Failed to parse FIT file: ${error.message}`));
          return;
        }

        try {
          const result = {
            metadata: extractMetadata(data),
            summary: extractSummary(data),
            trackPoints: extractTrackPoints(data.records || []),
            laps: extractLaps(data.laps || []),
            rawData: {
              sessions: data.sessions?.length || 0,
              records: data.records?.length || 0,
              laps: data.laps?.length || 0
            }
          };

          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to process FIT data: ${parseError.message}`));
        }
      });
    } catch (error) {
      reject(new Error(`FIT parser initialization failed: ${error.message}`));
    }
  });
}

/**
 * FIT file_id.type enum → string. Spec values from the FIT Profile.
 * Only the values we expect to see in a Garmin export are mapped; anything
 * else returns 'unknown' and the caller can decide what to do.
 */
const FIT_TYPE_NAMES = {
  1: 'device',
  2: 'settings',
  3: 'sport',
  4: 'activity',
  5: 'workout',
  6: 'course',
  7: 'schedules',
  9: 'weight',
  10: 'totals',
  11: 'goals',
  14: 'bike_profile',
  15: 'monitoring_a',
  17: 'activity_summary',
  20: 'monitoring_daily',
  28: 'monitoring_b',
  32: 'segment',
  34: 'segment_list',
  40: 'exd_configuration',
};

const FIT_EPOCH_SECONDS = 631065600; // 1989-12-31 00:00:00 UTC, Unix seconds

/**
 * Read ONLY the file_id message from a FIT file and return its `type` enum
 * (as a string) plus its `time_created` (as Unix seconds). Reads just the
 * first ~50 bytes of the data section — does NOT walk the entire file like
 * easy-fit does. Built for bulk filtering during Garmin export import,
 * where parsing 26 K full FITs is prohibitively slow.
 *
 * Returns:
 *   { ok: true,  type: 'activity'|…, timeCreatedSeconds: number|null }
 *   { ok: false }   on malformed input
 */
export function peekFitHeader(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 14) return { ok: false };

  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) return { ok: false };
  // ".FIT" magic at bytes 8..11
  if (bytes[8] !== 0x2E || bytes[9] !== 0x46 || bytes[10] !== 0x49 || bytes[11] !== 0x54) {
    return { ok: false };
  }

  const dataSize = view.getUint32(4, true); // little-endian per FIT spec
  const endPos = Math.min(headerSize + dataSize, bytes.length);

  // Definitions keyed by local_message_type.
  const definitions = {};

  let pos = headerSize;
  // Bound iteration to avoid pathological loops on malformed input.
  let safety = 64; // file_id is always one of the first few records
  while (pos < endPos && safety-- > 0) {
    const recordHeader = bytes[pos];
    pos += 1;

    if ((recordHeader & 0x80) !== 0) {
      // Compressed timestamp header — bits 5-6 are local_message_type.
      const localMsgType = (recordHeader >> 5) & 0x03;
      const def = definitions[localMsgType];
      if (!def) return { ok: false };
      pos += def.totalSize;
      continue;
    }

    const isDefinition = (recordHeader & 0x40) !== 0;
    const hasDevData = (recordHeader & 0x20) !== 0;
    const localMsgType = recordHeader & 0x0F;

    if (isDefinition) {
      if (pos + 5 > bytes.length) return { ok: false };
      pos += 1; // reserved
      const arch = bytes[pos];
      pos += 1;
      const littleEndian = arch === 0;
      const globalMsgNum = view.getUint16(pos, littleEndian);
      pos += 2;
      const numFields = bytes[pos];
      pos += 1;
      if (pos + numFields * 3 > bytes.length) return { ok: false };

      const fields = new Array(numFields);
      let totalSize = 0;
      for (let i = 0; i < numFields; i++) {
        const defNum = bytes[pos];
        const size = bytes[pos + 1];
        const baseType = bytes[pos + 2];
        fields[i] = { defNum, size, baseType };
        totalSize += size;
        pos += 3;
      }
      if (hasDevData) {
        if (pos + 1 > bytes.length) return { ok: false };
        const numDevFields = bytes[pos];
        pos += 1;
        if (pos + numDevFields * 3 > bytes.length) return { ok: false };
        for (let i = 0; i < numDevFields; i++) {
          totalSize += bytes[pos + 1]; // size byte
          pos += 3;
        }
      }
      definitions[localMsgType] = { littleEndian, globalMsgNum, fields, totalSize };
      continue;
    }

    // Data message — look up its definition.
    const def = definitions[localMsgType];
    if (!def) return { ok: false };
    if (pos + def.totalSize > bytes.length) return { ok: false };

    if (def.globalMsgNum === 0) {
      // file_id! Walk the fields and pull out type + time_created.
      let fileType = null;
      let timeCreated = null;
      let fieldPos = pos;
      for (const field of def.fields) {
        if (field.defNum === 0 && field.size === 1) {
          fileType = bytes[fieldPos];
        } else if (field.defNum === 4 && field.size === 4) {
          timeCreated = view.getUint32(fieldPos, def.littleEndian);
        }
        fieldPos += field.size;
      }
      const typeName = fileType != null ? (FIT_TYPE_NAMES[fileType] || 'unknown') : 'unknown';
      const timeCreatedSeconds = (timeCreated != null && timeCreated !== 0 && timeCreated !== 0xFFFFFFFF)
        ? timeCreated + FIT_EPOCH_SECONDS
        : null;
      return { ok: true, type: typeName, timeCreatedSeconds };
    }

    pos += def.totalSize;
  }

  return { ok: false };
}

/**
 * Lightweight peek that parses a FIT file and returns just its declared
 * file_id.type (e.g. 'activity', 'monitoring_b', 'settings', 'workout',
 * 'course', 'sport', 'device', …) and the first session sport if present.
 * Used by the Garmin bulk-import path to skip non-activity FITs locally
 * before uploading them to /api/fit-upload.js.
 */
export function peekFitType(fitBuffer, isCompressed = false) {
  return new Promise((resolve, reject) => {
    try {
      let processedBuffer = fitBuffer;
      if (isCompressed) {
        try {
          processedBuffer = pako.inflate(new Uint8Array(fitBuffer)).buffer;
        } catch (decompressError) {
          reject(new Error(`Failed to decompress FIT file: ${decompressError.message}`));
          return;
        }
      }

      const easyFit = new EasyFit({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list',
      });

      easyFit.parse(processedBuffer, (error, data) => {
        if (error) {
          reject(new Error(`Failed to parse FIT file: ${error.message}`));
          return;
        }
        resolve({
          type: data.file_id?.[0]?.type || null,
          sport: data.sessions?.[0]?.sport || null,
        });
      });
    } catch (error) {
      reject(new Error(`FIT parser initialization failed: ${error.message}`));
    }
  });
}

/**
 * Extract metadata from FIT file
 */
function extractMetadata(data) {
  const activity = data.activity?.[0];
  const session = data.sessions?.[0];
  const fileId = data.file_id?.[0];

  // Determine activity name
  let name = 'FIT Activity';
  if (session?.sport) {
    const sport = session.sport.charAt(0).toUpperCase() + session.sport.slice(1);
    name = `${sport} Activity`;
  }

  // Get timestamp - handle various formats
  let startTime = null;
  const rawTimestamp = session?.start_time || activity?.timestamp || data.records?.[0]?.timestamp;

  // Helper to validate date is in reasonable range (2010 to next year)
  const currentYear = new Date().getFullYear();
  const isValidDate = (date) => {
    if (!date || isNaN(date.getTime())) return false;
    const year = date.getFullYear();
    return year >= 2010 && year <= currentYear + 1;
  };

  if (rawTimestamp) {
    if (rawTimestamp instanceof Date) {
      // Already a Date object
      if (isValidDate(rawTimestamp)) {
        startTime = rawTimestamp.toISOString();
      }
    } else if (typeof rawTimestamp === 'string') {
      // String timestamp - validate it
      const parsed = new Date(rawTimestamp);
      if (isValidDate(parsed)) {
        startTime = parsed.toISOString();
      }
    } else if (typeof rawTimestamp === 'number') {
      // Numeric timestamp - could be seconds or milliseconds
      // FIT epoch is Dec 31, 1989 00:00:00 UTC
      const FIT_EPOCH = 631065600; // Seconds from Unix epoch to FIT epoch
      let date;
      if (rawTimestamp > 1e12) {
        // Milliseconds
        date = new Date(rawTimestamp);
      } else if (rawTimestamp > 1e9) {
        // Seconds since Unix epoch
        date = new Date(rawTimestamp * 1000);
      } else {
        // Seconds since FIT epoch
        date = new Date((rawTimestamp + FIT_EPOCH) * 1000);
      }
      if (isValidDate(date)) {
        startTime = date.toISOString();
      }
    }
  }

  return {
    name,
    startTime,
    sport: session?.sport || 'cycling',
    subSport: session?.sub_sport || null,
    manufacturer: fileId?.manufacturer || 'Unknown',
    product: fileId?.garmin_product || fileId?.product || null,
    serialNumber: fileId?.serial_number || null
  };
}

/**
 * Extract summary statistics from FIT file
 */
function extractSummary(data) {
  const session = data.sessions?.[0];

  if (session) {
    return {
      totalDistance: session.total_distance ? session.total_distance / 1000 : 0, // Convert to km
      totalMovingTime: session.total_moving_time || session.total_timer_time || 0,
      totalElapsedTime: session.total_elapsed_time || 0,
      totalAscent: session.total_ascent || 0,
      totalDescent: session.total_descent || 0,
      avgSpeed: session.avg_speed ? session.avg_speed * 3.6 : 0, // Convert m/s to km/h
      maxSpeed: session.max_speed ? session.max_speed * 3.6 : 0,
      avgHeartRate: session.avg_heart_rate || null,
      maxHeartRate: session.max_heart_rate || null,
      avgPower: session.avg_power || null,
      maxPower: session.max_power || null,
      normalizedPower: session.normalized_power || null,
      avgCadence: session.avg_cadence || null,
      maxCadence: session.max_cadence || null,
      totalCalories: session.total_calories || null,
      trainingStressScore: session.training_stress_score || null,
      intensityFactor: session.intensity_factor || null
    };
  }

  // Calculate from track points if no session data
  return calculateSummaryFromPoints(data.records || []);
}

/**
 * Extract track points from FIT records
 */
function extractTrackPoints(records) {
  const trackPoints = [];

  records.forEach((record, index) => {
    // Only include records with position data
    if (record.position_lat != null && record.position_long != null) {
      trackPoints.push({
        latitude: record.position_lat,
        longitude: record.position_long,
        elevation: record.enhanced_altitude || record.altitude || null,
        timestamp: record.timestamp instanceof Date
          ? record.timestamp.toISOString()
          : record.timestamp,
        heartRate: record.heart_rate || null,
        power: record.power || null,
        cadence: record.cadence || null,
        speed: record.enhanced_speed || record.speed
          ? (record.enhanced_speed || record.speed) * 3.6
          : null, // Convert to km/h
        temperature: record.temperature || null,
        distance: record.distance ? record.distance / 1000 : null // Convert to km
      });
    }
  });

  return trackPoints;
}

/**
 * Extract lap data from FIT file
 */
function extractLaps(laps) {
  return laps.map((lap, index) => ({
    lapNumber: index + 1,
    startTime: lap.start_time instanceof Date
      ? lap.start_time.toISOString()
      : lap.start_time,
    totalDistance: lap.total_distance ? lap.total_distance / 1000 : 0,
    totalTime: lap.total_timer_time || lap.total_elapsed_time || 0,
    avgSpeed: lap.avg_speed ? lap.avg_speed * 3.6 : null,
    maxSpeed: lap.max_speed ? lap.max_speed * 3.6 : null,
    avgHeartRate: lap.avg_heart_rate || null,
    maxHeartRate: lap.max_heart_rate || null,
    avgPower: lap.avg_power || null,
    maxPower: lap.max_power || null,
    avgCadence: lap.avg_cadence || null,
    totalAscent: lap.total_ascent || null,
    totalDescent: lap.total_descent || null
  }));
}

/**
 * Calculate summary from track points when session data is missing
 */
function calculateSummaryFromPoints(records) {
  if (!records || records.length < 2) {
    return {
      totalDistance: 0,
      totalMovingTime: 0,
      totalAscent: 0,
      totalDescent: 0,
      avgSpeed: 0,
      maxSpeed: 0
    };
  }

  let totalDistance = 0;
  let totalAscent = 0;
  let totalDescent = 0;
  let maxSpeed = 0;
  const heartRates = [];
  const powers = [];
  const cadences = [];

  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const curr = records[i];

    // Calculate distance using Haversine formula
    if (prev.position_lat && prev.position_long && curr.position_lat && curr.position_long) {
      totalDistance += haversineDistance(
        prev.position_lat, prev.position_long,
        curr.position_lat, curr.position_long
      );
    }

    // Track elevation changes
    const prevElev = prev.enhanced_altitude || prev.altitude;
    const currElev = curr.enhanced_altitude || curr.altitude;
    if (prevElev != null && currElev != null) {
      const elevDiff = currElev - prevElev;
      if (elevDiff > 0) {
        totalAscent += elevDiff;
      } else {
        totalDescent += Math.abs(elevDiff);
      }
    }

    // Track max speed
    const speed = (curr.enhanced_speed || curr.speed || 0) * 3.6;
    if (speed > maxSpeed) maxSpeed = speed;

    // Collect metrics
    if (curr.heart_rate) heartRates.push(curr.heart_rate);
    if (curr.power) powers.push(curr.power);
    if (curr.cadence) cadences.push(curr.cadence);
  }

  // Calculate duration
  let totalTime = 0;
  const first = records[0];
  const last = records[records.length - 1];
  if (first.timestamp && last.timestamp) {
    const start = first.timestamp instanceof Date ? first.timestamp : new Date(first.timestamp);
    const end = last.timestamp instanceof Date ? last.timestamp : new Date(last.timestamp);
    totalTime = (end - start) / 1000;
  }

  const avgSpeed = totalTime > 0 ? (totalDistance / 1000) / (totalTime / 3600) : 0;

  return {
    totalDistance: totalDistance / 1000, // Convert to km
    totalMovingTime: totalTime,
    totalElapsedTime: totalTime,
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    avgHeartRate: heartRates.length > 0
      ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
      : null,
    maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : null,
    avgPower: powers.length > 0
      ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
      : null,
    maxPower: powers.length > 0 ? Math.max(...powers) : null,
    avgCadence: cadences.length > 0
      ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
      : null,
    maxCadence: cadences.length > 0 ? Math.max(...cadences) : null
  };
}

/**
 * Calculate Haversine distance between two points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert FIT data to activities table format for database storage
 * @param {Object} fitData - Parsed FIT file data
 * @param {string} userId - User ID for the activity
 * @param {string} [fileName] - Optional original filename for better naming
 * @param {string} [stravaActivityName] - Optional actual Strava activity name from activities.csv
 */
export function fitToActivityFormat(fitData, userId, fileName = null, stravaActivityName = null) {
  const { metadata, summary, trackPoints, laps } = fitData;

  // Generate activity name - prefer Strava activity name if provided
  let activityName = metadata.name;

  // Use actual Strava activity name if provided (from activities.csv)
  if (stravaActivityName) {
    activityName = stravaActivityName;
  }
  // Otherwise, if we have a filename and the metadata name is generic, try to create a better name
  else if (fileName && (activityName === 'FIT Activity' || activityName.endsWith(' Activity'))) {
    // Clean up the filename - remove extension and path
    let cleanName = fileName.replace(/\.(fit|fit\.gz)$/i, '').split('/').pop();

    // If filename is just a number (Strava export style like "12345678901"),
    // create a date-based name instead
    if (/^\d+$/.test(cleanName)) {
      const date = metadata.startTime ? new Date(metadata.startTime) : new Date();
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const sport = metadata.sport || 'cycling';
      const sportName = sport.charAt(0).toUpperCase() + sport.slice(1);
      activityName = `${sportName} - ${dateStr}`;
    } else {
      // Use the cleaned filename as the name
      activityName = cleanName
        .replace(/[-_]/g, ' ')  // Replace dashes and underscores with spaces
        .replace(/\s+/g, ' ')    // Normalize multiple spaces
        .trim();
    }
  }

  // Generate a unique provider_activity_id for FIT uploads
  const timestamp = metadata.startTime ? new Date(metadata.startTime).getTime() : Date.now();
  const providerActivityId = `fit_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

  // Determine activity type
  let activityType = 'Ride';
  if (metadata.sport === 'cycling' || metadata.sport === 'biking') {
    activityType = 'Ride';
  } else if (metadata.sport === 'running') {
    activityType = 'Run';
  } else if (metadata.sport === 'swimming') {
    activityType = 'Swim';
  } else if (metadata.sport) {
    activityType = metadata.sport.charAt(0).toUpperCase() + metadata.sport.slice(1);
  }

  // Store extended data in raw_data JSONB
  const rawData = {
    source: 'fit_upload',
    device: metadata.manufacturer,
    product: metadata.product,
    serial_number: metadata.serialNumber,
    sub_sport: metadata.subSport,
    max_watts: summary.maxPower,
    normalized_power: summary.normalizedPower,
    average_cadence: summary.avgCadence,
    max_cadence: summary.maxCadence,
    training_stress_score: summary.trainingStressScore,
    intensity_factor: summary.intensityFactor,
    total_descent: summary.totalDescent,
    laps: laps
  };

  // Validate and sanitize values to prevent corrupt data
  // Max reasonable values: 500km distance, 24hr duration, 2000W power, 250bpm HR
  const sanitize = (val, max, defaultVal = null) => {
    if (val == null || isNaN(val) || val < 0 || val > max) return defaultVal;
    return val;
  };

  const distance = sanitize(summary.totalDistance * 1000, 500000, 0); // Max 500km
  const movingTime = sanitize(Math.round(summary.totalMovingTime), 86400, 0); // Max 24 hours
  const elapsedTime = sanitize(Math.round(summary.totalElapsedTime || summary.totalMovingTime), 172800, movingTime); // Max 48 hours
  const elevGain = sanitize(summary.totalAscent, 6000, 0); // Max 6km elevation (~20,000 ft)
  const avgSpeed = sanitize(summary.avgSpeed / 3.6, 30, null); // Max 108 km/h = 30 m/s
  const maxSpeedVal = sanitize(summary.maxSpeed / 3.6, 50, null); // Max 180 km/h = 50 m/s
  const avgPower = sanitize(summary.avgPower, 2000, null); // Max 2000W
  const avgHR = sanitize(summary.avgHeartRate, 250, null); // Max 250 bpm
  const maxHR = sanitize(summary.maxHeartRate, 250, null);

  return {
    user_id: userId,
    provider: 'fit_upload',
    provider_activity_id: providerActivityId,
    name: activityName,
    type: activityType,
    sport_type: metadata.sport || 'cycling',
    start_date: metadata.startTime,
    start_date_local: metadata.startTime,
    distance: distance,
    moving_time: movingTime,
    elapsed_time: elapsedTime,
    total_elevation_gain: elevGain,
    average_speed: avgSpeed,
    max_speed: maxSpeedVal,
    average_watts: avgPower,
    // Work (kJ) = mechanical work from power, not metabolic calories
    kilojoules: (avgPower && movingTime) ? Math.round(avgPower * movingTime / 1000) : null,
    average_heartrate: avgHR,
    max_heartrate: maxHR,
    suffer_score: null,
    workout_type: null,
    trainer: false,
    commute: false,
    gear_id: null,
    map_summary_polyline: trackPoints.length > 0 ? encodePolyline(trackPoints) : null,
    raw_data: rawData
  };
}

// Aliases for backwards compatibility
export const fitToStravaActivitiesFormat = fitToActivityFormat;
export const fitToStravaRidesFormat = fitToActivityFormat;

/**
 * Simple polyline encoder for track points
 */
function encodePolyline(trackPoints) {
  if (!trackPoints || trackPoints.length === 0) return null;

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of trackPoints) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeNumber(num) {
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

export default parseFitFile;
