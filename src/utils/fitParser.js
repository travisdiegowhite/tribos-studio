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

  // Get timestamp
  let startTime = null;
  if (session?.start_time) {
    startTime = session.start_time instanceof Date
      ? session.start_time.toISOString()
      : session.start_time;
  } else if (activity?.timestamp) {
    startTime = activity.timestamp instanceof Date
      ? activity.timestamp.toISOString()
      : activity.timestamp;
  } else if (data.records?.[0]?.timestamp) {
    startTime = data.records[0].timestamp instanceof Date
      ? data.records[0].timestamp.toISOString()
      : data.records[0].timestamp;
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
 * Convert FIT data to strava_rides format for database storage
 */
export function fitToStravaRidesFormat(fitData, userId) {
  const { metadata, summary, trackPoints } = fitData;

  // Calculate TSS estimate if we have power data
  let estimatedTss = null;
  if (summary.normalizedPower && summary.totalMovingTime) {
    // TSS = (duration_seconds * NP * IF) / (FTP * 3600) * 100
    // Without FTP, estimate based on IF if available
    if (summary.intensityFactor) {
      estimatedTss = (summary.totalMovingTime * summary.normalizedPower * summary.intensityFactor) / 3600;
    }
  }

  return {
    user_id: userId,
    strava_id: null, // Not from Strava
    name: metadata.name,
    sport_type: metadata.sport === 'cycling' ? 'Ride' : metadata.sport,
    workout_type: null,
    start_date_local: metadata.startTime,
    distance: summary.totalDistance * 1000, // Convert back to meters
    moving_time: summary.totalMovingTime,
    elapsed_time: summary.totalElapsedTime || summary.totalMovingTime,
    total_elevation_gain: summary.totalAscent,
    average_speed: summary.avgSpeed / 3.6, // Convert to m/s
    max_speed: summary.maxSpeed / 3.6,
    average_heartrate: summary.avgHeartRate,
    max_heartrate: summary.maxHeartRate,
    average_watts: summary.avgPower,
    max_watts: summary.maxPower,
    weighted_average_watts: summary.normalizedPower,
    average_cadence: summary.avgCadence,
    kilojoules: summary.totalCalories ? summary.totalCalories * 4.184 : null,
    suffer_score: null,
    estimated_tss: estimatedTss,
    data_source: 'fit_upload',
    device_name: metadata.manufacturer,
    map_polyline: trackPoints.length > 0 ? encodePolyline(trackPoints) : null
  };
}

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
