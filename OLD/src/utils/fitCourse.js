/**
 * FIT Course File Generation Utility
 *
 * Generates Garmin FIT course files from route data.
 * FIT (Flexible and Interoperable Data Transfer) is Garmin's native binary format.
 *
 * Documentation: https://developer.garmin.com/fit/protocol/
 */

import EasyFit from 'easy-fit';

/**
 * Convert route data to FIT Course file format
 *
 * @param {Object} route - Route object from database
 * @param {string} route.name - Route name
 * @param {string} route.activity_type - Activity type (ride, gravel_ride, etc.)
 * @param {number} route.distance_km - Distance in kilometers
 * @param {number} route.elevation_gain_m - Elevation gain in meters
 * @param {number} route.elevation_loss_m - Elevation loss in meters
 * @param {Array} trackPoints - Array of track points
 * @param {number} trackPoints[].latitude - Latitude in degrees
 * @param {number} trackPoints[].longitude - Longitude in degrees
 * @param {number} trackPoints[].elevation - Elevation in meters (optional)
 * @param {number} trackPoints[].point_index - Sequential point index
 * @returns {Buffer} - FIT file binary data
 */
export function generateFitCourse(route, trackPoints) {
  if (!route || !trackPoints || trackPoints.length === 0) {
    throw new Error('Route and track points are required');
  }

  // Sort track points by index to ensure correct order
  const sortedPoints = [...trackPoints].sort((a, b) => a.point_index - b.point_index);

  // Initialize EasyFit encoder
  const fit = new EasyFit({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'km',
    temperatureUnit: 'celsius',
    mode: 'cascade'
  });

  // FIT file header
  const fitData = {
    file_id: {
      type: 'course',
      manufacturer: 'development',
      product: 1,
      time_created: new Date(),
      serial_number: Math.floor(Math.random() * 1000000)
    },

    // Course metadata
    course: {
      name: route.name || 'Unnamed Course',
      sport: mapActivityTypeToFitSport(route.activity_type)
    },

    // Course lap (required for distance/elevation summary)
    laps: [{
      message_index: 0,
      start_time: new Date(),
      total_distance: (route.distance_km || 0) * 1000, // Convert km to meters
      total_ascent: route.elevation_gain_m || 0,
      total_descent: route.elevation_loss_m || 0
    }],

    // Course records (GPS track points)
    records: sortedPoints.map((point, index) => ({
      timestamp: new Date(Date.now() + index * 1000), // Dummy timestamps (1 second apart)
      position_lat: degreesToSemicircles(point.latitude),
      position_long: degreesToSemicircles(point.longitude),
      altitude: point.elevation || 0,
      distance: calculateCumulativeDistance(sortedPoints, index)
    }))
  };

  // Encode to FIT binary format
  try {
    return fit.encode(fitData);
  } catch (error) {
    throw new Error(`FIT encoding failed: ${error.message}`);
  }
}

/**
 * Convert latitude/longitude from degrees to semicircles
 *
 * Garmin FIT format uses semicircles for coordinates:
 * - 2^31 semicircles = 180 degrees
 * - Semicircles = degrees * (2^31 / 180)
 *
 * @param {number} degrees - Coordinate in degrees
 * @returns {number} - Coordinate in semicircles
 */
function degreesToSemicircles(degrees) {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

/**
 * Map app activity types to Garmin FIT sport types
 *
 * @param {string} activityType - App activity type
 * @returns {string} - FIT sport type
 */
function mapActivityTypeToFitSport(activityType) {
  const mapping = {
    'ride': 'cycling',
    'road_ride': 'cycling',
    'road_biking': 'cycling',
    'gravel_ride': 'cycling', // FIT uses generic 'cycling' for gravel
    'gravel_cycling': 'cycling',
    'mountain_bike': 'mountain_biking',
    'mountain_biking': 'mountain_biking',
    'cyclocross': 'cyclocross',
    'indoor_cycling': 'cycling',
    'virtual_ride': 'cycling',
    'run': 'running',
    'walk': 'walking',
    'hike': 'hiking'
  };

  const normalized = activityType?.toLowerCase() || 'ride';
  return mapping[normalized] || 'cycling';
}

/**
 * Calculate cumulative distance at each track point using Haversine formula
 *
 * @param {Array} points - Array of track points
 * @param {number} currentIndex - Current point index
 * @returns {number} - Cumulative distance in meters
 */
function calculateCumulativeDistance(points, currentIndex) {
  let totalDistance = 0;

  for (let i = 1; i <= currentIndex; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    totalDistance += haversineDistance(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
  }

  return totalDistance; // in meters
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 *
 * @param {number} lat1 - Latitude of first point (degrees)
 * @param {number} lon1 - Longitude of first point (degrees)
 * @param {number} lat2 - Latitude of second point (degrees)
 * @param {number} lon2 - Longitude of second point (degrees)
 * @returns {number} - Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert degrees to radians
 *
 * @param {number} degrees - Angle in degrees
 * @returns {number} - Angle in radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Validate FIT course data before encoding
 *
 * @param {Object} route - Route object
 * @param {Array} trackPoints - Track points array
 * @returns {Object} - Validation result {valid: boolean, errors: Array}
 */
export function validateFitCourseData(route, trackPoints) {
  const errors = [];

  if (!route) {
    errors.push('Route object is required');
  }

  if (!trackPoints || !Array.isArray(trackPoints)) {
    errors.push('Track points array is required');
  } else if (trackPoints.length === 0) {
    errors.push('Track points array cannot be empty');
  } else if (trackPoints.length > 10000) {
    errors.push(`Track points exceed Garmin limit of 10,000 (got ${trackPoints.length})`);
  }

  // Validate track point structure
  if (trackPoints && trackPoints.length > 0) {
    const firstPoint = trackPoints[0];
    if (typeof firstPoint.latitude !== 'number' || typeof firstPoint.longitude !== 'number') {
      errors.push('Track points must have numeric latitude and longitude');
    }

    if (Math.abs(firstPoint.latitude) > 90 || Math.abs(firstPoint.longitude) > 180) {
      errors.push('Track point coordinates are out of valid range');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  generateFitCourse,
  validateFitCourseData
};
