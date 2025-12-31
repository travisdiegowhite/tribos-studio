// GPX File Parser Utility
// Parses .gpx files from Strava exports and other sources
// Uses browser's DOMParser for XML parsing

/**
 * Parse a GPX file and extract activity data
 * @param {string} gpxContent - The raw GPX XML string
 * @param {string} fileName - Original filename for metadata
 * @returns {Promise<Object>} Parsed activity data
 */
export function parseGpxFile(gpxContent, fileName = 'activity.gpx') {
  return new Promise((resolve, reject) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(gpxContent, 'application/xml');

      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        reject(new Error('Invalid GPX file format'));
        return;
      }

      // Extract metadata
      const metadata = extractMetadata(doc, fileName);

      // Extract track points
      const trackPoints = extractTrackPoints(doc);

      // Calculate summary from track points
      const summary = calculateSummary(trackPoints, metadata);

      const result = {
        metadata,
        summary,
        trackPoints,
        laps: [], // GPX typically doesn't have lap data
        rawData: {
          trackPointCount: trackPoints.length,
          hasElevation: trackPoints.some(p => p.elevation != null),
          hasHeartRate: trackPoints.some(p => p.heartRate != null),
          hasPower: trackPoints.some(p => p.power != null),
          hasCadence: trackPoints.some(p => p.cadence != null)
        }
      };

      resolve(result);
    } catch (error) {
      reject(new Error(`GPX parser error: ${error.message}`));
    }
  });
}

/**
 * Extract metadata from GPX document
 */
function extractMetadata(doc, fileName) {
  // Try to get name from metadata or track
  let name = doc.querySelector('metadata > name')?.textContent
    || doc.querySelector('trk > name')?.textContent
    || fileName.replace(/\.gpx$/i, '');

  // Get timestamp from metadata or first track point
  let startTime = doc.querySelector('metadata > time')?.textContent;
  if (!startTime) {
    const firstTime = doc.querySelector('trkpt > time')?.textContent;
    if (firstTime) startTime = firstTime;
  }

  // Try to determine sport type from name or description
  const description = doc.querySelector('metadata > desc')?.textContent
    || doc.querySelector('trk > desc')?.textContent
    || '';

  let sport = 'cycling';
  const nameLower = (name + ' ' + description).toLowerCase();
  if (nameLower.includes('run') || nameLower.includes('jog')) {
    sport = 'running';
  } else if (nameLower.includes('walk') || nameLower.includes('hike')) {
    sport = 'walking';
  } else if (nameLower.includes('swim')) {
    sport = 'swimming';
  }

  // Get creator info
  const gpxElement = doc.querySelector('gpx');
  const creator = gpxElement?.getAttribute('creator') || 'Unknown';

  return {
    name,
    startTime: startTime ? new Date(startTime).toISOString() : null,
    sport,
    subSport: null,
    manufacturer: creator,
    product: null,
    serialNumber: null,
    fileName
  };
}

/**
 * Extract track points from GPX document
 * Supports both <trk>/<trkseg>/<trkpt> and <rte>/<rtept> formats
 */
function extractTrackPoints(doc) {
  const trackPoints = [];

  // Get all track points (most common for activity files)
  const trkpts = doc.querySelectorAll('trkpt');

  // Also check for route points if no track points
  const points = trkpts.length > 0 ? trkpts : doc.querySelectorAll('rtept');

  points.forEach((point) => {
    const lat = parseFloat(point.getAttribute('lat'));
    const lon = parseFloat(point.getAttribute('lon'));

    if (isNaN(lat) || isNaN(lon)) return;

    // Get elevation
    const eleElement = point.querySelector('ele');
    const elevation = eleElement ? parseFloat(eleElement.textContent) : null;

    // Get timestamp
    const timeElement = point.querySelector('time');
    const timestamp = timeElement ? new Date(timeElement.textContent).toISOString() : null;

    // Get extensions (Garmin, Strava, etc. may include HR, power, cadence)
    const extensions = point.querySelector('extensions');
    let heartRate = null;
    let power = null;
    let cadence = null;
    let temperature = null;

    if (extensions) {
      // Garmin TrackPointExtension format
      heartRate = parseFloatOrNull(extensions.querySelector('hr')?.textContent)
        || parseFloatOrNull(extensions.querySelector('gpxtpx\\:hr, TrackPointExtension hr')?.textContent);

      cadence = parseFloatOrNull(extensions.querySelector('cad')?.textContent)
        || parseFloatOrNull(extensions.querySelector('gpxtpx\\:cad, TrackPointExtension cad')?.textContent);

      power = parseFloatOrNull(extensions.querySelector('power')?.textContent)
        || parseFloatOrNull(extensions.querySelector('gpxtpx\\:power')?.textContent);

      temperature = parseFloatOrNull(extensions.querySelector('atemp')?.textContent)
        || parseFloatOrNull(extensions.querySelector('gpxtpx\\:atemp')?.textContent);
    }

    trackPoints.push({
      latitude: lat,
      longitude: lon,
      elevation: isNaN(elevation) ? null : elevation,
      timestamp,
      heartRate: heartRate ? Math.round(heartRate) : null,
      power: power ? Math.round(power) : null,
      cadence: cadence ? Math.round(cadence) : null,
      speed: null, // Will be calculated from distance/time
      temperature,
      distance: null // Will be calculated cumulatively
    });
  });

  // Calculate speeds and cumulative distances
  let cumulativeDistance = 0;
  for (let i = 0; i < trackPoints.length; i++) {
    trackPoints[i].distance = cumulativeDistance;

    if (i > 0) {
      const prev = trackPoints[i - 1];
      const curr = trackPoints[i];

      // Calculate segment distance
      const segmentDistance = haversineDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      );
      cumulativeDistance += segmentDistance;
      trackPoints[i].distance = cumulativeDistance;

      // Calculate speed if we have timestamps
      if (prev.timestamp && curr.timestamp) {
        const timeDiff = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000; // seconds
        if (timeDiff > 0 && timeDiff < 300) { // Ignore gaps > 5 min
          const speed = (segmentDistance / 1000) / (timeDiff / 3600); // km/h
          if (speed < 150) { // Sanity check
            trackPoints[i].speed = speed;
          }
        }
      }
    }
  }

  return trackPoints;
}

/**
 * Calculate summary statistics from track points
 */
function calculateSummary(trackPoints, metadata) {
  if (!trackPoints || trackPoints.length < 2) {
    return {
      totalDistance: 0,
      totalMovingTime: 0,
      totalElapsedTime: 0,
      totalAscent: 0,
      totalDescent: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      avgPower: null,
      maxPower: null,
      avgCadence: null,
      maxCadence: null
    };
  }

  // Total distance (from last point's cumulative distance)
  const totalDistance = trackPoints[trackPoints.length - 1].distance || 0;

  // Calculate elevation gain/loss
  let totalAscent = 0;
  let totalDescent = 0;
  let prevElevation = null;

  // Use smoothed elevation to reduce noise
  const smoothedElevations = smoothElevation(trackPoints.map(p => p.elevation).filter(e => e != null));

  for (let i = 1; i < smoothedElevations.length; i++) {
    const diff = smoothedElevations[i] - smoothedElevations[i - 1];
    if (diff > 0) {
      totalAscent += diff;
    } else {
      totalDescent += Math.abs(diff);
    }
  }

  // Calculate time
  let totalElapsedTime = 0;
  let totalMovingTime = 0;
  const minMovingSpeed = 1.0; // km/h threshold for "moving"

  const firstTimestamp = trackPoints.find(p => p.timestamp)?.timestamp;
  const lastTimestamp = [...trackPoints].reverse().find(p => p.timestamp)?.timestamp;

  if (firstTimestamp && lastTimestamp) {
    totalElapsedTime = (new Date(lastTimestamp) - new Date(firstTimestamp)) / 1000;
  }

  // Calculate moving time and collect metrics
  const speeds = [];
  const heartRates = [];
  const powers = [];
  const cadences = [];
  let maxSpeed = 0;

  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];

    if (curr.speed != null) {
      speeds.push(curr.speed);
      if (curr.speed > maxSpeed && curr.speed < 150) {
        maxSpeed = curr.speed;
      }
    }

    if (curr.heartRate) heartRates.push(curr.heartRate);
    if (curr.power) powers.push(curr.power);
    if (curr.cadence) cadences.push(curr.cadence);

    // Calculate segment moving time
    if (prev.timestamp && curr.timestamp) {
      const segmentTime = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000;
      if (segmentTime > 0 && segmentTime < 300) { // Ignore pauses > 5 min
        if (curr.speed && curr.speed >= minMovingSpeed) {
          totalMovingTime += segmentTime;
        } else if (!curr.speed) {
          // If no speed data, assume moving
          totalMovingTime += segmentTime;
        }
      }
    }
  }

  // If we couldn't calculate moving time, estimate from distance and avg speed
  if (totalMovingTime === 0 && totalDistance > 0 && totalElapsedTime > 0) {
    totalMovingTime = totalElapsedTime * 0.9; // Estimate 90% moving
  }

  // Calculate averages
  const avgSpeed = totalMovingTime > 0
    ? (totalDistance / 1000) / (totalMovingTime / 3600)
    : (speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0);

  return {
    totalDistance: totalDistance / 1000, // Convert to km
    totalMovingTime: Math.round(totalMovingTime),
    totalElapsedTime: Math.round(totalElapsedTime),
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
    maxCadence: cadences.length > 0 ? Math.max(...cadences) : null,
    totalCalories: null // GPX doesn't typically include this
  };
}

/**
 * Smooth elevation data using a simple moving average
 */
function smoothElevation(elevations, windowSize = 5) {
  if (elevations.length < windowSize) return elevations;

  const smoothed = [];
  for (let i = 0; i < elevations.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(elevations.length, i + Math.floor(windowSize / 2) + 1);
    const window = elevations.slice(start, end);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    smoothed.push(avg);
  }
  return smoothed;
}

/**
 * Calculate Haversine distance between two points (in meters)
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
 * Parse float or return null
 */
function parseFloatOrNull(value) {
  if (value == null) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Convert GPX data to activities table format for database storage
 */
export function gpxToActivityFormat(gpxData, userId) {
  const { metadata, summary, trackPoints } = gpxData;

  // Generate a unique provider_activity_id for GPX uploads
  const timestamp = metadata.startTime ? new Date(metadata.startTime).getTime() : Date.now();
  const providerActivityId = `gpx_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

  // Determine activity type
  let activityType = 'Ride';
  if (metadata.sport === 'cycling' || metadata.sport === 'biking') {
    activityType = 'Ride';
  } else if (metadata.sport === 'running') {
    activityType = 'Run';
  } else if (metadata.sport === 'walking') {
    activityType = 'Walk';
  } else if (metadata.sport === 'swimming') {
    activityType = 'Swim';
  } else if (metadata.sport) {
    activityType = metadata.sport.charAt(0).toUpperCase() + metadata.sport.slice(1);
  }

  // Store extended data in raw_data JSONB
  const rawData = {
    source: 'gpx_import',
    creator: metadata.manufacturer,
    original_filename: metadata.fileName,
    max_speed: summary.maxSpeed ? summary.maxSpeed / 3.6 : null, // Convert to m/s
    average_cadence: summary.avgCadence,
    max_cadence: summary.maxCadence,
    total_descent: summary.totalDescent,
    track_point_count: trackPoints.length
  };

  return {
    user_id: userId,
    provider: 'gpx_import',
    provider_activity_id: providerActivityId,
    name: metadata.name,
    type: activityType,
    sport_type: metadata.sport || 'cycling',
    start_date: metadata.startTime,
    start_date_local: metadata.startTime,
    distance: summary.totalDistance * 1000, // Convert km to meters
    moving_time: Math.round(summary.totalMovingTime),
    elapsed_time: Math.round(summary.totalElapsedTime || summary.totalMovingTime),
    total_elevation_gain: summary.totalAscent,
    average_speed: summary.avgSpeed / 3.6, // Convert km/h to m/s
    max_speed: summary.maxSpeed / 3.6,
    average_watts: summary.avgPower,
    kilojoules: null,
    average_heartrate: summary.avgHeartRate,
    max_heartrate: summary.maxHeartRate,
    suffer_score: null,
    workout_type: null,
    trainer: false,
    commute: false,
    gear_id: null,
    map_summary_polyline: trackPoints.length > 0 ? encodePolyline(trackPoints) : null,
    raw_data: rawData
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

export default parseGpxFile;
