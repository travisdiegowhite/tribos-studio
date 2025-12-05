// GraphHopper integration for cycling routes
// Good CORS support for browser applications

const GRAPHHOPPER_BASE_URL = 'https://graphhopper.com/api/1';

// GraphHopper cycling profiles
export const GRAPHHOPPER_PROFILES = {
  BIKE: 'bike',                    // Standard cycling
  RACINGBIKE: 'racingbike',       // Road cycling optimized
  MOUNTAINBIKE: 'mtb',            // Mountain biking
  GRAVEL: 'bike',                 // Gravel cycling (uses bike with custom model)
  FOOT: 'foot'                     // Walking/hiking
};

// Get GraphHopper API key
const getGraphHopperApiKey = () => {
  return process.env.REACT_APP_GRAPHHOPPER_API_KEY;
};

// Get cycling directions using GraphHopper with advanced preferences
export async function getGraphHopperCyclingDirections(coordinates, options = {}) {
  const apiKey = getGraphHopperApiKey();

  if (!apiKey) {
    console.warn('GraphHopper API key not found. Get one free at https://www.graphhopper.com/');
    return null;
  }

  const {
    profile = GRAPHHOPPER_PROFILES.BIKE,
    alternatives = false,
    elevation = true,
    instructions = false,
    calcPoints = true,
    preferences = null
  } = options;

  // Format coordinates: lat,lon|lat,lon|...
  const points = coordinates.map(coord => `${coord[1]},${coord[0]}`).join('|');
  
  const params = new URLSearchParams({
    key: apiKey,
    vehicle: profile,
    points_encoded: 'false',
    calc_points: calcPoints,
    instructions: instructions,
    elevation: elevation,
    optimize: 'false'
  });

  // DEFAULT: Always apply some traffic avoidance for cycling
  // This makes GraphHopper routes safer than Mapbox by default
  let customModelApplied = false;

  // GRAVEL PROFILE: Extremely high preference for unpaved roads and dirt paths
  if (profile === GRAPHHOPPER_PROFILES.GRAVEL) {
    customModelApplied = true;
    params.append('ch.disable', 'true'); // Disable contraction hierarchies for flexibility
    params.append('custom_model', JSON.stringify({
      "priority": [
        // MASSIVELY boost ALL unpaved surfaces (explicit tags)
        { "if": "surface == GRAVEL", "multiply_by": "20.0" },
        { "if": "surface == DIRT", "multiply_by": "25.0" },
        { "if": "surface == COMPACTED", "multiply_by": "22.0" },
        { "if": "surface == FINE_GRAVEL", "multiply_by": "20.0" },
        { "if": "surface == GROUND", "multiply_by": "22.0" },
        { "if": "surface == UNPAVED", "multiply_by": "20.0" },
        { "if": "surface == GRASS", "multiply_by": "15.0" },
        { "if": "surface == SAND", "multiply_by": "12.0" },

        // STRONGLY prefer road classes that are typically unpaved
        // TRACK is usually gravel/dirt (farm roads, forest roads, etc.)
        { "if": "road_class == TRACK", "multiply_by": "15.0" },
        // PATH includes trails, single track, etc
        { "if": "road_class == PATH", "multiply_by": "12.0" },
        { "if": "road_class == BRIDLEWAY", "multiply_by": "10.0" },
        { "if": "road_class == CYCLEWAY && surface == UNPAVED", "multiply_by": "18.0" },

        // BLOCK all highways and major paved roads
        { "if": "road_class == MOTORWAY", "multiply_by": "0" },
        { "if": "road_class == TRUNK", "multiply_by": "0" },
        { "if": "road_class == PRIMARY", "multiply_by": "0.01" },
        { "if": "road_class == SECONDARY", "multiply_by": "0.05" },

        // HEAVILY penalize explicitly paved surfaces
        { "if": "surface == PAVED", "multiply_by": "0.05" },
        { "if": "surface == ASPHALT", "multiply_by": "0.05" },
        { "if": "surface == CONCRETE", "multiply_by": "0.03" },

        // Tertiary roads (county roads) - sometimes gravel in rural areas
        // Only use if no surface tag (might be gravel)
        { "if": "road_class == TERTIARY && surface == MISSING", "multiply_by": "3.0" },
        { "if": "road_class == TERTIARY && surface == PAVED", "multiply_by": "0.1" },

        // Residential streets - last resort (usually paved)
        { "if": "road_class == RESIDENTIAL && surface == MISSING", "multiply_by": "0.3" },
        { "if": "road_class == RESIDENTIAL && surface == PAVED", "multiply_by": "0.1" },

        // UNCLASSIFIED roads (often county roads in rural areas - frequently gravel!)
        { "if": "road_class == UNCLASSIFIED", "multiply_by": "8.0" }
      ],
      "distance_influence": 250 // Allow up to 250% longer routes to find gravel paths (very flexible)
    }));
    console.log('🌾 GraphHopper: Applying AGGRESSIVE GRAVEL profile - blocking paved roads, prioritizing tracks/paths/unclassified roads');
  }

  // Add cycling-specific preferences for GraphHopper
  if (preferences && !customModelApplied) {
    console.log('🚴 Applying GraphHopper cycling preferences:', preferences);

    // Traffic avoidance using GraphHopper's custom model
    if (preferences.routingPreferences?.trafficTolerance === 'low') {
      customModelApplied = true;
      // Use GraphHopper's "safest" route preference with VERY strict avoidance
      params.append('ch.disable', 'true'); // Disable contraction hierarchies for more flexibility
      params.append('custom_model', JSON.stringify({
        "priority": [
          // BLOCK dangerous roads completely
          { "if": "road_class == MOTORWAY", "multiply_by": "0" },
          { "if": "road_class == TRUNK", "multiply_by": "0" },
          { "if": "road_class == PRIMARY", "multiply_by": "0.01" }, // Almost block primary roads
          { "if": "max_speed > 50", "multiply_by": "0.05" }, // Avoid high-speed roads
          // STRONGLY prefer safe infrastructure
          { "if": "bike_network != MISSING", "multiply_by": "3.0" }, // 3x preference for bike networks
          { "if": "road_class == CYCLEWAY", "multiply_by": "5.0" }, // 5x preference for dedicated bike paths
          { "if": "road_class == RESIDENTIAL", "multiply_by": "2.0" }, // 2x preference for residential streets
          { "if": "road_class == LIVING_STREET", "multiply_by": "2.5" }, // Prefer living streets
          { "if": "road_class == SERVICE", "multiply_by": "1.5" }, // Prefer service roads
          { "if": "surface == PAVED", "multiply_by": "1.3" }
        ],
        "distance_influence": 70 // Allow up to 70% longer routes for safety
      }));
      console.log('🚫 GraphHopper: Applying STRICT traffic avoidance - blocking motorways, trunks, and heavily penalizing primary roads');
    } else if (preferences.routingPreferences?.trafficTolerance === 'medium') {
      params.append('ch.disable', 'true');
      params.append('custom_model', JSON.stringify({
        "priority": [
          { "if": "road_class == MOTORWAY", "multiply_by": "0" }, // Still block motorways
          { "if": "road_class == TRUNK", "multiply_by": "0.05" }, // Heavily penalize trunks
          { "if": "road_class == PRIMARY", "multiply_by": "0.3" }, // Moderately avoid primary
          { "if": "max_speed > 70", "multiply_by": "0.1" }, // Avoid very high-speed roads
          { "if": "bike_network != MISSING", "multiply_by": "2.0" },
          { "if": "road_class == CYCLEWAY", "multiply_by": "3.0" },
          { "if": "road_class == RESIDENTIAL", "multiply_by": "1.5" }
        ],
        "distance_influence": 40 // Allow up to 40% longer for moderate safety
      }));
      console.log('⚖️ GraphHopper: Applying moderate traffic avoidance');
      customModelApplied = true;
    }

    // Bike infrastructure preference (only applies if no traffic tolerance was set)
    if (preferences.safetyPreferences?.bikeInfrastructure === 'strongly_preferred' ||
        preferences.safetyPreferences?.bikeInfrastructure === 'required') {

      if (!customModelApplied) {
        customModelApplied = true;
        // No traffic model set yet, create one focused on bike infrastructure
        params.append('ch.disable', 'true');

        const infraBoost = preferences.safetyPreferences.bikeInfrastructure === 'required' ? '3.0' : '2.0';

        params.append('custom_model', JSON.stringify({
          "priority": [
            // Block unsafe roads when infrastructure is required
            { "if": "road_class == MOTORWAY", "multiply_by": "0" },
            { "if": "road_class == TRUNK", "multiply_by": "0" },
            { "if": "road_class == PRIMARY", "multiply_by": preferences.safetyPreferences.bikeInfrastructure === 'required' ? "0" : "0.1" },
            // Strongly boost bike infrastructure
            { "if": "bike_network != MISSING", "multiply_by": infraBoost },
            { "if": "bike_network == LCN", "multiply_by": "2.5" }, // Local cycling network
            { "if": "bike_network == RCN", "multiply_by": "2.3" }, // Regional cycling network
            { "if": "bike_network == NCN", "multiply_by": "2.0" }, // National cycling network
            { "if": "road_class == CYCLEWAY", "multiply_by": "4.0" },
            { "if": "road_class == RESIDENTIAL", "multiply_by": "1.8" }
          ],
          "distance_influence": preferences.safetyPreferences.bikeInfrastructure === 'required' ? 80 : 50
        }));
        console.log(`🛣️ GraphHopper: Requiring bike infrastructure (${infraBoost}x boost)`);
      }
    }
  }

  // DEFAULT: Use standard bike profile
  // NOTE: custom_model requires paid GraphHopper plan ("Free packages cannot use flexible mode")
  // The free 'bike' profile already naturally avoids motorways and prefers bike-friendly roads
  if (!customModelApplied) {
    console.log('🚴 GraphHopper: Using standard bike profile (free tier - naturally avoids motorways)');
  }

  const url = `${GRAPHHOPPER_BASE_URL}/route?${params}&point=${points.replace(/\|/g, '&point=')}`;

  try {
    console.log(`Requesting GraphHopper cycling route with profile: ${profile}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GraphHopper API error: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const data = await response.json();
    
    if (!data.paths || data.paths.length === 0) {
      console.warn('No routes found in GraphHopper response');
      return null;
    }

    const route = data.paths[0];
    
    return {
      coordinates: route.points.coordinates, // GeoJSON format
      distance: route.distance, // meters
      duration: route.time, // milliseconds  
      elevation: {
        ascent: route.ascent || 0,
        descent: route.descent || 0
      },
      confidence: 0.9, // GraphHopper generally has high confidence
      profile: profile,
      source: 'graphhopper',
      bbox: data.bbox,
      instructions: route.instructions || []
    };

  } catch (error) {
    console.error('GraphHopper request failed:', error);
    return null;
  }
}

// Select appropriate cycling profile based on training goal or explicit profile
export function selectGraphHopperProfile(trainingGoal, explicitProfile = null) {
  // If explicit profile is provided, use it
  if (explicitProfile === 'gravel') {
    return GRAPHHOPPER_PROFILES.GRAVEL;
  }

  // NOTE: Free GraphHopper API only supports: bike, foot, car
  // racingbike and mtb require paid plans
  // We use 'bike' profile with custom_model to achieve similar results

  switch (trainingGoal) {
    case 'hills':
    case 'intervals':
    case 'endurance':
      return GRAPHHOPPER_PROFILES.BIKE; // Use bike with custom_model for road optimization

    case 'recovery':
      return GRAPHHOPPER_PROFILES.BIKE; // Standard bike (quieter roads)

    default:
      return GRAPHHOPPER_PROFILES.BIKE;
  }
}

// Validate GraphHopper service
export async function validateGraphHopperService() {
  const apiKey = getGraphHopperApiKey();
  
  if (!apiKey) {
    return {
      available: false,
      error: 'API key not configured',
      instructions: 'Get a free API key at https://www.graphhopper.com/'
    };
  }

  try {
    // Test with a simple request (London)
    const testUrl = `${GRAPHHOPPER_BASE_URL}/route?key=${apiKey}&vehicle=bike&point=51.5074,-0.1276&point=51.5100,-0.1200&points_encoded=false&calc_points=false`;
    
    const response = await fetch(testUrl);
    
    if (response.ok) {
      const data = await response.json();
      return { 
        available: true, 
        profiles: Object.values(GRAPHHOPPER_PROFILES),
        testDistance: data.paths?.[0]?.distance
      };
    } else {
      const errorText = await response.text();
      return { 
        available: false, 
        error: `API returned ${response.status}: ${errorText}`,
        instructions: 'Check your API key and quota'
      };
    }
  } catch (error) {
    return { 
      available: false, 
      error: error.message,
      instructions: 'Check your internet connection'
    };
  }
}

// Enhanced route generation using GraphHopper
export async function generateGraphHopperCyclingRoute(startCoord, endCoord, options = {}) {
  const {
    trainingGoal = 'endurance',
    alternatives = false
  } = options;

  const profile = selectGraphHopperProfile(trainingGoal);
  
  const routeOptions = {
    profile,
    elevation: true,
    alternatives,
    instructions: false
  };

  const route = await getGraphHopperCyclingDirections([startCoord, endCoord], routeOptions);
  
  if (route) {
    return {
      ...route,
      cyclingOptimized: true,
      trainingGoal
    };
  }

  return null;
}