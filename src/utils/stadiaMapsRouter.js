/**
 * Stadia Maps Valhalla Routing Service
 * Provides superior bicycle routing using hosted Valhalla API
 *
 * Free tier: 10,000 routes/month (200,000 credits)
 * Docs: https://docs.stadiamaps.com/routing/
 */

import { fetchBikeInfrastructure, INFRASTRUCTURE_TYPES } from './bikeInfrastructureService';

const STADIA_MAPS_API_URL = 'https://api.stadiamaps.com/route/v1';

/**
 * Detect metro segments post-route using maneuver density.
 * Metro areas have denser intersections (more maneuvers per km).
 * Uses a sliding window to identify which portions of the route are urban.
 *
 * @param {Array} maneuvers - Maneuver array from extractManeuverData
 * @returns {{metroFraction: number, metroDistanceKm: number, totalDistanceKm: number}}
 */
function detectMetroSegmentsFromManeuvers(maneuvers) {
  if (!maneuvers || maneuvers.length < 3) {
    return { metroFraction: 0, metroDistanceKm: 0, totalDistanceKm: 0 };
  }

  // Sliding window: 2km segments, classify as metro if 3+ maneuvers per km
  const WINDOW_KM = 2;
  const METRO_MANEUVERS_PER_KM = 3;

  let totalDistanceKm = 0;
  let metroDistanceKm = 0;
  let windowStartIdx = 0;
  let windowDistanceKm = 0;
  let windowManeuverCount = 0;

  for (let i = 0; i < maneuvers.length; i++) {
    const segmentKm = maneuvers[i].length || 0;
    totalDistanceKm += segmentKm;
    windowDistanceKm += segmentKm;
    windowManeuverCount++;

    // Shrink window from the left when it exceeds WINDOW_KM
    while (windowDistanceKm > WINDOW_KM && windowStartIdx < i) {
      windowDistanceKm -= (maneuvers[windowStartIdx].length || 0);
      windowManeuverCount--;
      windowStartIdx++;
    }

    // Classify this segment as metro if window density is high
    if (windowDistanceKm > 0) {
      const density = windowManeuverCount / windowDistanceKm;
      if (density >= METRO_MANEUVERS_PER_KM) {
        metroDistanceKm += segmentKm;
      }
    }
  }

  const metroFraction = totalDistanceKm > 0 ? metroDistanceKm / totalDistanceKm : 0;
  return { metroFraction, metroDistanceKm, totalDistanceKm };
}

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
    // Intervals need long uninterrupted stretches on QUIET roads with bike infrastructure
    // use_roads: 0 already prevents arterial routing, so higher maneuver_penalty
    // safely reduces intersections without pushing onto highways
    maneuver_penalty: 15,       // 3x default — aggressive intersection avoidance for uninterrupted efforts
    use_roads: 0,               // Maximum bike path/cycleway preference
    use_living_streets: 1.0,    // Maximum residential preference — these have long blocks + bike lanes
    use_hills: 0.2              // Keep it flat for consistent power output
  },
  recovery: {
    // Recovery needs low-stress, pleasant, quiet roads
    maneuver_penalty: 8,        // Mild turn avoidance — quiet roads matter more than straightness
    use_roads: 0,               // Maximum bike path preference
    use_living_streets: 1.0,    // Strongly prefer quiet residential streets
    use_hills: 0.2              // Minimize climbing
  },
  endurance: {
    // Endurance needs consistent terrain with minimal interruptions
    maneuver_penalty: 10,       // Moderate turn avoidance for rhythm
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
    // Tempo needs steady effort roads — prefer bike infrastructure over straightness
    // use_roads: 0.1 already biases toward bike paths, so higher maneuver_penalty
    // reduces intersections without forcing onto arterials
    maneuver_penalty: 18,       // High turn avoidance for sustained effort without interruption
    use_roads: 0.1,             // Stronger bike path preference
    use_living_streets: 0.9,    // Stronger residential preference
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
    maneuver_penalty: 8         // Mild turn avoidance — avoid pushing onto arterials
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

  // Never route cyclists onto ferries — use bridges/tunnels instead
  costing_options.bicycle.use_ferry = 0;

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
    // maneuver_penalty: if a training goal already set this, keep the goal's value
    // (training goal is more specific than traffic tolerance about how many turns are OK)
    if (trafficCosting.maneuver_penalty !== undefined && !goalCosting) {
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
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12000) // 12s — prevent indefinite hangs
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

    // Derive traffic and quietness scores from road classification
    const roadClassification = maneuvers.roadClassification;
    const trafficScore = roadClassification ? roadClassification.arterialFraction : 0.5;
    const quietnessScore = roadClassification ? (1 - roadClassification.arterialFraction) : 0.5;

    console.log(`✅ Stadia Maps: Route generated - ${(distance / 1000).toFixed(2)} km, ${Math.round(duration / 60)} min, ${maneuvers.totalManeuvers} maneuvers`);

    return {
      coordinates,
      distance,
      duration,
      confidence: 1.0,
      source: 'stadia_maps',
      profile,
      maneuvers,
      trafficScore,
      quietnessScore,
      roadClassification,
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
function extractManeuverData(trip, isMetro = false) {
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
          endShapeIndex: m.end_shape_index,
          highway: m.highway || false,            // Valhalla highway flag (from OSM)
          roadClass: m.road_class || null          // Valhalla road class if available
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

  // Classify turns by direction for safety analysis
  // Left turns cross oncoming traffic (in RHD countries), right turns stay in flow
  const leftTurnTypes = new Set([11, 12, 13, 15]);
  const rightTurnTypes = new Set([7, 8, 9, 16]);
  const leftTurns = realTurns.filter(m => leftTurnTypes.has(m.type)).length;
  const rightTurns = realTurns.filter(m => rightTurnTypes.has(m.type)).length;

  const turnsPerKm = totalDistanceKm > 0
    ? realTurns.length / totalDistanceKm
    : 0;

  // Classify road segments for arterial detection
  const roadClassification = classifyRoadSegments(allManeuvers, totalDistanceKm, isMetro);

  // Post-route metro segment detection from maneuver density
  const metroSegments = detectMetroSegmentsFromManeuvers(allManeuvers);
  roadClassification.metroFraction = metroSegments.metroFraction;
  roadClassification.metroDistanceKm = metroSegments.metroDistanceKm;

  if (leftTurns > 0 || rightTurns > 0) {
    console.log(`🔄 Turn analysis: ${leftTurns} left, ${rightTurns} right, ${realTurns.length - leftTurns - rightTurns} other (${turnsPerKm.toFixed(1)}/km)`);
  }

  return {
    totalManeuvers: allManeuvers.length,
    totalTurns: realTurns.length,
    leftTurns,
    rightTurns,
    totalDistanceKm,
    turnsPerKm,
    maneuvers: allManeuvers,
    roadClassification
  };
}

/**
 * Classify road segments to detect arterials/highways vs quiet roads
 * Two-tier detection:
 *   Tier 1: Valhalla highway boolean (from OSM tags, most reliable)
 *   Tier 2: Street name patterns (catches roads not flagged as highway but still high-traffic)
 *
 * @param {Array} maneuvers - Maneuver array from extractManeuverData
 * @param {number} totalDistanceKm - Total route distance in km
 * @param {boolean} isMetro - Whether route passes through a metro/urban area
 * @returns {Object} Road classification with arterial fraction and distances
 */
export function classifyRoadSegments(maneuvers, totalDistanceKm, isMetro = false, overpassData = null) {
  const ARTERIAL_NAME_PATTERN = /\b(Highway|Hwy|US[-\s]?\d|State\s*(Route|Road|Hwy)|SR[-\s]?\d|Interstate|I-\d|County\s*(Road|Rd)|CR[-\s]?\d|Boulevard|Blvd|Expressway|Freeway|Parkway|Turnpike|Route\s+\d)/i;

  let overpassArterialKm = 0;
  let highwayDistanceKm = 0;
  let arterialByNameKm = 0;

  for (const m of maneuvers) {
    const segmentKm = m.length || 0;

    // Tier 0: Overpass ground-truth (OSM highway=primary/secondary/trunk)
    // Most reliable — directly checks OSM road classification
    if (overpassData?.arterialIndices?.size > 0 && m.beginShapeIndex != null && m.endShapeIndex != null) {
      let overpassHit = false;
      for (let idx = m.beginShapeIndex; idx < m.endShapeIndex; idx++) {
        if (overpassData.arterialIndices.has(idx)) {
          overpassHit = true;
          break;
        }
      }
      if (overpassHit) {
        overpassArterialKm += segmentKm;
        continue; // Don't double-count
      }
    }

    // Tier 1: Valhalla highway flag
    if (m.highway) {
      highwayDistanceKm += segmentKm;
      continue; // Don't double-count
    }

    // Tier 2: Street name pattern matching
    if (m.streetNames && m.streetNames.length > 0) {
      const isArterial = m.streetNames.some(name => ARTERIAL_NAME_PATTERN.test(name));
      if (isArterial) {
        arterialByNameKm += segmentKm;
        continue; // Don't double-count
      }
    }
  }

  const totalArterialKm = overpassArterialKm + highwayDistanceKm + arterialByNameKm;
  const arterialFraction = totalDistanceKm > 0 ? totalArterialKm / totalDistanceKm : 0;

  if (arterialFraction > 0.1) {
    const overpassNote = overpassArterialKm > 0 ? `${overpassArterialKm.toFixed(1)}km overpass, ` : '';
    console.log(`⚠️ Road classification: ${(arterialFraction * 100).toFixed(0)}% arterial (${overpassNote}${highwayDistanceKm.toFixed(1)}km highway, ${arterialByNameKm.toFixed(1)}km by name)`);
  } else {
    console.log(`✅ Road classification: ${(arterialFraction * 100).toFixed(0)}% arterial — mostly quiet roads`);
  }

  return {
    arterialFraction,
    overpassArterialKm,
    highwayDistanceKm,
    arterialByNameKm,
    totalDistanceKm,
    isMetro
  };
}

/**
 * Score a route's overlap with bike infrastructure using Overpass data
 * Uses the existing bikeInfrastructureService (cached, 3 fallback endpoints)
 *
 * Non-blocking: returns null if data unavailable (cache miss), so it won't
 * delay route generation. The data gets cached for subsequent requests.
 *
 * @param {Array<[lon, lat]>} coordinates - Route coordinates
 * @returns {Promise<number|null>} Infrastructure score 0-1, or null if unavailable
 */
export async function scoreRouteInfrastructure(coordinates) {
  if (!coordinates || coordinates.length < 2) return null;

  try {
    // Build bounding box with ~300m buffer (~0.003 degrees)
    const BUFFER = 0.003;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const coord of coordinates) {
      const lon = coord[0], lat = coord[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    const bounds = {
      south: minLat - BUFFER,
      north: maxLat + BUFFER,
      west: minLon - BUFFER,
      east: maxLon + BUFFER
    };

    // Fetch infrastructure data (uses cached grid if user has viewed the area)
    const infraData = await fetchBikeInfrastructure(bounds, { signal: AbortSignal.timeout(3000) });
    if (!infraData || !infraData.features || infraData.features.length === 0) {
      return null; // No data available
    }

    // Score route segments by proximity to infrastructure
    // Sample every ~200m along the route
    const SAMPLE_INTERVAL = Math.max(1, Math.floor(coordinates.length / Math.ceil((coordinates.length * 0.0001) / 0.2)));
    const PROXIMITY_THRESHOLD = 0.0005; // ~50m in degrees

    // Infrastructure tier scores
    const TIER_SCORES = {
      [INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY]: 1.0,
      [INFRASTRUCTURE_TYPES.BIKE_LANE]: 0.8,
      [INFRASTRUCTURE_TYPES.SHARED_PATH]: 0.6,
      [INFRASTRUCTURE_TYPES.BIKE_FRIENDLY]: 0.4,
      [INFRASTRUCTURE_TYPES.SHARED_LANE]: 0.2,
    };

    let totalSamples = 0;
    let infraScoreSum = 0;

    // Sample route points
    for (let i = 0; i < coordinates.length; i += Math.max(1, Math.floor(coordinates.length / 50))) {
      const [sampleLon, sampleLat] = coordinates[i];
      let bestTierScore = 0;

      // Check proximity to each infrastructure feature
      for (const feature of infraData.features) {
        if (!feature.geometry || !feature.geometry.coordinates) continue;

        const infraType = feature.properties?.infraType;
        const tierScore = TIER_SCORES[infraType] || 0;
        if (tierScore <= bestTierScore) continue; // Skip lower-tier features

        // Check if any point on this feature is near our sample point
        const featureCoords = feature.geometry.coordinates;
        for (const [fLon, fLat] of featureCoords) {
          const dLat = Math.abs(fLat - sampleLat);
          const dLon = Math.abs(fLon - sampleLon);
          if (dLat < PROXIMITY_THRESHOLD && dLon < PROXIMITY_THRESHOLD) {
            bestTierScore = tierScore;
            break;
          }
        }
      }

      infraScoreSum += bestTierScore;
      totalSamples++;
    }

    const score = totalSamples > 0 ? infraScoreSum / totalSamples : null;
    if (score !== null) {
      console.log(`🚲 Infrastructure score: ${score.toFixed(2)} (${totalSamples} samples, ${infraData.features.length} features)`);
    }
    return score;
  } catch (error) {
    // Non-blocking: if Overpass fails, just skip infrastructure scoring
    console.warn('Infrastructure scoring skipped:', error.message);
    return null;
  }
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
    return { score: 0.5, turnsInSegment: 0, leftTurns: 0, rightTurns: 0, segmentLengthKm: endKm - startKm, reason: 'no maneuver data' };
  }

  const segmentLengthKm = endKm - startKm;
  if (segmentLengthKm <= 0) {
    return { score: 0.5, turnsInSegment: 0, leftTurns: 0, rightTurns: 0, segmentLengthKm: 0, reason: 'zero-length segment' };
  }

  // Valhalla maneuver type classification:
  // Left turns (cross oncoming traffic in RHD countries): 11=slight left, 12=left, 13=sharp left, 15=uturn left
  // Right turns (safer, stay in traffic flow): 7=slight right, 8=right, 9=sharp right, 16=uturn right
  // Other turns: 10=continue, 14=straight, 26+=roundabouts, ramps, merges
  const leftTurnTypes = new Set([11, 12, 13, 15]);
  const rightTurnTypes = new Set([7, 8, 9, 16]);
  const otherTurnTypes = new Set([10, 14, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
  const allTurnTypes = new Set([...leftTurnTypes, ...rightTurnTypes, ...otherTurnTypes]);

  let turnsInSegment = 0;
  let leftTurns = 0;
  let rightTurns = 0;
  let cumulativeKm = 0;

  for (const m of maneuverData.maneuvers) {
    const maneuverStartKm = cumulativeKm;
    const maneuverEndKm = cumulativeKm + (m.length || 0);

    // Check if this maneuver overlaps with our segment
    if (maneuverEndKm > startKm && maneuverStartKm < endKm) {
      if (allTurnTypes.has(m.type)) {
        turnsInSegment++;
        if (leftTurnTypes.has(m.type)) leftTurns++;
        else if (rightTurnTypes.has(m.type)) rightTurns++;
      }
    }

    cumulativeKm = maneuverEndKm;
  }

  // Left turns are penalized more heavily — they cross oncoming traffic (in RHD countries)
  // and typically require a full stop. Weight left turns 2x in the effective density.
  const effectiveTurns = rightTurns + (leftTurns * 2) + (turnsInSegment - leftTurns - rightTurns);
  const effectiveTurnsPerKm = effectiveTurns / segmentLengthKm;
  const turnsPerKm = turnsInSegment / segmentLengthKm;

  // Score based on effective turns/km (left turns count double)
  let score;
  if (effectiveTurnsPerKm <= 0.5) score = 1.0;
  else if (effectiveTurnsPerKm <= 1.0) score = 0.8;
  else if (effectiveTurnsPerKm <= 2.0) score = 0.5;
  else if (effectiveTurnsPerKm <= 3.0) score = 0.3;
  else score = 0.1;

  return {
    score,
    turnsInSegment,
    leftTurns,
    rightTurns,
    turnsPerKm,
    effectiveTurnsPerKm,
    segmentLengthKm,
    reason: effectiveTurnsPerKm <= 1.0
      ? 'good: low intersection density'
      : effectiveTurnsPerKm <= 2.0
        ? 'moderate: some intersections'
        : leftTurns > rightTurns
          ? 'poor: high intersection density with many left turns — consider re-routing'
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
