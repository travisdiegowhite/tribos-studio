/**
 * Stadia Maps Valhalla Routing Service
 * Provides superior bicycle routing using hosted Valhalla API
 *
 * Free tier: 10,000 routes/month (200,000 credits)
 * Docs: https://docs.stadiamaps.com/routing/
 */

const STADIA_MAPS_API_URL = 'https://api.stadiamaps.com/route/v1';

/**
 * Map tribos.studio route profiles to Stadia Maps Valhalla bicycle costing options
 */
const ROUTE_PROFILE_COSTING = {
  road: {
    bicycle_type: 'road',
    use_roads: 0.3,        // Some traffic OK for speed
    use_hills: 0.5,        // Balanced hill tolerance
    cycling_speed: 25,     // 25 km/h on flats
    avoid_bad_surfaces: 0.8 // Prefer paved roads
  },
  gravel: {
    bicycle_type: 'cross',
    use_roads: 0.1,        // Prefer off-road paths
    use_hills: 0.6,        // Accept hills for better surfaces
    cycling_speed: 20,     // 20 km/h on mixed terrain
    avoid_bad_surfaces: 0.2 // Gravel and dirt OK
  },
  mountain: {
    bicycle_type: 'mountain',
    use_roads: 0.1,        // Stay off roads
    use_hills: 0.8,        // Hills expected
    cycling_speed: 16,     // 16 km/h on technical terrain
    avoid_bad_surfaces: 0  // Any surface OK
  },
  commuting: {
    bicycle_type: 'hybrid',
    use_roads: 0,          // MAX bike path preference!
    use_hills: 0.3,        // Avoid hills for comfort
    cycling_speed: 18,     // 18 km/h casual pace
    avoid_bad_surfaces: 0.6, // Prefer smooth surfaces
    use_living_streets: 0.8  // Prefer low-traffic streets
  }
};

/**
 * Training-goal-specific costing adjustments
 * Applied on top of the base profile costing to optimize routes for workout type
 *
 * Valhalla costing parameters used:
 * - maneuver_penalty: seconds added per turn/intersection (default 5). Higher = fewer turns
 * - use_roads: 0 = maximize bike paths, 1 = prefer roads (default varies by profile)
 * - use_living_streets: 0-1, preference for low-traffic residential streets
 * - use_hills: 0 = avoid hills, 1 = prefer hills
 */
const TRAINING_GOAL_COSTING = {
  intervals: {
    // Intervals need long uninterrupted stretches - penalize turns/intersections heavily
    maneuver_penalty: 30,       // 6x default — strongly avoid turns during efforts
    use_roads: 0.15,            // Prefer bike paths/quiet roads for safety at high intensity
    use_living_streets: 0.8,    // Residential streets = fewer stoplights
    use_hills: 0.2              // Keep it flat for consistent power output
  },
  recovery: {
    // Recovery needs low-stress, pleasant, quiet roads
    maneuver_penalty: 15,       // Moderate turn avoidance for smoother riding
    use_roads: 0,               // Maximum bike path preference
    use_living_streets: 1.0,    // Strongly prefer quiet residential streets
    use_hills: 0.2              // Minimize climbing
  },
  endurance: {
    // Endurance needs consistent terrain with minimal interruptions
    maneuver_penalty: 15,       // Moderate turn avoidance for rhythm
    use_roads: 0.2,             // Slight bike path preference
    use_living_streets: 0.5,    // Balanced
    use_hills: 0.5              // Accept some hills for variety
  },
  hills: {
    // Hill training prioritizes elevation gain, road type less critical
    maneuver_penalty: 5,        // Default — turns don't matter much on hill routes
    use_hills: 0.9,             // Actively seek hills
    use_living_streets: 0.3     // Roads with hills may not be residential
  },
  tempo: {
    // Tempo needs steady effort roads, similar to intervals but less extreme
    maneuver_penalty: 20,       // Moderate-high turn avoidance
    use_roads: 0.2,             // Slight preference for bike paths
    use_living_streets: 0.6,    // Moderate preference for quiet streets
    use_hills: 0.3              // Prefer flatter terrain for steady effort
  }
};

/**
 * Map user traffic tolerance preferences to Valhalla costing parameters
 */
const TRAFFIC_TOLERANCE_COSTING = {
  low: {
    use_roads: 0,               // Maximum bike path preference
    use_living_streets: 1.0,    // Strongly prefer residential streets
    maneuver_penalty: 20        // Fewer turns = fewer busy intersections
  },
  medium: {
    use_roads: 0.2,             // Moderate bike path preference
    use_living_streets: 0.6     // Some preference for residential streets
  },
  high: {
    use_roads: 0.5,             // Accept busier roads for directness
    use_living_streets: 0.3     // Less concern about road type
  }
};

/**
 * Get route from Stadia Maps Valhalla API
 *
 * @param {Array<[lon, lat]>} waypoints - Array of [longitude, latitude] coordinates
 * @param {Object} options - Routing options
 * @param {string} options.profile - Route profile: 'road', 'gravel', 'mountain', 'commuting'
 * @param {Object} options.preferences - User preferences (traffic avoidance, etc.)
 * @param {string} options.trainingGoal - Training goal: 'recovery', 'endurance', 'tempo', 'intervals'
 * @param {number} options.userSpeed - Optional personalized cycling speed in km/h
 * @returns {Promise<Object>} Route object with coordinates, distance, duration
 */
export async function getStadiaMapsRoute(waypoints, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    trainingGoal = 'endurance',
    userSpeed = null
  } = options;

  const apiKey = import.meta.env.VITE_STADIA_API_KEY;

  if (!apiKey) {
    throw new Error('Stadia Maps API key not configured. Add VITE_STADIA_API_KEY to .env');
  }

  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required for routing');
  }

  console.log(`🗺️ Stadia Maps: Generating ${profile} route with ${waypoints.length} waypoints`);

  // Get base costing options for profile
  let costing_options = {
    bicycle: { ...ROUTE_PROFILE_COSTING[profile] || ROUTE_PROFILE_COSTING.road }
  };

  // Apply personalized cycling speed if provided
  if (userSpeed && userSpeed > 0) {
    costing_options.bicycle.cycling_speed = userSpeed;
    console.log(`🎯 Using personalized speed: ${userSpeed} km/h`);
  }

  // Apply training-goal-specific costing adjustments
  const goalCosting = TRAINING_GOAL_COSTING[trainingGoal];
  if (goalCosting) {
    // Merge goal costing — use the more restrictive value for each parameter
    Object.entries(goalCosting).forEach(([key, value]) => {
      if (key === 'maneuver_penalty') {
        // maneuver_penalty is additive — higher means more avoidance
        costing_options.bicycle[key] = Math.max(
          costing_options.bicycle[key] || 5,
          value
        );
      } else if (key === 'use_roads') {
        // use_roads: prefer the lower value (more bike-path-friendly)
        costing_options.bicycle[key] = Math.min(
          costing_options.bicycle[key] ?? 0.3,
          value
        );
      } else if (key === 'use_hills') {
        // use_hills: use the goal's preference directly
        costing_options.bicycle[key] = value;
      } else {
        // Other params (use_living_streets): use goal value if higher
        costing_options.bicycle[key] = Math.max(
          costing_options.bicycle[key] || 0,
          value
        );
      }
    });
    console.log(`🏋️ Applied ${trainingGoal} training goal costing adjustments`);
  }

  // Apply user traffic tolerance preferences
  const trafficTolerance = preferences?.routingPreferences?.trafficTolerance
    || preferences?.trafficTolerance;
  if (trafficTolerance && TRAFFIC_TOLERANCE_COSTING[trafficTolerance]) {
    const trafficCosting = TRAFFIC_TOLERANCE_COSTING[trafficTolerance];
    // For traffic: always prefer the quieter option between training goal and user preference
    if (trafficCosting.use_roads !== undefined) {
      costing_options.bicycle.use_roads = Math.min(
        costing_options.bicycle.use_roads ?? 0.3,
        trafficCosting.use_roads
      );
    }
    if (trafficCosting.use_living_streets !== undefined) {
      costing_options.bicycle.use_living_streets = Math.max(
        costing_options.bicycle.use_living_streets || 0,
        trafficCosting.use_living_streets
      );
    }
    if (trafficCosting.maneuver_penalty !== undefined) {
      costing_options.bicycle.maneuver_penalty = Math.max(
        costing_options.bicycle.maneuver_penalty || 5,
        trafficCosting.maneuver_penalty
      );
    }
    console.log(`🚦 Applied ${trafficTolerance} traffic tolerance costing`);
  }

  // Apply legacy preference format (avoidTraffic / avoidHills)
  if (preferences) {
    if (preferences.avoidTraffic === 'high') {
      costing_options.bicycle.use_roads = 0;
    } else if (preferences.avoidTraffic === 'medium') {
      costing_options.bicycle.use_roads = Math.min(costing_options.bicycle.use_roads ?? 0.3, 0.2);
    }

    if (preferences.avoidHills) {
      costing_options.bicycle.use_hills = 0.1;
    }
  }

  // Convert waypoints to Stadia Maps format
  // Use "break" type to force routing through each waypoint
  const locations = waypoints.map(([lon, lat]) => ({
    lat: lat,
    lon: lon,
    type: 'break' // Force route to pass through this point (not just use as hint)
  }));

  // Build request — include directions_type to get maneuver data for analysis
  const requestBody = {
    locations,
    costing: 'bicycle',
    costing_options,
    directions_type: 'maneuvers',
    units: 'kilometers',
    language: 'en-US',
    id: `tribos-${Date.now()}`
  };

  console.log('📊 Stadia Maps costing options:', JSON.stringify(costing_options.bicycle, null, 2));

  try {
    // Pass API key as query parameter for CORS compatibility
    const url = `${STADIA_MAPS_API_URL}?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stadia Maps API error:', response.status, errorText);

      if (response.status === 401) {
        throw new Error('Invalid Stadia Maps API key. Check VITE_STADIA_API_KEY in .env');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Upgrade Stadia Maps tier or implement caching');
      } else if (response.status === 400) {
        throw new Error(`Invalid request: ${errorText}`);
      }

      throw new Error(`Stadia Maps API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.trip || !data.trip.legs || data.trip.legs.length === 0) {
      throw new Error('No route found between waypoints');
    }

    // Extract route data - process ALL legs for multi-waypoint routes
    const trip = data.trip;

    console.log(`📍 Processing ${trip.legs.length} route leg(s) from Valhalla`);

    // Combine all legs into single route
    let coordinates = [];
    let totalDistance = 0;
    let totalDuration = 0;

    trip.legs.forEach((leg, index) => {
      // Decode polyline for this leg
      const legCoordinates = decodePolyline(leg.shape);

      // Concatenate coordinates (skip first point of subsequent legs to avoid duplication)
      if (index === 0) {
        coordinates = legCoordinates;
      } else {
        coordinates = coordinates.concat(legCoordinates.slice(1));
      }

      // Sum up distance and duration
      totalDistance += leg.summary.length * 1000; // Convert km to meters
      totalDuration += leg.summary.time; // Seconds
    });

    const distance = totalDistance;
    const duration = totalDuration;

    // Extract maneuver data for intersection/turn analysis
    const maneuvers = extractManeuverData(trip);

    console.log(`✅ Stadia Maps: Route generated - ${(distance / 1000).toFixed(2)} km, ${Math.round(duration / 60)} min, ${maneuvers.totalManeuvers} maneuvers`);

    return {
      coordinates,
      distance,
      duration,
      confidence: 1.0,
      source: 'stadia_maps',
      profile,
      maneuvers,
      raw: data // Include raw response for debugging
    };

  } catch (error) {
    console.error('Stadia Maps routing failed:', error);
    throw error;
  }
}

/**
 * Extract maneuver data from Valhalla trip response for turn/intersection analysis
 * Each maneuver includes type, street names, distance, and shape indices
 *
 * @param {Object} trip - Valhalla trip object
 * @returns {Object} Maneuver summary with per-km density and raw maneuver list
 */
function extractManeuverData(trip) {
  const allManeuvers = [];
  let totalDistanceKm = 0;

  trip.legs.forEach((leg) => {
    totalDistanceKm += leg.summary.length; // already in km

    if (leg.maneuvers) {
      leg.maneuvers.forEach((m) => {
        allManeuvers.push({
          type: m.type,                           // 0=none, 1-37 = turn types
          instruction: m.instruction,
          streetNames: m.street_names || [],
          length: m.length,                       // km
          time: m.time,                           // seconds
          beginShapeIndex: m.begin_shape_index,
          endShapeIndex: m.end_shape_index
        });
      });
    }
  });

  // Count only "real" turns/intersections (not depart/arrive/continue)
  // Valhalla maneuver types: 0=none, 1=start, 2=start_right, 3=start_left,
  // 4=destination, 5=destination_right, 6=destination_left, 7-14=turns,
  // 15-16=uturn, 17-25=ramp/merge/fork, 26=roundabout, etc.
  const turnTypes = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
  const realTurns = allManeuvers.filter(m => turnTypes.has(m.type));

  const turnsPerKm = totalDistanceKm > 0
    ? realTurns.length / totalDistanceKm
    : 0;

  return {
    totalManeuvers: allManeuvers.length,
    totalTurns: realTurns.length,
    totalDistanceKm,
    turnsPerKm,
    maneuvers: allManeuvers
  };
}

/**
 * Analyze a distance range of the route for interval suitability
 * Returns a score from 0 (poor) to 1 (excellent) based on turn density within that segment
 *
 * @param {Object} maneuverData - Output from extractManeuverData
 * @param {number} startKm - Start distance in km
 * @param {number} endKm - End distance in km
 * @returns {Object} Segment suitability analysis
 */
export function analyzeSegmentSuitability(maneuverData, startKm, endKm) {
  if (!maneuverData?.maneuvers || maneuverData.maneuvers.length === 0) {
    return { score: 0.5, turnsInSegment: 0, segmentLengthKm: endKm - startKm, reason: 'no maneuver data' };
  }

  const segmentLengthKm = endKm - startKm;
  if (segmentLengthKm <= 0) {
    return { score: 0.5, turnsInSegment: 0, segmentLengthKm: 0, reason: 'zero-length segment' };
  }

  // Walk through maneuvers and find which ones fall within [startKm, endKm]
  let cumulativeKm = 0;
  const turnTypes = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
  let turnsInSegment = 0;

  for (const m of maneuverData.maneuvers) {
    const maneuverStartKm = cumulativeKm;
    const maneuverEndKm = cumulativeKm + (m.length || 0);

    // Check if this maneuver overlaps with our segment
    if (maneuverEndKm > startKm && maneuverStartKm < endKm) {
      if (turnTypes.has(m.type)) {
        turnsInSegment++;
      }
    }

    cumulativeKm = maneuverEndKm;
  }

  const turnsPerKm = turnsInSegment / segmentLengthKm;

  // Score: 0 turns/km = 1.0, 1 turn/km = 0.7, 2/km = 0.4, 3+/km = 0.1
  let score;
  if (turnsPerKm <= 0.5) score = 1.0;
  else if (turnsPerKm <= 1.0) score = 0.8;
  else if (turnsPerKm <= 2.0) score = 0.5;
  else if (turnsPerKm <= 3.0) score = 0.3;
  else score = 0.1;

  return {
    score,
    turnsInSegment,
    turnsPerKm,
    segmentLengthKm,
    reason: turnsPerKm <= 1.0
      ? 'good: low intersection density'
      : turnsPerKm <= 2.0
        ? 'moderate: some intersections'
        : 'poor: high intersection density — consider re-routing'
  };
}

/**
 * Decode Valhalla polyline (encoded polyline6 format)
 * Uses precision 6 (1e-6) vs Google's precision 5 (1e-5)
 *
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<[lon, lat]>} Decoded coordinates
 */
function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const precision = 1e6; // Valhalla uses precision 6

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    // Decode latitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    // Decode longitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlon = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lon += dlon;

    coordinates.push([lon / precision, lat / precision]);
  }

  return coordinates;
}

/**
 * Check if Stadia Maps is configured and available
 *
 * @returns {boolean} True if API key is present
 */
export function isStadiaMapsAvailable() {
  const apiKey = import.meta.env.VITE_STADIA_API_KEY;
  const enabled = import.meta.env.VITE_USE_STADIA_MAPS !== 'false'; // Default to true
  return !!(apiKey && enabled);
}

/**
 * Get supported route profiles
 *
 * @returns {Array<string>} List of supported profiles
 */
export function getSupportedProfiles() {
  return Object.keys(ROUTE_PROFILE_COSTING);
}

export default {
  getStadiaMapsRoute,
  isStadiaMapsAvailable,
  getSupportedProfiles,
  analyzeSegmentSuitability
};
