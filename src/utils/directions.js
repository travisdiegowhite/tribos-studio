// Advanced route generation using Mapbox Map Matching API
// This provides more intelligent route snapping and better performance

// Map Matching API with intelligent radius fallback for better route snapping
export async function mapMatchRoute(waypoints, accessToken, options = {}) {
  console.log(`🔧 mapMatchRoute called with ${waypoints.length} waypoints`);
  
  if (waypoints.length < 2) {
    return { coordinates: waypoints, distance: 0, duration: 0, confidence: 0, profile: 'none' };
  }
  
  // Mapbox Map Matching API has a limit of 100 waypoints
  if (waypoints.length > 100) {
    console.warn(`Too many waypoints (${waypoints.length}), truncating to 100`);
    waypoints = waypoints.slice(0, 100);
  }
  
  const {
    profile = 'cycling',
    annotations = 'distance,duration',
    overview = 'full',
    geometries = 'geojson'
  } = options;

  // Try different radius sizes for better cycling route matching
  // Use consistent radius sizes regardless of waypoint count
  const radiusSizes = [15, 25, 50];
  
  for (const radius of radiusSizes) {
    console.log(`Trying map matching with ${radius}m radius...`);
    
    const radiuses = waypoints.map(() => radius);
    const coordinates = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
    const radiusStr = radiuses.join(';');
    
    const url = `https://api.mapbox.com/matching/v5/mapbox/${profile}/${coordinates}?` +
      `geometries=${geometries}&` +
      `radiuses=${radiusStr}&` +
      `steps=false&` +
      `annotations=${annotations}&` +
      `overview=${overview}&` +
      `access_token=${accessToken}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Map Matching API error with ${radius}m radius: ${response.status} ${response.statusText}`);
        continue; // Try next radius
      }
      
      const data = await response.json();
      
      if (!data.matchings || !data.matchings.length) {
        console.warn(`No matchings found with ${radius}m radius`);
        continue; // Try next radius
      }

      const matching = data.matchings[0];
      console.log(`✅ Map matching successful with ${radius}m radius, confidence: ${matching.confidence}, coords: ${matching.geometry.coordinates.length}/${waypoints.length}`);
      
      // Accept the match if confidence is reasonable or if we have good coordinate expansion
      // Lower confidence threshold for routes with more waypoints since they're naturally harder to match
      const minConfidence = waypoints.length > 4 ? 0.15 : 0.25;
      if (matching.confidence > minConfidence || matching.geometry.coordinates.length > waypoints.length * 1.5) {
        return {
          coordinates: matching.geometry.coordinates,
          distance: matching.distance || 0,
          duration: matching.duration || 0,
          confidence: matching.confidence || 0,
          profile: profile,
          radius: radius
        };
      } else {
        console.warn(`Low confidence (${matching.confidence} < ${minConfidence}) with ${radius}m radius, trying larger radius...`);
      }
    } catch (error) {
      console.warn(`Map Matching request failed with ${radius}m radius:`, error);
      continue; // Try next radius
    }
  }
  
  // If all radius sizes failed, fall back to Directions API
  console.log('All map matching attempts failed, falling back to Directions API...');
  return await getCyclingDirections(waypoints, accessToken, { profile });
}

// Elevation fetching using real elevation data
export async function fetchElevationProfile(coordinates, accessToken) {
  if (!coordinates || coordinates.length < 2) return [];
  
  try {
    // Sample points along the route (max 100 points for better accuracy)
    const maxPoints = 100;
    const step = Math.max(1, Math.floor(coordinates.length / maxPoints));
    const sampledCoords = coordinates.filter((_, i) => i % step === 0);
    
    // Add the last point if it wasn't included
    if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
      sampledCoords.push(coordinates[coordinates.length - 1]);
    }

    // Calculate total distance for proper distance values
    const totalDistance = calculateRouteDistance(coordinates);
    
    // Try to get real elevation data from multiple sources
    let elevationData = [];
    
    // Option 1: Try Open-Elevation API (free, no key required)
    try {
      const locations = sampledCoords.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }));
      
      // Open-Elevation API accepts up to 100 points per request
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          console.log('✅ Got real elevation data from Open-Elevation API');
          elevationData = data.results.map((result, index) => ({
            coordinate: [result.longitude, result.latitude],
            elevation: Math.round(result.elevation),
            distance: Math.round((index / (sampledCoords.length - 1)) * totalDistance)
          }));
          return elevationData;
        }
      }
    } catch (error) {
      console.warn('Open-Elevation API failed, trying Mapbox:', error);
    }
    
    // Option 2: Try Mapbox Terrain API if we have a token
    if (accessToken) {
      try {
        const elevationPromises = sampledCoords.map(async ([lon, lat], index) => {
          // Use Mapbox Tilequery API for elevation
          const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lon},${lat}.json?layers=contour&limit=50&access_token=${accessToken}`;
          
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            let elevation = 1600; // Default Denver elevation
            
            if (data.features && data.features.length > 0) {
              // Look for elevation contour lines
              for (const feature of data.features) {
                if (feature.properties && feature.properties.ele) {
                  elevation = feature.properties.ele;
                  break;
                }
              }
            }
            
            return {
              coordinate: [lon, lat],
              elevation: Math.round(elevation),
              distance: Math.round((index / (sampledCoords.length - 1)) * totalDistance)
            };
          }
          
          // Fallback to realistic elevation
          return {
            coordinate: [lon, lat],
            elevation: Math.round(getRealisticElevation(lat, lon)),
            distance: Math.round((index / (sampledCoords.length - 1)) * totalDistance)
          };
        });
        
        elevationData = await Promise.all(elevationPromises);
        console.log('✅ Got elevation data from Mapbox Terrain API');
        return elevationData;
      } catch (error) {
        console.warn('Mapbox Terrain API failed:', error);
      }
    }
    
    // Option 3: Fallback to realistic elevation simulation
    console.log('⚠️ Using simulated elevation data (API failed)');
    const elevationPromises = sampledCoords.map(async ([lon, lat], index) => {
      return {
        coordinate: [lon, lat],
        elevation: Math.round(getRealisticElevation(lat, lon)),
        distance: Math.round((index / (sampledCoords.length - 1)) * totalDistance)
      };
    });

    return await Promise.all(elevationPromises);
  } catch (error) {
    console.error('Elevation profile fetch failed:', error);
    return [];
  }
}

/**
 * Calculate total distance of a route from coordinates
 */
function calculateRouteDistance(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    totalDistance += calculateDistance([lat1, lon1], [lat2, lon2]);
  }
  
  return totalDistance * 1000; // Convert to meters
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance([lat1, lon1], [lat2, lon2]) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Provides a more realistic elevation fallback based on general geographic patterns
 */
function getRealisticElevation(lat, lon) {
  // Base elevation for Denver/Colorado area (around 1600m)
  let baseElevation = 1600;
  
  // Create terrain variation using multiple sine waves for realistic hills
  const largeTerrain = Math.sin(lat * 0.1) * Math.cos(lon * 0.1) * 200; // Large terrain features
  const mediumTerrain = Math.sin(lat * 0.5) * Math.cos(lon * 0.5) * 100; // Medium hills
  const smallTerrain = Math.sin(lat * 2) * Math.cos(lon * 2) * 30; // Small undulations
  
  // Add some randomness based on coordinates (but deterministic for same location)
  const coordHash = Math.sin(lat * 1000 + lon * 1000) * 50;
  
  const totalElevation = baseElevation + largeTerrain + mediumTerrain + smallTerrain + coordHash;
  
  return Math.max(0, Math.round(totalElevation));
}

// Calculate elevation statistics with threshold-based approach for accurate cycling metrics
export function calculateElevationStats(elevationProfile) {
  if (!elevationProfile || elevationProfile.length < 2) {
    return { gain: 0, loss: 0, min: 0, max: 0 };
  }

  // Filter out invalid elevations and ensure we have valid data
  const validProfile = elevationProfile.filter(point => 
    point && typeof point.elevation === 'number' && !isNaN(point.elevation) && point.elevation >= 0
  );
  
  if (validProfile.length < 2) {
    return { gain: 0, loss: 0, min: 0, max: 0 };
  }

  let totalGain = 0;
  let totalLoss = 0;
  let min = validProfile[0].elevation;
  let max = validProfile[0].elevation;
  
  // Threshold for meaningful elevation changes (3 meters)
  // This helps filter out GPS/measurement noise
  const elevationThreshold = 3;
  
  // Track cumulative elevation change since last significant change
  let cumulativeChange = 0;
  let lastSignificantElevation = validProfile[0].elevation;
  
  for (let i = 1; i < validProfile.length; i++) {
    const currentElevation = validProfile[i].elevation;
    const change = currentElevation - lastSignificantElevation;
    
    // Update min/max
    min = Math.min(min, currentElevation);
    max = Math.max(max, currentElevation);
    
    // Accumulate small changes
    cumulativeChange += (currentElevation - validProfile[i-1].elevation);
    
    // Only count significant cumulative changes
    if (Math.abs(cumulativeChange) >= elevationThreshold) {
      if (cumulativeChange > 0) {
        totalGain += cumulativeChange;
      } else {
        totalLoss += Math.abs(cumulativeChange);
      }
      
      // Reset for next accumulation
      cumulativeChange = 0;
      lastSignificantElevation = currentElevation;
    }
  }
  
  // Add any remaining cumulative change
  if (Math.abs(cumulativeChange) > 0) {
    if (cumulativeChange > 0) {
      totalGain += cumulativeChange;
    } else {
      totalLoss += Math.abs(cumulativeChange);
    }
  }

  const result = { 
    gain: Math.round(Math.max(0, totalGain)), 
    loss: Math.round(Math.max(0, totalLoss)), 
    min: Math.round(min), 
    max: Math.round(max) 
  };
  
  // Debug elevation calculations
  console.log('🏔️ Elevation Stats:', {
    profileLength: validProfile.length,
    elevationRange: `${result.min}m - ${result.max}m`,
    gain: `${result.gain}m`,
    loss: `${result.loss}m`,
    sampleElevations: validProfile.slice(0, 5).map(p => `${Math.round(p.elevation)}m`)
  });
  
  return result;
}

// Legacy functions for backward compatibility
export async function fetchCyclingSegment(start, end, accessToken) {
  const result = await mapMatchRoute([start, end], accessToken);
  return result.coordinates || null;
}

// Get cycling directions between points using Directions API
export async function getCyclingDirections(waypoints, accessToken, options = {}) {
  if (waypoints.length < 2) {
    return { coordinates: waypoints, distance: 0, duration: 0, confidence: 0 };
  }

  const {
    profile = 'cycling', // Use cycling profile for bike-friendly routes
    alternatives = false,
    steps = false,
    geometries = 'geojson',
    overview = 'full',
    preferences = null // User preferences for enhanced routing
  } = options;

  // Format coordinates for the API
  const coordinates = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
  
  // Enhanced traffic avoidance system based on user preferences
  let excludeParam = '';
  let routingProfile = profile;
  let annotations = 'distance,duration';

  console.log('🔧 getCyclingDirections called with preferences:', preferences);

  // UPDATED: Mapbox Directions API only supports: ferry, cash_only_tolls, unpaved, tunnel
  // motorway, trunk, toll, primary are NO LONGER valid exclude values

  // Check if user wants gravel/unpaved roads (for gravel cycling)
  const wantsUnpaved = preferences?.surfaceType === 'gravel' ||
                       preferences?.preferences?.surfaceType === 'gravel' ||
                       preferences?.preferences?.trailPreference === true;

  // CRITICAL: For gravel routes, use walking profile which has access to trails and unpaved paths
  if (wantsUnpaved) {
    routingProfile = 'walking'; // Walking profile can access trails, paths, and unpaved roads
    excludeParam = '&exclude=cash_only_tolls,ferry'; // Don't exclude unpaved!
    annotations += ',congestion';
    console.log('🌲🚶 GRAVEL MODE: Using walking profile for trail/unpaved road access');
  } else if (preferences?.routingPreferences?.trafficTolerance === 'low') {
    // Low traffic tolerance for paved cycling
    excludeParam = '&exclude=cash_only_tolls,unpaved,ferry';
    annotations += ',congestion';
    console.log('🚫 Low traffic tolerance - excluding tolls, unpaved roads, and ferries');

    // For very quiet roads, consider walking profile which often uses local streets
    if (preferences?.scenicPreferences?.quietnessLevel === 'high') {
      routingProfile = 'walking';
      console.log('🤫 High quietness preference - using walking profile for local roads');
    }
  } else if (preferences?.routingPreferences?.trafficTolerance === 'medium') {
    // Medium traffic tolerance - moderate avoidance
    excludeParam = '&exclude=cash_only_tolls,ferry';
    annotations += ',congestion';
    console.log('⚖️ Medium traffic tolerance - excluding tolls and ferries');
  } else if (preferences?.routingPreferences?.trafficTolerance === 'high') {
    // High traffic tolerance - minimal restrictions
    excludeParam = '&exclude=ferry'; // Only exclude ferries
    console.log('🚗 High traffic tolerance - allowing most road types');
  } else {
    // DEFAULT: No preference specified - use safe cycling defaults
    // NOTE: We can't exclude motorways/trunks anymore, but cycling profile naturally avoids them
    excludeParam = '&exclude=ferry';
    console.log('🚴 No traffic preference - using cycling profile (naturally avoids highways)');
  }
  
  // Additional exclusions based on bike infrastructure preferences
  if (preferences?.safetyPreferences?.bikeInfrastructure === 'required') {
    // Most restrictive - must have bike infrastructure
    excludeParam += excludeParam.includes('exclude=') ? ',tunnel' : '&exclude=tunnel';
    routingProfile = 'walking'; // Walking profile better for bike paths
    console.log('🚴 Bike infrastructure required - using walking profile and avoiding tunnels');
  } else if (preferences?.safetyPreferences?.bikeInfrastructure === 'strongly_preferred') {
    // Prefer routes without tunnels for better cycling experience
    excludeParam += excludeParam.includes('exclude=') ? ',tunnel' : '&exclude=tunnel';
    console.log('🚴 Bike infrastructure strongly preferred - avoiding tunnels');
  }
  
  // Try multiple routing strategies for quiet road preferences
  if (preferences?.scenicPreferences?.quietnessLevel === 'high' || 
      preferences?.routingPreferences?.trafficTolerance === 'low') {
    
    console.log('🔄 Attempting quiet road routing with multiple strategies');
    
    // Strategy 1: Try walking profile for quietest roads
    const quietRoute = await attemptQuietRouting(coordinates, accessToken, {
      profile: 'walking',
      excludeParam,
      annotations,
      geometries,
      overview,
      alternatives
    });

    if (quietRoute.success && quietRoute.route?.geometry?.coordinates?.length > waypoints.length) {
      console.log('✅ Quiet routing successful with walking profile');
      const route = quietRoute.route;
      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance || 0,
        duration: route.duration || 0,
        confidence: 0.85, // Slightly lower confidence for walking profile
        profile: 'walking',
        trafficScore: calculateTrafficScore(route, 'low'),
        quietnessScore: 0.9,
        congestionData: route.legs?.[0]?.annotation?.congestion || []
      };
    }
    
    // Strategy 2: Try cycling profile with strict exclusions
    if (routingProfile !== 'walking') {
      const moderateRoute = await attemptQuietRouting(coordinates, accessToken, {
        profile: 'cycling',
        excludeParam,
        annotations,
        geometries,
        overview,
        alternatives: true // Request alternatives to find quieter options
      });

      if (moderateRoute.success && moderateRoute.route?.geometry?.coordinates) {
        // If alternatives are available, pick the one that seems quietest
        const bestRoute = selectQuietestRoute(moderateRoute.route, moderateRoute.alternatives);
        console.log('✅ Moderate quiet routing successful with cycling profile');
        return {
          coordinates: bestRoute.geometry.coordinates,
          distance: bestRoute.distance || 0,
          duration: bestRoute.duration || 0,
          confidence: 0.9,
          profile: 'cycling',
          trafficScore: calculateTrafficScore(bestRoute, 'medium'),
          quietnessScore: 0.75,
          congestionData: bestRoute.legs?.[0]?.annotation?.congestion || []
        };
      }
    }
  }
  
  // Fallback: Standard routing with user preferences
  const url = `https://api.mapbox.com/directions/v5/mapbox/${routingProfile}/${coordinates}?` +
    `alternatives=${alternatives}&` +
    `geometries=${geometries}&` +
    `overview=${overview}&` +
    `steps=${steps}&` +
    `annotations=${annotations}${excludeParam}&` +
    `access_token=${accessToken}`;

  // Debug traffic avoidance
  console.log('🛣️ Mapbox URL:', url.replace(/access_token=[^&]+/, 'access_token=***'));
  console.log('🚫 Exclude param:', excludeParam);
  console.log('🔧 Routing profile:', routingProfile);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Directions API error: ${response.status} ${response.statusText}`);
      console.error(`Error details:`, errorText);
      return { coordinates: waypoints, distance: 0, duration: 0, confidence: 0 };
    }

    const data = await response.json();
    
    if (!data.routes || !data.routes.length) {
      console.warn('No routes found in directions response');
      return { coordinates: waypoints, distance: 0, duration: 0, confidence: 0 };
    }

    const route = data.routes[0];
    const trafficTolerance = preferences?.routingPreferences?.trafficTolerance || 'medium';
    
    console.log(`✅ Standard routing successful with ${routingProfile} profile`);
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance || 0,
      duration: route.duration || 0,
      confidence: 0.9,
      profile: routingProfile,
      trafficScore: calculateTrafficScore(route, trafficTolerance),
      quietnessScore: calculateQuietnessScore(route, preferences),
      congestionData: route.legs?.[0]?.annotation?.congestion || []
    };
  } catch (error) {
    console.error('Directions request failed:', error);
    return { coordinates: waypoints, distance: 0, duration: 0, confidence: 0 };
  }
}

// Helper function to attempt quiet road routing
async function attemptQuietRouting(coordinates, accessToken, strategyOptions) {
  const { profile, excludeParam, annotations, geometries, overview, alternatives } = strategyOptions;
  
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?` +
    `alternatives=${alternatives}&` +
    `geometries=${geometries}&` +
    `overview=${overview}&` +
    `steps=false&` +
    `annotations=${annotations}${excludeParam}&` +
    `access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    if (!data.routes || !data.routes.length) {
      return { success: false, error: 'No routes found' };
    }

    return { 
      success: true, 
      route: data.routes[0],
      alternatives: data.routes.slice(1) || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Helper function to select the quietest route from alternatives
function selectQuietestRoute(mainRoute, alternatives) {
  if (!alternatives || alternatives.length === 0) {
    return mainRoute;
  }
  
  const allRoutes = [mainRoute, ...alternatives];
  
  // Score routes based on distance and likely traffic (prefer longer, more winding routes for quietness)
  const scoredRoutes = allRoutes.map(route => ({
    route,
    quietnessScore: calculateRouteQuietnessScore(route)
  }));
  
  // Sort by quietness score (higher is better)
  scoredRoutes.sort((a, b) => b.quietnessScore - a.quietnessScore);
  
  console.log(`🔍 Selected route with quietness score: ${scoredRoutes[0].quietnessScore.toFixed(2)}`);
  return scoredRoutes[0].route;
}

// Calculate route quietness score based on characteristics
function calculateRouteQuietnessScore(route) {
  let score = 0.5; // Base score
  
  // Prefer routes that are 5-15% longer (likely using smaller roads)
  const distanceKm = (route.distance || 0) / 1000;
  if (distanceKm > 5) {
    // Longer routes often use quieter roads
    score += 0.1;
  }
  
  // Check if route has many turns (indicator of local roads)
  if (route.geometry && route.geometry.coordinates) {
    const coordinates = route.geometry.coordinates;
    const turnDensity = calculateTurnDensity(coordinates);
    if (turnDensity > 0.5) {
      score += 0.2; // More turns often means local roads
    }
  }
  
  // Check congestion data if available
  if (route.legs && route.legs[0] && route.legs[0].annotation && route.legs[0].annotation.congestion) {
    const congestionLevels = route.legs[0].annotation.congestion;
    const lowCongestionRatio = congestionLevels.filter(level => level === 'low' || level === 'unknown').length / congestionLevels.length;
    score += lowCongestionRatio * 0.3;
  }
  
  return Math.min(1.0, score);
}

// Calculate turn density for a route
function calculateTurnDensity(coordinates) {
  if (coordinates.length < 3) return 0;
  
  let significantTurns = 0;
  let totalSegments = 0;
  
  for (let i = 1; i < coordinates.length - 1; i++) {
    const bearing1 = calculateBearing(coordinates[i - 1], coordinates[i]);
    const bearing2 = calculateBearing(coordinates[i], coordinates[i + 1]);
    
    let bearingChange = Math.abs(bearing2 - bearing1);
    if (bearingChange > 180) bearingChange = 360 - bearingChange;
    
    if (bearingChange > 30) { // Significant turn
      significantTurns++;
    }
    totalSegments++;
  }
  
  return totalSegments > 0 ? significantTurns / totalSegments : 0;
}

// Calculate traffic score based on route characteristics and user tolerance
function calculateTrafficScore(route, trafficTolerance) {
  let score = 0.7; // Default moderate traffic score
  
  // Adjust based on user tolerance
  const toleranceMultipliers = {
    'low': 0.3,    // Assume lower traffic with strict exclusions
    'medium': 0.7, // Moderate traffic expected
    'high': 1.0    // Accept higher traffic
  };
  
  score *= toleranceMultipliers[trafficTolerance] || 0.7;
  
  // Adjust based on congestion data if available
  if (route.legs && route.legs[0] && route.legs[0].annotation && route.legs[0].annotation.congestion) {
    const congestionLevels = route.legs[0].annotation.congestion;
    const highCongestionRatio = congestionLevels.filter(level => level === 'severe' || level === 'heavy').length / congestionLevels.length;
    score *= (1 - highCongestionRatio * 0.5); // Reduce score for high congestion
  }
  
  return Math.max(0.1, Math.min(1.0, score));
}

// Calculate quietness score based on route and preferences
function calculateQuietnessScore(route, preferences) {
  let score = 0.5; // Base score
  
  const quietnessLevel = preferences?.scenicPreferences?.quietnessLevel || 'medium';
  const trafficTolerance = preferences?.routingPreferences?.trafficTolerance || 'medium';
  
  // Base scoring by user preferences
  if (quietnessLevel === 'high' && trafficTolerance === 'low') {
    score = 0.8; // High expectation of quiet roads
  } else if (quietnessLevel === 'medium' || trafficTolerance === 'medium') {
    score = 0.6; // Moderate expectation
  } else {
    score = 0.4; // Lower expectation for quiet roads
  }
  
  return score;
}

// Calculate bearing between two points
function calculateBearing([lon1, lat1], [lon2, lat2]) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

export async function buildSnappedRoute(waypoints, accessToken, onProgress) {
  if (waypoints.length < 2) return [...waypoints];
  
  onProgress && onProgress(0.1);
  
  // Try Directions API first for better cycling routes
  let result = await getCyclingDirections(waypoints, accessToken);
  
  // If directions fails or has low confidence, fall back to map matching
  if (!result.coordinates || result.coordinates.length < 2 || result.confidence < 0.5) {
    console.log('Falling back to map matching for route snapping');
    result = await mapMatchRoute(waypoints, accessToken);
  }
  
  onProgress && onProgress(1.0);
  
  return result.coordinates || waypoints;
}
