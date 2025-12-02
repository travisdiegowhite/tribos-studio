/**
 * Stadia Maps Valhalla Routing Service
 * Provides superior bicycle routing using hosted Valhalla API
 *
 * Free tier: 10,000 routes/month (200,000 credits)
 * Docs: https://docs.stadiamaps.com/routing/
 */

import { getUserSpeedProfile } from './speedAnalysis';

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
 * Get route from Stadia Maps Valhalla API
 *
 * @param {Array<[lon, lat]>} waypoints - Array of [longitude, latitude] coordinates
 * @param {Object} options - Routing options
 * @param {string} options.profile - Route profile: 'road', 'gravel', 'mountain', 'commuting'
 * @param {Object} options.preferences - User preferences (traffic avoidance, etc.)
 * @param {string} options.trainingGoal - Training goal: 'recovery', 'endurance', 'tempo', 'intervals'
 * @param {string} options.userId - User ID for personalized speed (optional)
 * @returns {Promise<Object>} Route object with coordinates, distance, duration
 */
export async function getStadiaMapsRoute(waypoints, options = {}) {
  const {
    profile = 'road',
    preferences = null,
    trainingGoal = 'endurance',
    userId = null
  } = options;

  const apiKey = process.env.REACT_APP_STADIA_API_KEY;

  if (!apiKey) {
    throw new Error('Stadia Maps API key not configured. Add REACT_APP_STADIA_API_KEY to .env');
  }

  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required for routing');
  }

  console.log(`🗺️ Stadia Maps: Generating ${profile} route with ${waypoints.length} waypoints`);

  // Get base costing options for profile
  let costing_options = {
    bicycle: { ...ROUTE_PROFILE_COSTING[profile] || ROUTE_PROFILE_COSTING.road }
  };

  // Apply personalized cycling speed if user ID provided
  if (userId) {
    try {
      const speedProfile = await getUserSpeedProfile(userId);

      // Map profile to appropriate speed
      const speedMapping = {
        'road': speedProfile.effectiveRoadSpeed,
        'gravel': speedProfile.effectiveGravelSpeed,
        'mountain': speedProfile.baseMountainSpeed, // Don't modify mountain speed (technical terrain)
        'commuting': speedProfile.effectiveCommuteSpeed
      };

      const personalizedSpeed = speedMapping[profile] || speedProfile.effectiveRoadSpeed;

      if (personalizedSpeed && speedProfile.hasSufficientData) {
        costing_options.bicycle.cycling_speed = personalizedSpeed;
        console.log(`🎯 Using personalized speed: ${personalizedSpeed} km/h (${Math.round(speedProfile.currentSpeedModifier * 100)}% pace)`);
      } else {
        console.log(`⚠️ Using default speed (insufficient ride data: ${speedProfile.ridesAnalyzedCount} rides)`);
      }
    } catch (error) {
      console.warn('Could not load personalized speed, using defaults:', error);
    }
  }

  // Apply user preferences if provided
  if (preferences) {
    if (preferences.avoidTraffic === 'high') {
      costing_options.bicycle.use_roads = 0; // Maximum bike path preference
    } else if (preferences.avoidTraffic === 'medium') {
      costing_options.bicycle.use_roads = 0.2;
    }

    if (preferences.avoidHills) {
      costing_options.bicycle.use_hills = 0.1; // Minimize climbing
    }
  }

  // Adjust for training goals
  if (trainingGoal === 'recovery') {
    costing_options.bicycle.use_hills = Math.min(costing_options.bicycle.use_hills, 0.2);
    costing_options.bicycle.use_roads = 0; // Prefer safe, low-stress paths
  }

  // Convert waypoints to Stadia Maps format
  // Use "break" type to force routing through each waypoint
  const locations = waypoints.map(([lon, lat], index) => ({
    lat: lat,
    lon: lon,
    type: 'break' // Force route to pass through this point (not just use as hint)
  }));

  // Build request
  const requestBody = {
    locations,
    costing: 'bicycle',
    costing_options,
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
        throw new Error('Invalid Stadia Maps API key. Check REACT_APP_STADIA_API_KEY in .env');
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

    console.log(`✅ Stadia Maps: Route generated - ${(distance / 1000).toFixed(2)} km, ${Math.round(duration / 60)} min`);

    return {
      coordinates,
      distance,
      duration,
      confidence: 1.0,
      source: 'stadia_maps',
      profile,
      raw: data // Include raw response for debugging
    };

  } catch (error) {
    console.error('Stadia Maps routing failed:', error);
    throw error;
  }
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
  const apiKey = process.env.REACT_APP_STADIA_API_KEY;
  const enabled = process.env.REACT_APP_USE_STADIA_MAPS === 'true';
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

/**
 * Estimate API credits for a route request
 * Standard routing = 20 credits per request
 *
 * @param {number} waypointCount - Number of waypoints in route
 * @returns {number} Estimated credits
 */
export function estimateCredits(waypointCount) {
  // Standard routing is 20 credits regardless of waypoint count
  return 20;
}

/**
 * Calculate routes remaining in current tier
 *
 * @param {string} tier - Current tier: 'free', 'starter', 'standard', 'professional'
 * @param {number} creditsUsed - Credits used this month
 * @returns {number} Routes remaining
 */
export function calculateRoutesRemaining(tier, creditsUsed) {
  const TIER_CREDITS = {
    free: 200000,
    starter: 1000000,
    standard: 7500000,
    professional: 25000000
  };

  const CREDITS_PER_ROUTE = 20;

  const tierCredits = TIER_CREDITS[tier.toLowerCase()] || TIER_CREDITS.free;
  const creditsRemaining = Math.max(0, tierCredits - creditsUsed);
  return Math.floor(creditsRemaining / CREDITS_PER_ROUTE);
}

export default {
  getStadiaMapsRoute,
  isStadiaMapsAvailable,
  getSupportedProfiles,
  estimateCredits,
  calculateRoutesRemaining
};
