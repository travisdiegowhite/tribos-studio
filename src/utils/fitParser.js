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
