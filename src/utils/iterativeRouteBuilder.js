/**
 * Iterative Route Builder
 *
 * Builds routes incrementally by routing segment-by-segment, staying on real roads.
 * For loops: divides the route into 4 quarters, each with a consistent direction.
 *
 * Key advantages over polygon/waypoint approach:
 * - Each segment ends on a real road (no synthetic waypoints)
 * - Precise distance control
 * - Natural path evolution following road networks
 * - No artifacts from misaligned waypoints
 */

import { getSmartCyclingRoute } from './smartCyclingRouter';
import { fetchElevationProfile, calculateElevationStats } from './directions';
import { generateSmartRouteName } from './routeNaming';

// Earth's radius in kilometers
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

/**
 * Calculate destination point given start, bearing, and distance
 * Uses haversine formula for accuracy
 *
 * @param {[number, number]} start - [longitude, latitude]
 * @param {number} bearing - Direction in degrees (0 = North, 90 = East)
 * @param {number} distanceKm - Distance in kilometers
 * @returns {[number, number]} - [longitude, latitude] of destination
 */
function calculateDestinationPoint(start, bearing, distanceKm) {
  const [lon1, lat1] = start;
  const lat1Rad = toRadians(lat1);
  const lon1Rad = toRadians(lon1);
  const bearingRad = toRadians(bearing);
  const angularDistance = distanceKm / EARTH_RADIUS_KM;

  const lat2Rad = Math.asin(
    Math.sin(lat1Rad) * Math.cos(angularDistance) +
    Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lon2Rad = lon1Rad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad),
    Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
  );

  return [toDegrees(lon2Rad), toDegrees(lat2Rad)];
}

/**
 * Calculate bearing from one point to another
 *
 * @param {[number, number]} start - [longitude, latitude]
 * @param {[number, number]} end - [longitude, latitude]
 * @returns {number} - Bearing in degrees
 */
function calculateBearing(start, end) {
  const [lon1, lat1] = start;
  const [lon2, lat2] = end;

  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Calculate distance between two points using haversine formula
 *
 * @param {[number, number]} point1 - [longitude, latitude]
 * @param {[number, number]} point2 - [longitude, latitude]
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(point1, point2) {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Normalize bearing to 0-360 range
 */
function normalizeBearing(bearing) {
  return ((bearing % 360) + 360) % 360;
}

/**
 * Get cardinal direction name from bearing
 */
function getDirectionName(bearing) {
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

/**
 * Route a single segment between two points
 * Returns the routed path snapped to real roads
 *
 * @param {[number, number]} start - [longitude, latitude]
 * @param {[number, number]} end - [longitude, latitude]
 * @param {Object} options - Routing options
 * @returns {Promise<Object>} - Segment with coordinates, distance, etc.
 */
async function routeSegment(start, end, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    trainingGoal = 'endurance',
    mapboxToken = null
  } = options;

  console.log(`🔗 Routing segment: ${getDirectionName(calculateBearing(start, end))}`);
  console.log(`   From: [${start[0].toFixed(4)}, ${start[1].toFixed(4)}]`);
  console.log(`   To:   [${end[0].toFixed(4)}, ${end[1].toFixed(4)}]`);
  console.log(`   Target distance: ${calculateDistance(start, end).toFixed(2)}km`);

  try {
    const result = await getSmartCyclingRoute([start, end], {
      profile,
      preferences,
      trainingGoal,
      mapboxToken
    });

    if (result && result.coordinates && result.coordinates.length > 0) {
      const actualDistance = result.distance / 1000; // Convert meters to km
      console.log(`   ✅ Routed: ${actualDistance.toFixed(2)}km, ${result.coordinates.length} points`);

      return {
        coordinates: result.coordinates,
        distance: actualDistance,
        duration: result.duration || 0,
        elevationGain: result.elevationGain || 0,
        source: result.source,
        // The actual end point (snapped to road)
        endPoint: result.coordinates[result.coordinates.length - 1]
      };
    }

    console.warn(`   ⚠️ Routing failed, using straight line`);
    return {
      coordinates: [start, end],
      distance: calculateDistance(start, end),
      duration: 0,
      elevationGain: 0,
      source: 'fallback',
      endPoint: end
    };
  } catch (error) {
    console.error(`   ❌ Routing error:`, error);
    return {
      coordinates: [start, end],
      distance: calculateDistance(start, end),
      duration: 0,
      elevationGain: 0,
      source: 'error_fallback',
      endPoint: end
    };
  }
}

/**
 * Build a loop route using the quarter-based approach
 *
 * The route is divided into 4 segments, each covering roughly 1/4 of the total distance.
 * Each segment maintains a consistent direction, turning ~90° at each quarter.
 *
 * @param {Object} params - Route parameters
 * @param {[number, number]} params.startPoint - [longitude, latitude]
 * @param {number} params.targetDistanceKm - Target total distance in kilometers
 * @param {number} params.initialBearing - Initial direction (0=North, 90=East, etc.)
 * @param {Object} params.options - Routing options
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<Object>} - Complete route
 */
async function buildQuarterLoop(params) {
  const {
    startPoint,
    targetDistanceKm,
    initialBearing = 0,
    options = {},
    onProgress = null
  } = params;

  console.log('\n🔄 Building quarter-based loop route');
  console.log(`📍 Start: [${startPoint[0].toFixed(4)}, ${startPoint[1].toFixed(4)}]`);
  console.log(`📏 Target distance: ${targetDistanceKm.toFixed(1)}km`);
  console.log(`🧭 Initial direction: ${getDirectionName(initialBearing)} (${initialBearing}°)`);

  // Calculate quarter distance
  // We use slightly less than 1/4 for the first 3 segments to leave room for the return
  const quarterDistance = targetDistanceKm / 4;

  // Slight variation to make routes more natural (not perfect squares)
  const quarterVariations = [
    quarterDistance * (0.95 + Math.random() * 0.1),  // Q1: 95-105%
    quarterDistance * (0.90 + Math.random() * 0.15), // Q2: 90-105%
    quarterDistance * (0.90 + Math.random() * 0.15), // Q3: 90-105%
    // Q4 will be calculated to close the loop
  ];

  const segments = [];
  let currentPoint = startPoint;
  let currentBearing = initialBearing;
  let totalDistance = 0;
  let totalElevationGain = 0;
  let allCoordinates = [];

  // Build first 3 quarters
  for (let i = 0; i < 3; i++) {
    onProgress && onProgress((i + 1) / 5); // Progress: 20%, 40%, 60%

    console.log(`\n📐 Quarter ${i + 1}/4: Heading ${getDirectionName(currentBearing)}`);

    // Calculate target point for this quarter
    const targetPoint = calculateDestinationPoint(
      currentPoint,
      currentBearing,
      quarterVariations[i]
    );

    // Route this segment
    const segment = await routeSegment(currentPoint, targetPoint, options);
    segments.push(segment);

    // Add coordinates (skip first point after first segment to avoid duplicates)
    if (i === 0) {
      allCoordinates = [...segment.coordinates];
    } else {
      allCoordinates = [...allCoordinates, ...segment.coordinates.slice(1)];
    }

    totalDistance += segment.distance;
    totalElevationGain += segment.elevationGain || 0;

    // Use the actual routed end point for the next segment
    currentPoint = segment.endPoint;

    // Turn right (clockwise) for the next quarter
    // Add some variation to avoid perfectly square routes
    const turnAngle = 85 + Math.random() * 10; // 85-95 degrees
    currentBearing = normalizeBearing(currentBearing + turnAngle);
  }

  // Quarter 4: Close the loop back to start
  onProgress && onProgress(0.8);
  console.log(`\n📐 Quarter 4/4: Closing loop back to start`);

  const remainingDistance = calculateDistance(currentPoint, startPoint);
  console.log(`   Distance to start: ${remainingDistance.toFixed(2)}km`);

  const closingSegment = await routeSegment(currentPoint, startPoint, options);
  segments.push(closingSegment);

  // Add closing coordinates
  allCoordinates = [...allCoordinates, ...closingSegment.coordinates.slice(1)];
  totalDistance += closingSegment.distance;
  totalElevationGain += closingSegment.elevationGain || 0;

  onProgress && onProgress(1.0);

  console.log(`\n✅ Loop complete!`);
  console.log(`   Total distance: ${totalDistance.toFixed(2)}km (target: ${targetDistanceKm.toFixed(1)}km)`);
  console.log(`   Accuracy: ${((totalDistance / targetDistanceKm) * 100).toFixed(1)}%`);
  console.log(`   Total points: ${allCoordinates.length}`);

  return {
    coordinates: allCoordinates,
    distance: totalDistance * 1000, // Convert to meters for consistency
    distanceKm: totalDistance,
    duration: segments.reduce((sum, s) => sum + (s.duration || 0), 0),
    elevationGain: totalElevationGain,
    segments: segments,
    routeType: 'loop',
    initialBearing,
    source: 'iterative_quarter_loop'
  };
}

/**
 * Build an out-and-back route
 * Goes in one direction for half the distance, then returns
 *
 * @param {Object} params - Route parameters
 * @returns {Promise<Object>} - Complete route
 */
async function buildOutAndBack(params) {
  const {
    startPoint,
    targetDistanceKm,
    initialBearing = 0,
    options = {},
    onProgress = null
  } = params;

  console.log('\n↔️ Building out-and-back route');
  console.log(`📍 Start: [${startPoint[0].toFixed(4)}, ${startPoint[1].toFixed(4)}]`);
  console.log(`📏 Target distance: ${targetDistanceKm.toFixed(1)}km`);
  console.log(`🧭 Direction: ${getDirectionName(initialBearing)} (${initialBearing}°)`);

  const halfDistance = targetDistanceKm / 2;

  // Calculate turnaround point
  const turnaroundPoint = calculateDestinationPoint(startPoint, initialBearing, halfDistance);

  onProgress && onProgress(0.25);

  // Route outbound
  console.log(`\n📤 Outbound segment`);
  const outbound = await routeSegment(startPoint, turnaroundPoint, options);

  onProgress && onProgress(0.5);

  // Route return (from actual routed end point)
  console.log(`\n📥 Return segment`);
  const returnSegment = await routeSegment(outbound.endPoint, startPoint, options);

  onProgress && onProgress(1.0);

  // Combine coordinates
  const allCoordinates = [
    ...outbound.coordinates,
    ...returnSegment.coordinates.slice(1)
  ];

  const totalDistance = outbound.distance + returnSegment.distance;

  console.log(`\n✅ Out-and-back complete!`);
  console.log(`   Total distance: ${totalDistance.toFixed(2)}km`);

  return {
    coordinates: allCoordinates,
    distance: totalDistance * 1000,
    distanceKm: totalDistance,
    duration: (outbound.duration || 0) + (returnSegment.duration || 0),
    elevationGain: (outbound.elevationGain || 0) + (returnSegment.elevationGain || 0),
    segments: [outbound, returnSegment],
    routeType: 'out_and_back',
    initialBearing,
    source: 'iterative_out_and_back'
  };
}

/**
 * Build a point-to-point route with user waypoints
 * Routes through each waypoint in order
 *
 * @param {Object} params - Route parameters
 * @returns {Promise<Object>} - Complete route
 */
async function buildPointToPoint(params) {
  const {
    startPoint,
    waypoints = [],
    options = {},
    onProgress = null
  } = params;

  console.log('\n📍 Building point-to-point route');
  console.log(`📍 Start: [${startPoint[0].toFixed(4)}, ${startPoint[1].toFixed(4)}]`);
  console.log(`📍 Waypoints: ${waypoints.length}`);

  if (waypoints.length === 0) {
    console.warn('No waypoints provided for point-to-point route');
    return null;
  }

  const allPoints = [startPoint, ...waypoints];
  const segments = [];
  let allCoordinates = [];
  let totalDistance = 0;
  let totalElevationGain = 0;

  for (let i = 0; i < allPoints.length - 1; i++) {
    onProgress && onProgress((i + 1) / allPoints.length);

    const segment = await routeSegment(allPoints[i], allPoints[i + 1], options);
    segments.push(segment);

    if (i === 0) {
      allCoordinates = [...segment.coordinates];
    } else {
      allCoordinates = [...allCoordinates, ...segment.coordinates.slice(1)];
    }

    totalDistance += segment.distance;
    totalElevationGain += segment.elevationGain || 0;
  }

  onProgress && onProgress(1.0);

  console.log(`\n✅ Point-to-point complete!`);
  console.log(`   Total distance: ${totalDistance.toFixed(2)}km`);

  return {
    coordinates: allCoordinates,
    distance: totalDistance * 1000,
    distanceKm: totalDistance,
    duration: segments.reduce((sum, s) => sum + (s.duration || 0), 0),
    elevationGain: totalElevationGain,
    segments: segments,
    routeType: 'point_to_point',
    source: 'iterative_point_to_point'
  };
}

/**
 * Parse user direction preference to bearing
 *
 * @param {string} direction - Direction like "north", "southeast", "NE", etc.
 * @returns {number|null} - Bearing in degrees or null if not specified
 */
function parseDirection(direction) {
  if (!direction) return null;

  const directionMap = {
    'n': 0, 'north': 0,
    'ne': 45, 'northeast': 45,
    'e': 90, 'east': 90,
    'se': 135, 'southeast': 135,
    's': 180, 'south': 180,
    'sw': 225, 'southwest': 225,
    'w': 270, 'west': 270,
    'nw': 315, 'northwest': 315
  };

  const normalized = direction.toLowerCase().trim();
  return directionMap[normalized] ?? null;
}

/**
 * Main entry point for iterative route building
 *
 * @param {Object} params - Route generation parameters
 * @param {[number, number]} params.startLocation - [longitude, latitude]
 * @param {number} params.targetDistanceKm - Target distance in kilometers
 * @param {string} params.routeType - 'loop', 'out_and_back', or 'point_to_point'
 * @param {string} params.direction - Optional initial direction (e.g., "north", "southeast")
 * @param {Array} params.waypoints - Optional user-specified waypoints
 * @param {Object} params.options - Routing options (profile, preferences, etc.)
 * @param {Function} params.onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} - Generated route
 */
export async function generateIterativeRoute(params) {
  const {
    startLocation,
    targetDistanceKm,
    routeType = 'loop',
    direction = null,
    waypoints = [],
    options = {},
    trainingGoal = 'endurance',
    onProgress = null
  } = params;

  console.log('\n🚀 Iterative Route Builder');
  console.log('='.repeat(50));

  // Normalize start location
  const startPoint = Array.isArray(startLocation)
    ? startLocation
    : [startLocation.lng || startLocation.longitude, startLocation.lat || startLocation.latitude];

  // Determine initial bearing
  let initialBearing;

  if (waypoints && waypoints.length > 0) {
    // If user provided waypoints, head toward the first one
    const firstWaypoint = Array.isArray(waypoints[0])
      ? waypoints[0]
      : [waypoints[0].lng || waypoints[0].longitude, waypoints[0].lat || waypoints[0].latitude];
    initialBearing = calculateBearing(startPoint, firstWaypoint);
    console.log(`🎯 Direction set by first waypoint: ${getDirectionName(initialBearing)}`);
  } else if (direction) {
    // Use user-specified direction
    initialBearing = parseDirection(direction);
    if (initialBearing === null) {
      // Try parsing as a number
      initialBearing = parseFloat(direction);
      if (isNaN(initialBearing)) {
        initialBearing = Math.random() * 360;
        console.log(`⚠️ Could not parse direction "${direction}", using random`);
      }
    }
    console.log(`🧭 User direction: ${direction} → ${initialBearing}°`);
  } else {
    // Pick a random direction (weighted toward common riding directions)
    // Slightly favor cardinal directions as they often have better roads
    const cardinalDirections = [0, 90, 180, 270];
    const baseDirection = cardinalDirections[Math.floor(Math.random() * 4)];
    initialBearing = baseDirection + (Math.random() - 0.5) * 45; // ±22.5° variation
    console.log(`🎲 Random direction: ${getDirectionName(initialBearing)}`);
  }

  // Build route based on type
  let route;
  const routeOptions = { ...options, trainingGoal };

  switch (routeType.toLowerCase().replace(/[-_\s]/g, '')) {
    case 'outandback':
    case 'outback':
      route = await buildOutAndBack({
        startPoint,
        targetDistanceKm,
        initialBearing,
        options: routeOptions,
        onProgress
      });
      break;

    case 'pointtopoint':
    case 'p2p':
      if (waypoints.length === 0) {
        console.warn('Point-to-point requires waypoints, falling back to loop');
        route = await buildQuarterLoop({
          startPoint,
          targetDistanceKm,
          initialBearing,
          options: routeOptions,
          onProgress
        });
      } else {
        route = await buildPointToPoint({
          startPoint,
          waypoints: waypoints.map(wp =>
            Array.isArray(wp) ? wp : [wp.lng || wp.longitude, wp.lat || wp.latitude]
          ),
          options: routeOptions,
          onProgress
        });
      }
      break;

    case 'loop':
    default:
      route = await buildQuarterLoop({
        startPoint,
        targetDistanceKm,
        initialBearing,
        options: routeOptions,
        onProgress
      });
      break;
  }

  if (!route || !route.coordinates || route.coordinates.length < 2) {
    console.error('❌ Failed to generate route');
    return null;
  }

  // Generate a smart name for the route
  const routeName = generateSmartRouteName({
    distance: route.distanceKm,
    elevationGain: route.elevationGain,
    trainingGoal,
    routeType: route.routeType,
    direction: getDirectionName(initialBearing)
  });

  return {
    ...route,
    name: routeName,
    description: `${route.distanceKm.toFixed(1)}km ${route.routeType.replace('_', ' ')} heading ${getDirectionName(initialBearing)}`,
    trainingGoal,
    strategy: 'iterative',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generate multiple route variations using the iterative approach
 *
 * @param {Object} params - Base parameters
 * @param {number} numRoutes - Number of route variations to generate
 * @returns {Promise<Array>} - Array of generated routes
 */
export async function generateIterativeRouteVariations(params, numRoutes = 3) {
  const {
    startLocation,
    targetDistanceKm,
    routeType = 'loop',
    direction = null,
    options = {},
    trainingGoal = 'endurance'
  } = params;

  console.log(`\n🎯 Generating ${numRoutes} route variations`);

  const routes = [];
  const usedBearings = [];

  for (let i = 0; i < numRoutes; i++) {
    let bearing;

    if (direction) {
      // If user specified direction, use it for first route
      // Then vary by ±45° for alternatives
      const baseBearing = parseDirection(direction) ?? 0;
      if (i === 0) {
        bearing = baseBearing;
      } else {
        // Spread alternatives evenly
        const offset = ((i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * 60);
        bearing = normalizeBearing(baseBearing + offset);
      }
    } else {
      // Generate diverse directions
      const baseAngles = [0, 90, 180, 270, 45, 135, 225, 315];
      bearing = baseAngles[i % baseAngles.length] + (Math.random() - 0.5) * 30;
    }

    // Avoid similar bearings
    while (usedBearings.some(b => Math.abs(normalizeBearing(b - bearing)) < 30)) {
      bearing = normalizeBearing(bearing + 45);
    }
    usedBearings.push(bearing);

    console.log(`\n📋 Route ${i + 1}/${numRoutes}: ${getDirectionName(bearing)}`);

    try {
      const route = await generateIterativeRoute({
        startLocation,
        targetDistanceKm,
        routeType,
        direction: bearing.toString(),
        options,
        trainingGoal
      });

      if (route) {
        routes.push({
          ...route,
          variationIndex: i,
          name: `${route.name} (Option ${i + 1})`
        });
      }
    } catch (error) {
      console.error(`Failed to generate route ${i + 1}:`, error);
    }
  }

  return routes;
}

export default {
  generateIterativeRoute,
  generateIterativeRouteVariations,
  buildQuarterLoop,
  buildOutAndBack,
  buildPointToPoint,
  calculateDestinationPoint,
  calculateBearing,
  calculateDistance,
  parseDirection
};
