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
 * Uses "pinch point" detection - finds where route entry/exit points are close together
 * with the clicked point somewhere in between on the tangent
 *
 * @param {Array} coordinates - Route coordinates
 * @param {number} clickIndex - Index of the clicked point
 * @param {Object} options - Detection options
 * @returns {Object} - { startIndex, endIndex, segmentCoords }
 */
export function findSegmentToRemove(coordinates, clickIndex, options = {}) {
  const {
    maxSegmentLength = 50, // Max points to consider for removal
    pinchThreshold = 500, // Max meters between entry/exit points (the "pinch")
  } = options;

  if (coordinates.length < 5 || clickIndex < 2 || clickIndex > coordinates.length - 3) {
    // Can't remove segments too close to start/end
    return null;
  }

  console.log(`🔍 Finding segment to remove around index ${clickIndex}`);

  // Strategy: Find the "pinch point" - two points on the route (before and after the click)
  // that are close to each other, indicating a tangent/spur between them

  let bestStart = -1;
  let bestEnd = -1;
  let bestPinchDistance = Infinity;

  // Search window: look backwards and forwards from click point
  const searchBack = Math.min(clickIndex, maxSegmentLength);
  const searchForward = Math.min(coordinates.length - 1 - clickIndex, maxSegmentLength);

  // Try different combinations of start/end points
  for (let back = 2; back <= searchBack; back++) {
    const startIdx = clickIndex - back;
    const startPoint = coordinates[startIdx];

    for (let forward = 2; forward <= searchForward; forward++) {
      const endIdx = clickIndex + forward;
      const endPoint = coordinates[endIdx];

      // Calculate distance between potential entry and exit points
      const pinchDistance = haversineDistance(
        startPoint[1], startPoint[0],
        endPoint[1], endPoint[0]
      );

      // Check if this is a good "pinch" - entry/exit are close together
      if (pinchDistance < pinchThreshold && pinchDistance < bestPinchDistance) {
        // Verify the segment actually goes somewhere (not just a straight line)
        // Find the max distance any point in the segment is from the start
        let maxDeviation = 0;
        for (let k = startIdx + 1; k < endIdx; k++) {
          const deviation = haversineDistance(
            startPoint[1], startPoint[0],
            coordinates[k][1], coordinates[k][0]
          );
          maxDeviation = Math.max(maxDeviation, deviation);
        }

        // It's a tangent if the route deviates significantly from the pinch points
        if (maxDeviation > pinchDistance * 0.5 && maxDeviation > 100) {
          bestStart = startIdx;
          bestEnd = endIdx;
          bestPinchDistance = pinchDistance;
          console.log(`  Found pinch: ${startIdx}-${endIdx}, pinch=${Math.round(pinchDistance)}m, deviation=${Math.round(maxDeviation)}m`);
        }
      }
    }
  }

  if (bestStart < 0 || bestEnd < 0) {
    console.log('❌ No pinch point found - this may not be a tangent');
    return null;
  }

  // Calculate segment statistics
  const startPoint = coordinates[bestStart];
  const endPoint = coordinates[bestEnd];
  const directDistance = haversineDistance(
    startPoint[1], startPoint[0],
    endPoint[1], endPoint[0]
  );

  // Calculate the path length of the segment
  let segmentLength = 0;
  for (let i = bestStart; i < bestEnd; i++) {
    segmentLength += haversineDistance(
      coordinates[i][1], coordinates[i][0],
      coordinates[i + 1][1], coordinates[i + 1][0]
    );
  }

  console.log(`✅ Segment found: indices ${bestStart}-${bestEnd}, segment=${Math.round(segmentLength)}m, direct=${Math.round(directDistance)}m`);

  return {
    startIndex: bestStart,
    endIndex: bestEnd,
    segmentCoords: coordinates.slice(bestStart, bestEnd + 1),
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
