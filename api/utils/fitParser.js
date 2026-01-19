// Server-side FIT File Parser
// Parses FIT files from Garmin to extract GPS data and encode as polyline
// Used by Garmin webhook to get route data from activities

import EasyFit from 'easy-fit';

/**
 * Parse a FIT file buffer and extract GPS track points
 * @param {Buffer|ArrayBuffer} fitBuffer - The raw FIT file data
 * @returns {Promise<Object>} Parsed data with trackPoints and summary
 */
export function parseFitFile(fitBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const easyFit = new EasyFit({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list'
      });

      // Convert Buffer to ArrayBuffer if needed
      let arrayBuffer = fitBuffer;
      if (Buffer.isBuffer(fitBuffer)) {
        arrayBuffer = fitBuffer.buffer.slice(
          fitBuffer.byteOffset,
          fitBuffer.byteOffset + fitBuffer.byteLength
        );
      }

      easyFit.parse(arrayBuffer, (error, data) => {
        if (error) {
          reject(new Error(`Failed to parse FIT file: ${error.message}`));
          return;
        }

        try {
          const trackPoints = extractTrackPoints(data.records || []);
          const summary = extractSummary(data);

          // Extract power stream and calculate metrics
          const powerStream = extractPowerStream(trackPoints);
          let powerMetrics = null;

          if (powerStream && powerStream.length > 0) {
            // Use device-calculated NP if available, otherwise calculate from stream
            const normalizedPower = summary?.normalizedPower || calculateNormalizedPower(powerStream);
            const powerCurveSummary = calculatePowerCurveSummary(powerStream);

            // Calculate max power from stream (more accurate than summary which might be smoothed)
            const maxPowerFromStream = powerStream.length > 0 ? Math.max(...powerStream) : null;

            powerMetrics = {
              normalizedPower,
              maxPower: maxPowerFromStream || summary?.maxPower || null,
              avgPower: summary?.avgPower || null,
              trainingStressScore: summary?.trainingStressScore || null,
              intensityFactor: summary?.intensityFactor || null,
              thresholdPower: summary?.threshold_power || null,
              powerCurveSummary,
              hasPowerData: true,
              powerSampleCount: powerStream.length
            };

            console.log(`⚡ Power metrics extracted: NP=${normalizedPower}W, Max=${powerMetrics.maxPower}W, Samples=${powerStream.length}`);
          }

          resolve({
            trackPoints,
            summary,
            powerMetrics,
            recordCount: data.records?.length || 0,
            hasGpsData: trackPoints.length > 0,
            hasPowerData: powerMetrics?.hasPowerData || false
          });
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
 * Extract GPS track points from FIT records
 */
function extractTrackPoints(records) {
  const trackPoints = [];

  for (const record of records) {
    // Only include records with valid position data
    if (record.position_lat != null && record.position_long != null) {
      // Garmin stores coordinates in semicircles, need to convert to degrees
      // But easy-fit already converts them for us
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
        speed: record.enhanced_speed || record.speed || null,
        distance: record.distance || null
      });
    }
  }

  return trackPoints;
}

/**
 * Extract summary data from FIT file
 */
function extractSummary(data) {
  const session = data.sessions?.[0];

  if (session) {
    return {
      totalDistance: session.total_distance || 0,
      totalTime: session.total_timer_time || session.total_elapsed_time || 0,
      totalAscent: session.total_ascent || 0,
      totalDescent: session.total_descent || 0,
      avgSpeed: session.avg_speed || null,
      maxSpeed: session.max_speed || null,
      avgHeartRate: session.avg_heart_rate || null,
      maxHeartRate: session.max_heart_rate || null,
      avgPower: session.avg_power || null,
      maxPower: session.max_power || null,
      avgCadence: session.avg_cadence || null,
      sport: session.sport || 'cycling',
      subSport: session.sub_sport || null,
      // Power metrics from device (if available)
      normalizedPower: session.normalized_power || null,
      trainingStressScore: session.training_stress_score || null,
      intensityFactor: session.intensity_factor || null,
      threshold_power: session.threshold_power || null, // FTP setting on device
      totalWork: session.total_work || null, // kJ
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
function calculateNormalizedPower(powerValues) {
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
function calculatePowerCurveSummary(powerValues) {
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
 * Extract power values from track points (1-second resolution assumed)
 */
function extractPowerStream(trackPoints) {
  if (!trackPoints || trackPoints.length === 0) {
    return null;
  }

  const powerValues = trackPoints
    .filter(p => p.power !== null && p.power !== undefined)
    .map(p => p.power);

  return powerValues.length > 0 ? powerValues : null;
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
 * Download and parse a FIT file from URL, returning encoded polyline
 * @param {string} url - URL to download FIT file from
 * @param {string} accessToken - Bearer token for authentication
 * @returns {Promise<{polyline: string|null, summary: Object|null, error: string|null}>}
 */
export async function downloadAndParseFitFile(url, accessToken) {
  try {
    console.log('📥 Downloading FIT file...');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/octet-stream, application/fit, */*'
      }
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

    // Get the file as ArrayBuffer
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

    // Parse the FIT file
    const parsed = await parseFitFile(Buffer.from(arrayBuffer));

    console.log(`📍 FIT file parsed: ${parsed.trackPoints.length} GPS points, ${parsed.recordCount} total records`);

    if (!parsed.hasGpsData) {
      console.log('ℹ️ FIT file has no GPS data (indoor activity?)');
      return {
        polyline: null,
        summary: parsed.summary,
        error: null
      };
    }

    // Simplify track to reduce polyline size (keeps ~10% of points typically)
    const simplified = simplifyTrack(parsed.trackPoints);
    console.log(`📉 Track simplified: ${parsed.trackPoints.length} → ${simplified.length} points`);

    // Encode as polyline
    const polyline = encodePolyline(simplified);

    return {
      polyline,
      summary: parsed.summary,
      powerMetrics: parsed.powerMetrics,
      pointCount: parsed.trackPoints.length,
      simplifiedCount: simplified.length,
      hasPowerData: parsed.hasPowerData,
      error: null
    };

  } catch (error) {
    console.error('❌ FIT file processing error:', error.message);
    return {
      polyline: null,
      summary: null,
      powerMetrics: null,
      error: error.message
    };
  }
}

export default {
  parseFitFile,
  encodePolyline,
  simplifyTrack,
  downloadAndParseFitFile
};
