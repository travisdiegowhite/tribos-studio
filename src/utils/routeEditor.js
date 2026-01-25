/**
 * Route Editor Utilities
 *
 * Provides tools for interactively editing routes, including:
 * - Detecting clicks on route segments
 * - Finding and removing tangent/spur segments
 * - Re-routing between points after deletion
 */

import { getSmartCyclingRoute } from './smartCyclingRouter';

/**
 * Calculate haversine distance between two points in meters
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
 * Find the nearest point on a route to a clicked location
 *
 * @param {Array} coordinates - Route coordinates [[lon, lat], ...]
 * @param {Object} clickLocation - {lng, lat} of the click
 * @returns {Object} - { index, distance, point }
 */
export function findNearestPointOnRoute(coordinates, clickLocation) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  let nearestPoint = null;

  for (let i = 0; i < coordinates.length; i++) {
    const [lon, lat] = coordinates[i];
    const dist = haversineDistance(
      clickLocation.lat, clickLocation.lng,
      lat, lon
    );

    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestIndex = i;
      nearestPoint = coordinates[i];
    }
  }

  return {
    index: nearestIndex,
    distance: nearestDistance,
    point: nearestPoint
  };
}

/**
 * Detect if a click is close enough to the route to be considered a "route click"
 *
 * @param {Array} coordinates - Route coordinates
 * @param {Object} clickLocation - {lng, lat}
 * @param {number} threshold - Maximum distance in meters (default 50m)
 * @returns {Object|null} - Nearest point info if within threshold, null otherwise
 */
export function detectRouteClick(coordinates, clickLocation, threshold = 50) {
  const nearest = findNearestPointOnRoute(coordinates, clickLocation);

  if (!nearest || nearest.distance > threshold) {
    return null;
  }

  return nearest;
}

/**
 * Find a segment to remove around a clicked point
 * Uses heuristics to detect tangent/spur patterns
 *
 * @param {Array} coordinates - Route coordinates
 * @param {number} clickIndex - Index of the clicked point
 * @param {Object} options - Detection options
 * @returns {Object} - { startIndex, endIndex, segmentCoords }
 */
export function findSegmentToRemove(coordinates, clickIndex, options = {}) {
  const {
    maxSegmentLength = 30, // Max points to consider for removal
    minDistanceFromMain = 100, // Min meters the segment must deviate
  } = options;

  if (coordinates.length < 5 || clickIndex < 2 || clickIndex > coordinates.length - 3) {
    // Can't remove segments too close to start/end
    return null;
  }

  const clickedPoint = coordinates[clickIndex];

  // Strategy: Find where the route "deviates" and "returns"
  // Look backwards for where the segment starts deviating
  // Look forwards for where it rejoins the main route

  let startIndex = clickIndex;
  let endIndex = clickIndex;

  // Look backwards - find where the tangent started
  for (let i = clickIndex - 1; i >= Math.max(0, clickIndex - maxSegmentLength); i--) {
    const point = coordinates[i];
    const nextPoint = coordinates[i + 1];

    // Check if this point is on the "main" route (close to where we'll rejoin)
    // by looking at the overall route direction
    const distFromClicked = haversineDistance(
      clickedPoint[1], clickedPoint[0],
      point[1], point[0]
    );

    // If we've gone back far enough and the route hasn't deviated much yet,
    // this is likely the start of the tangent
    if (distFromClicked > minDistanceFromMain * 0.5) {
      startIndex = i + 1;
      break;
    }

    startIndex = i;
  }

  // Look forwards - find where the tangent ends and route continues
  for (let i = clickIndex + 1; i <= Math.min(coordinates.length - 1, clickIndex + maxSegmentLength); i++) {
    const point = coordinates[i];

    const distFromClicked = haversineDistance(
      clickedPoint[1], clickedPoint[0],
      point[1], point[0]
    );

    // Similar logic - find where we're getting far from clicked point
    if (distFromClicked > minDistanceFromMain * 0.5) {
      endIndex = i - 1;
      break;
    }

    endIndex = i;
  }

  // Validate the segment makes sense to remove
  if (endIndex - startIndex < 2) {
    // Too small to be a tangent
    return null;
  }

  // Check that removing this segment would actually shorten the route significantly
  const startPoint = coordinates[startIndex];
  const endPoint = coordinates[endIndex];
  const directDistance = haversineDistance(
    startPoint[1], startPoint[0],
    endPoint[1], endPoint[0]
  );

  // Calculate the path length of the segment
  let segmentLength = 0;
  for (let i = startIndex; i < endIndex; i++) {
    segmentLength += haversineDistance(
      coordinates[i][1], coordinates[i][0],
      coordinates[i + 1][1], coordinates[i + 1][0]
    );
  }

  // Only suggest removal if the segment is significantly longer than direct path
  // (indicating it's a detour/tangent)
  if (segmentLength < directDistance * 1.5) {
    // This doesn't look like a tangent, might be intentional route
    // Still allow removal but warn
    console.log('⚠️ Selected segment may be intentional route, not a tangent');
  }

  return {
    startIndex,
    endIndex,
    segmentCoords: coordinates.slice(startIndex, endIndex + 1),
    directDistance,
    segmentLength,
    savings: segmentLength - directDistance
  };
}

/**
 * Remove a segment from the route and re-route between the remaining points
 *
 * @param {Array} coordinates - Original route coordinates
 * @param {number} startIndex - Start of segment to remove
 * @param {number} endIndex - End of segment to remove
 * @param {Object} options - Routing options (profile, preferences, etc.)
 * @returns {Promise<Array>} - New route coordinates with segment re-routed
 */
export async function removeSegmentAndReroute(coordinates, startIndex, endIndex, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    mapboxToken = null,
  } = options;

  if (startIndex < 0 || endIndex >= coordinates.length || startIndex >= endIndex) {
    console.error('Invalid segment indices');
    return coordinates;
  }

  // Get the points before and after the segment
  const pointBefore = coordinates[startIndex];
  const pointAfter = coordinates[endIndex];

  console.log(`🔧 Re-routing between indices ${startIndex} and ${endIndex}`);
  console.log(`   From: [${pointBefore[0].toFixed(4)}, ${pointBefore[1].toFixed(4)}]`);
  console.log(`   To: [${pointAfter[0].toFixed(4)}, ${pointAfter[1].toFixed(4)}]`);

  try {
    // Get a new route between the two points
    const newSegmentRoute = await getSmartCyclingRoute(
      [pointBefore, pointAfter],
      {
        profile,
        preferences,
        mapboxToken,
      }
    );

    if (!newSegmentRoute || !newSegmentRoute.coordinates || newSegmentRoute.coordinates.length < 2) {
      console.warn('Re-routing failed, using direct connection');
      // Fallback: just connect directly (will be a straight line on the map)
      const newCoords = [
        ...coordinates.slice(0, startIndex + 1),
        ...coordinates.slice(endIndex)
      ];
      return newCoords;
    }

    console.log(`✅ Re-routed with ${newSegmentRoute.coordinates.length} points`);

    // Combine: before segment + new route + after segment
    // Skip first point of new segment (same as pointBefore) and last (same as pointAfter)
    const newSegmentCoords = newSegmentRoute.coordinates.slice(1, -1);

    const newCoords = [
      ...coordinates.slice(0, startIndex + 1),
      ...newSegmentCoords,
      ...coordinates.slice(endIndex)
    ];

    return newCoords;

  } catch (error) {
    console.error('Error re-routing segment:', error);
    // Fallback: remove segment without re-routing
    return [
      ...coordinates.slice(0, startIndex + 1),
      ...coordinates.slice(endIndex)
    ];
  }
}

/**
 * Highlight a segment on the route for visual feedback
 * Returns GeoJSON for the segment to be highlighted
 *
 * @param {Array} coordinates - Route coordinates
 * @param {number} startIndex - Start of segment
 * @param {number} endIndex - End of segment
 * @returns {Object} - GeoJSON Feature for the segment
 */
export function getSegmentHighlight(coordinates, startIndex, endIndex) {
  if (!coordinates || startIndex < 0 || endIndex > coordinates.length) {
    return null;
  }

  return {
    type: 'Feature',
    properties: {
      segmentType: 'highlight'
    },
    geometry: {
      type: 'LineString',
      coordinates: coordinates.slice(startIndex, endIndex + 1)
    }
  };
}

/**
 * Calculate statistics for a potential segment removal
 *
 * @param {Array} coordinates - Route coordinates
 * @param {number} startIndex - Start of segment
 * @param {number} endIndex - End of segment
 * @returns {Object} - { distanceSaved, pointsRemoved, percentOfRoute }
 */
export function getRemovalStats(coordinates, startIndex, endIndex) {
  if (!coordinates || startIndex < 0 || endIndex > coordinates.length) {
    return null;
  }

  // Calculate segment length
  let segmentLength = 0;
  for (let i = startIndex; i < endIndex; i++) {
    segmentLength += haversineDistance(
      coordinates[i][1], coordinates[i][0],
      coordinates[i + 1][1], coordinates[i + 1][0]
    );
  }

  // Calculate total route length
  let totalLength = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalLength += haversineDistance(
      coordinates[i][1], coordinates[i][0],
      coordinates[i + 1][1], coordinates[i + 1][0]
    );
  }

  // Calculate direct distance (what re-routing will approximate)
  const directDistance = haversineDistance(
    coordinates[startIndex][1], coordinates[startIndex][0],
    coordinates[endIndex][1], coordinates[endIndex][0]
  );

  return {
    segmentLength: Math.round(segmentLength),
    directDistance: Math.round(directDistance),
    distanceSaved: Math.round(segmentLength - directDistance),
    pointsRemoved: endIndex - startIndex - 1,
    percentOfRoute: ((segmentLength / totalLength) * 100).toFixed(1)
  };
}

export default {
  findNearestPointOnRoute,
  detectRouteClick,
  findSegmentToRemove,
  removeSegmentAndReroute,
  getSegmentHighlight,
  getRemovalStats
};
