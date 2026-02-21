/**
 * Route Editor Utilities
 *
 * Provides tools for interactively editing routes, including:
 * - Detecting clicks on route segments
 * - Finding and removing tangent/spur segments
 * - Re-routing between points after deletion
 */

import { getSmartCyclingRoute } from './smartCyclingRouter';
import { getSmartRunningRoute } from './smartRunningRouter';

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
 * Calculate bearing between two points in degrees
 */
function calculateBearing(point1, point2) {
  const lat1 = point1[1] * Math.PI / 180;
  const lat2 = point2[1] * Math.PI / 180;
  const deltaLon = (point2[0] - point1[0]) * Math.PI / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Find a segment to remove around a clicked point
 * Uses improved heuristics to detect tangent/spur patterns
 *
 * @param {Array} coordinates - Route coordinates
 * @param {number} clickIndex - Index of the clicked point
 * @param {Object} options - Detection options
 * @returns {Object} - { startIndex, endIndex, segmentCoords }
 */
export function findSegmentToRemove(coordinates, clickIndex, options = {}) {
  const {
    maxSegmentLength = 50, // Max points to consider for removal
    returnThreshold = 500, // How close points must be to consider "returned" (meters)
  } = options;

  if (coordinates.length < 5 || clickIndex < 2 || clickIndex > coordinates.length - 3) {
    // Can't remove segments too close to start/end
    return null;
  }

  console.log(`🔍 Finding segment to remove around index ${clickIndex}`);

  // Strategy: Find where the route "goes out and comes back"
  // Look for pairs of points where the route passes close to itself
  // The tangent is the section between those two close points

  let bestSegment = null;
  let bestSavings = 0;

  // Search window around the clicked point
  const searchStart = Math.max(0, clickIndex - maxSegmentLength);
  const searchEnd = Math.min(coordinates.length - 1, clickIndex + maxSegmentLength);

  // For each potential start point before the click
  for (let i = searchStart; i < clickIndex; i++) {
    const startPoint = coordinates[i];

    // For each potential end point after the click
    for (let j = clickIndex + 1; j <= searchEnd; j++) {
      const endPoint = coordinates[j];

      // Check if these two points are close to each other (route returns)
      const returnDistance = haversineDistance(
        startPoint[1], startPoint[0],
        endPoint[1], endPoint[0]
      );

      if (returnDistance < returnThreshold) {
        // Calculate the path length between these points
        let segmentLength = 0;
        for (let k = i; k < j; k++) {
          segmentLength += haversineDistance(
            coordinates[k][1], coordinates[k][0],
            coordinates[k + 1][1], coordinates[k + 1][0]
          );
        }

        // The savings is how much longer the segment is vs direct distance
        const savings = segmentLength - returnDistance;

        // Check that this is actually a tangent (goes far from the base)
        let maxDeviation = 0;
        for (let k = i + 1; k < j; k++) {
          const deviation = haversineDistance(
            startPoint[1], startPoint[0],
            coordinates[k][1], coordinates[k][0]
          );
          maxDeviation = Math.max(maxDeviation, deviation);
        }

        // Must deviate significantly to be considered a tangent
        // and must save meaningful distance
        if (maxDeviation > 150 && savings > 100 && savings > bestSavings) {
          // Prefer segments that include the clicked point more centrally
          const clickPosition = (clickIndex - i) / (j - i);
          const centrality = 1 - Math.abs(clickPosition - 0.5) * 2; // 1 when centered, 0 at edges

          // Score based on savings and centrality
          const score = savings * (0.5 + centrality * 0.5);

          if (score > bestSavings) {
            bestSavings = score;
            bestSegment = {
              startIndex: i,
              endIndex: j,
              segmentCoords: coordinates.slice(i, j + 1),
              directDistance: returnDistance,
              segmentLength,
              savings,
              maxDeviation
            };
          }
        }
      }
    }
  }

  // If we found a good segment with the return-detection method, use it
  if (bestSegment) {
    console.log(`✅ Found tangent segment: indices ${bestSegment.startIndex}-${bestSegment.endIndex}, saves ${Math.round(bestSegment.savings)}m`);
    return bestSegment;
  }

  // Fallback: Use bearing changes to detect sharp turns indicating tangent start/end
  console.log('🔄 Trying bearing-based detection...');

  let startIndex = clickIndex;
  let endIndex = clickIndex;

  // Look backwards for sharp turn (>90°)
  for (let i = clickIndex - 1; i >= Math.max(1, clickIndex - maxSegmentLength); i--) {
    const prevBearing = calculateBearing(coordinates[i - 1], coordinates[i]);
    const nextBearing = calculateBearing(coordinates[i], coordinates[i + 1]);
    let turnAngle = Math.abs(nextBearing - prevBearing);
    if (turnAngle > 180) turnAngle = 360 - turnAngle;

    if (turnAngle > 90) {
      startIndex = i;
      break;
    }
    startIndex = i;
  }

  // Look forwards for sharp turn
  for (let i = clickIndex + 1; i <= Math.min(coordinates.length - 2, clickIndex + maxSegmentLength); i++) {
    const prevBearing = calculateBearing(coordinates[i - 1], coordinates[i]);
    const nextBearing = calculateBearing(coordinates[i], coordinates[i + 1]);
    let turnAngle = Math.abs(nextBearing - prevBearing);
    if (turnAngle > 180) turnAngle = 360 - turnAngle;

    if (turnAngle > 90) {
      endIndex = i;
      break;
    }
    endIndex = i;
  }

  // Validate the segment
  if (endIndex - startIndex < 2) {
    console.log('❌ Segment too small');
    return null;
  }

  const startPoint = coordinates[startIndex];
  const endPoint = coordinates[endIndex];
  const directDistance = haversineDistance(
    startPoint[1], startPoint[0],
    endPoint[1], endPoint[0]
  );

  let segmentLength = 0;
  for (let i = startIndex; i < endIndex; i++) {
    segmentLength += haversineDistance(
      coordinates[i][1], coordinates[i][0],
      coordinates[i + 1][1], coordinates[i + 1][0]
    );
  }

  const savings = segmentLength - directDistance;

  if (savings < 50) {
    console.log('❌ Not enough savings to be a tangent');
    return null;
  }

  console.log(`✅ Found segment via bearing: indices ${startIndex}-${endIndex}, saves ${Math.round(savings)}m`);

  return {
    startIndex,
    endIndex,
    segmentCoords: coordinates.slice(startIndex, endIndex + 1),
    directDistance,
    segmentLength,
    savings
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
    sportType = 'cycling',
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
    const routingFn = sportType === 'running' ? getSmartRunningRoute : getSmartCyclingRoute;
    const newSegmentRoute = await routingFn(
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
