/**
 * Polyline Decode Utility
 *
 * Decodes Google's encoded polyline format and provides
 * geographic distance calculations for route proximity queries.
 */

/**
 * Decode a Google encoded polyline string into an array of [lat, lng] pairs.
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<[number, number]>} Array of [lat, lng] coordinate pairs
 */
export function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Calculate the distance between two lat/lng points using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Check if an encoded polyline route passes within a given radius of a target point.
 * Uses a bounding-box pre-filter for performance before checking haversine distances.
 *
 * @param {string} encodedPolyline - Google encoded polyline
 * @param {number} targetLat - Target latitude
 * @param {number} targetLng - Target longitude
 * @param {number} radiusKm - Proximity radius in kilometers (default 0.5)
 * @returns {boolean} True if any point on the route is within the radius
 */
export function routePassesNear(encodedPolyline, targetLat, targetLng, radiusKm = 0.5) {
  const points = decodePolyline(encodedPolyline);
  if (points.length === 0) return false;

  // Bounding box pre-filter: ~0.01 degrees ≈ 1.1km at equator
  // Use a generous margin to avoid rejecting valid points
  const degreeMargin = (radiusKm / 111) * 1.5; // 1 degree ≈ 111km
  const latMin = targetLat - degreeMargin;
  const latMax = targetLat + degreeMargin;
  const lngMin = targetLng - degreeMargin;
  const lngMax = targetLng + degreeMargin;

  for (const [lat, lng] of points) {
    // Quick bounding box check first
    if (lat < latMin || lat > latMax || lng < lngMin || lng > lngMax) {
      continue;
    }
    // Precise haversine check
    if (haversineDistance(lat, lng, targetLat, targetLng) <= radiusKm) {
      return true;
    }
  }

  return false;
}
