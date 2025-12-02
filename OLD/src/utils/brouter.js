/**
 * BRouter Integration
 * Free OSM-based routing with excellent gravel/unpaved road support
 * Public instance: http://brouter.de/brouter
 */

// BRouter profiles for different cycling types
export const BROUTER_PROFILES = {
  GRAVEL: 'gravel',              // Prioritizes unpaved roads, gravel, dirt
  TREKKING: 'trekking',          // Balanced touring profile
  FASTBIKE: 'fastbike',          // Speed-oriented road cycling
  MTB: 'mtb',                     // Mountain biking
  SAFETY: 'safety'                // Safest routes, avoids traffic
};

/**
 * Get cycling directions from BRouter
 * @param {Array<[lon, lat]>} coordinates - Array of waypoint coordinates
 * @param {Object} options - Routing options
 * @returns {Promise<Object>} Route data
 */
export async function getBRouterDirections(coordinates, options = {}) {
  const {
    profile = BROUTER_PROFILES.GRAVEL,
    alternativeidx = 0
  } = options;

  if (!coordinates || coordinates.length < 2) {
    console.error('BRouter: At least 2 coordinates required');
    return null;
  }

  try {
    // Format coordinates as lon,lat|lon,lat|...
    const lonlats = coordinates.map(coord => `${coord[0]},${coord[1]}`).join('|');

    // Build BRouter API URL
    const params = new URLSearchParams({
      lonlats,
      profile,
      alternativeidx,
      format: 'geojson'
    });

    const url = `https://brouter.de/brouter?${params.toString()}`;

    console.log(`🚴 BRouter: Requesting ${profile} route with ${coordinates.length} waypoints`);
    console.log(`📍 BRouter URL:`, url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BRouter API error: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();

    if (!data || !data.features || data.features.length === 0) {
      console.warn('BRouter: No route found in response');
      return null;
    }

    const route = data.features[0];
    const geometry = route.geometry;
    const properties = route.properties;

    // Extract route information
    // BRouter returns properties as strings, so parse them as numbers
    const routeCoordinates = geometry.coordinates; // GeoJSON: [lon, lat]
    const distance = parseFloat(properties['track-length']) || 0; // meters
    const duration = parseFloat(properties['total-time']) || 0; // seconds
    const ascent = parseFloat(properties['filtered ascend']) || 0; // meters
    const descent = parseFloat(properties['filtered descend']) || 0; // meters

    console.log(`✅ BRouter route generated:`, {
      distance: `${(distance / 1000).toFixed(1)}km`,
      duration: `${(duration / 60).toFixed(0)}min`,
      ascent: `${ascent.toFixed(0)}m`,
      profile
    });

    return {
      coordinates: routeCoordinates,
      distance, // meters
      duration, // seconds
      elevation: {
        ascent,
        descent
      },
      confidence: 0.9, // BRouter is very reliable for cycling
      profile,
      source: 'brouter',
      properties // Include all BRouter-specific properties
    };

  } catch (error) {
    console.error('BRouter request failed:', error);
    return null;
  }
}

/**
 * Check if BRouter service is available
 */
export async function validateBRouterService() {
  try {
    // Test with a simple route in Europe (where BRouter has good coverage)
    const testCoords = [
      [13.388860, 52.517037], // Berlin
      [13.397634, 52.529407]
    ];

    const result = await getBRouterDirections(testCoords, {
      profile: BROUTER_PROFILES.TREKKING
    });

    if (result && result.distance > 0) {
      return {
        available: true,
        profiles: Object.values(BROUTER_PROFILES),
        testDistance: result.distance
      };
    } else {
      return {
        available: false,
        error: 'No route returned from test request'
      };
    }
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Select appropriate BRouter profile based on training goal and surface preference
 */
export function selectBRouterProfile(trainingGoal, surfacePreference = null) {
  // If explicitly requesting gravel/unpaved
  if (surfacePreference === 'gravel') {
    return BROUTER_PROFILES.GRAVEL;
  }

  // Map training goals to profiles
  switch (trainingGoal) {
    case 'intervals':
    case 'tempo':
      return BROUTER_PROFILES.FASTBIKE; // Fast, smooth roads for speed work

    case 'hills':
      return BROUTER_PROFILES.MTB; // Mountain bike profile handles steep grades

    case 'recovery':
      return BROUTER_PROFILES.SAFETY; // Safest, quietest routes

    case 'endurance':
    default:
      return BROUTER_PROFILES.TREKKING; // Balanced touring profile
  }
}
