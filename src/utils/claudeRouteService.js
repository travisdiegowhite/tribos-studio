// Claude AI Route Generation Service
// Handles prompting and parsing for AI-generated cycling routes
//
// This service uses Claude to:
// 1. Parse natural language requests into structured waypoints (place names)
// 2. Geocode those waypoints to coordinates
// 3. Route through the actual places the user requested
//
// Key insight: Claude extracts PLACE NAMES from user requests, then we geocode them.
// This is different from asking Claude to generate geometric routes.

import { getSmartCyclingRoute, getRoutingStrategyDescription } from './smartCyclingRouter';
import { matchRouteToOSM, getTrailWaypoints } from './osmCyclingService';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Geocode a place name to coordinates using Mapbox
 * @param {string} placeName - Name of place (e.g., "Coal Creek Trail", "Boulder, CO")
 * @param {Object} proximity - Optional proximity bias {lat, lng}
 * @returns {Promise<Object|null>} - {coordinates: [lng, lat], address: string} or null
 */
async function geocodePlace(placeName, proximity = null) {
  if (!placeName?.trim()) return null;
  if (!MAPBOX_TOKEN) {
    console.warn('Mapbox token not available for geocoding');
    return null;
  }

  try {
    const encodedPlace = encodeURIComponent(placeName);
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedPlace}.json?access_token=${MAPBOX_TOKEN}&country=US&types=place,locality,address,poi,neighborhood`;

    if (proximity) {
      url += `&proximity=${proximity.lng},${proximity.lat}`;
    }

    console.log(`🔍 Geocoding: "${placeName}"${proximity ? ' with proximity bias' : ''}`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [longitude, latitude] = feature.center;
      console.log(`✅ Geocoded "${placeName}" → ${feature.place_name}`);
      return {
        coordinates: { lat: latitude, lng: longitude },
        address: feature.place_name
      };
    } else {
      console.warn(`⚠️ Could not geocode: "${placeName}"`);
      return null;
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Generate route suggestions using Claude AI
 * @param {Object} params - Route generation parameters
 * @returns {Promise<Array>} - Array of route suggestions
 */
export async function generateClaudeRoutes(params) {
  const {
    startLocation,       // {lat, lng} or [lng, lat]
    timeAvailable,       // minutes
    targetDistanceKm,    // Explicit distance in km (if user specified)
    trainingGoal = 'endurance',  // 'endurance' | 'intervals' | 'hills' | 'recovery'
    routeType = 'loop',  // 'loop' | 'out_back' | 'point_to_point'
    weatherData,         // Optional weather info
    userPreferences,     // Optional user preferences
    userRequest          // The user's natural language request (e.g., "30 mile loop on Coal Creek Path")
  } = params;

  // Normalize start location
  const startLat = startLocation.lat || startLocation[1];
  const startLng = startLocation.lng || startLocation[0];

  // Use explicit distance if provided, otherwise calculate from time
  const targetDistance = targetDistanceKm || calculateTargetDistance(timeAvailable, trainingGoal);
  console.log(`🎯 Target distance: ${targetDistance.toFixed(1)} km ${targetDistanceKm ? '(user specified)' : '(calculated from time)'}`);
  if (userRequest) {
    console.log(`📝 User request: "${userRequest}"`);
  }

  // Build the prompt
  const prompt = buildRoutePrompt({
    startLat,
    startLng,
    targetDistance,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData,
    userPreferences,
    userRequest
  });

  try {
    // Call the secure backend API
    const apiUrl = import.meta.env.PROD ? '/api/claude-routes' : 'http://localhost:3000/api/claude-routes';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        maxTokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate routes');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Route generation failed');
    }

    // Parse Claude's response
    const routes = parseClaudeResponse(data.content, {
      startLat,
      startLng,
      targetDistance,
      trainingGoal
    });

    return routes;

  } catch (error) {
    console.error('Claude route generation error:', error);
    throw error;
  }
}

/**
 * Build the prompt for Claude - NEW APPROACH
 * Instead of asking for abstract route descriptions, we ask Claude to:
 * 1. Parse the user's natural language request
 * 2. Extract specific WAYPOINT NAMES (trails, towns, landmarks)
 * 3. Return those waypoint names so we can geocode them to real coordinates
 *
 * This is the key difference from the old broken approach.
 */
function buildRoutePrompt(params) {
  const {
    startLat,
    startLng,
    targetDistance,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData,
    userPreferences,
    userRequest,
    userAddress
  } = params;

  // If no user request, use the old approach (for structured form input)
  if (!userRequest) {
    return buildStructuredRoutePrompt(params);
  }

  // NEW: Natural language waypoint extraction prompt
  // This prompt asks Claude to extract PLACE NAMES from the user's request
  const prompt = `You are an expert cycling route planner. A cyclist has made this request:

"${userRequest}"

Their current location: ${startLat.toFixed(5)}, ${startLng.toFixed(5)}${userAddress ? ` (near ${userAddress})` : ''}
Target distance: ${targetDistance.toFixed(1)} km (${(targetDistance / 1.60934).toFixed(1)} miles)
Route type preference: ${routeType}

Your task: Extract and interpret the route requirements, then suggest SPECIFIC WAYPOINTS (real places that can be geocoded).

**CRITICAL INSTRUCTIONS:**
1. If the user mentions specific trails, paths, or roads (e.g., "Coal Creek Path", "Boulder Creek Trail"), include them as waypoints
2. If the user mentions directions (e.g., "heading south"), note this for the route
3. Suggest 1-3 intermediate waypoint names that will help create the requested route
4. Waypoints should be REAL PLACE NAMES that exist and can be geocoded (towns, trails, parks, landmarks)
5. Keep waypoints logically ordered for the route type

**OUTPUT FORMAT - Return ONLY this JSON (no markdown, no explanation):**
{
  "routes": [
    {
      "name": "Descriptive route name",
      "description": "Why this matches the request",
      "waypoints": ["First Waypoint Name", "Second Waypoint Name"],
      "routeType": "loop|out_back|point_to_point",
      "estimatedDistance": ${targetDistance.toFixed(1)},
      "difficulty": "easy|moderate|hard",
      "surfaceType": "paved|gravel|mixed",
      "initialDirection": "north|south|east|west|null"
    }
  ]
}

**EXAMPLES:**

User: "30 mile loop heading south on Coal Creek Path"
Response:
{
  "routes": [
    {
      "name": "Coal Creek Path South Loop",
      "description": "Head south on Coal Creek Path, loop through Superior and return",
      "waypoints": ["Coal Creek Trail", "Superior, CO"],
      "routeType": "loop",
      "estimatedDistance": 48.3,
      "difficulty": "moderate",
      "surfaceType": "mixed",
      "initialDirection": "south"
    }
  ]
}

User: "2 hour ride to Lyons and back"
Response:
{
  "routes": [
    {
      "name": "Lyons Out-and-Back",
      "description": "Scenic ride to Lyons through the foothills",
      "waypoints": ["Lyons, CO"],
      "routeType": "out_back",
      "estimatedDistance": 60,
      "difficulty": "moderate",
      "surfaceType": "paved",
      "initialDirection": "north"
    }
  ]
}

User: "gravel loop from Boulder through the mountains"
Response:
{
  "routes": [
    {
      "name": "Boulder Mountain Gravel Loop",
      "description": "Gravel roads through Nederland and Ward",
      "waypoints": ["Nederland, CO", "Ward, CO"],
      "routeType": "loop",
      "estimatedDistance": 80,
      "difficulty": "hard",
      "surfaceType": "gravel",
      "initialDirection": "west"
    }
  ]
}

**IMPORTANT:**
- Generate 2-3 route variations with DIFFERENT waypoints
- Use REAL place names near the user's location
- If the user mentions a specific trail/path, ALWAYS include it as a waypoint
- Trail names like "Coal Creek Trail" ARE valid waypoints (Mapbox can geocode them)

Now parse this request and return the JSON:`;

  return prompt;
}

/**
 * Build structured route prompt (for form-based input without natural language)
 */
function buildStructuredRoutePrompt(params) {
  const {
    startLat,
    startLng,
    targetDistance,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData
  } = params;

  // Training goal descriptions
  const goalDescriptions = {
    endurance: 'Steady, sustainable pace with minimal stops. Focus on maintaining consistent effort in Zone 2-3.',
    intervals: 'High-intensity intervals with recovery periods. Include flat or gently rolling sections for hard efforts.',
    recovery: 'Easy spinning at conversational pace. Minimal elevation gain, focus on flat terrain.',
    hills: 'Climbing strength and power development. Prioritize routes with sustained climbs and varied gradients.'
  };

  const prompt = `You are an expert cycling coach and route planner. Generate 3 cycling route suggestions based on these parameters:

**LOCATION & DISTANCE**
- Start Location: ${startLat.toFixed(6)}, ${startLng.toFixed(6)}
- Target Distance: ${targetDistance.toFixed(1)} km
- Available Time: ${timeAvailable} minutes
- Route Type: ${routeType}

**TRAINING GOAL: ${trainingGoal.toUpperCase()}**
${goalDescriptions[trainingGoal]}

${weatherData ? `**WEATHER CONDITIONS**
- Temperature: ${weatherData.temp}°C
- Conditions: ${weatherData.condition}
- Wind: ${weatherData.wind || 'Light'}
` : ''}

**OUTPUT FORMAT - Return ONLY this JSON:**
{
  "routes": [
    {
      "name": "Descriptive route name",
      "description": "Brief explanation of why this route matches the training goal",
      "waypoints": ["Town or Landmark 1", "Town or Landmark 2"],
      "routeType": "${routeType}",
      "estimatedDistance": ${targetDistance.toFixed(1)},
      "difficulty": "easy|moderate|hard",
      "surfaceType": "paved|gravel|mixed",
      "initialDirection": "north|south|east|west"
    }
  ]
}

**IMPORTANT:**
- waypoints should be REAL place names near the start location that can be geocoded
- Generate 3 different route variations with different waypoints
- Match difficulty to training goal

Generate the routes now:`;

  return prompt;
}

/**
 * Parse Claude's JSON response into route objects
 * NEW: Now handles waypoint arrays for geocoding
 */
function parseClaudeResponse(responseText, context) {
  try {
    // Clean up the response (remove markdown code blocks if present)
    let cleanedText = responseText.trim();
    cleanedText = cleanedText.replace(/^```json\n?/gm, '');
    cleanedText = cleanedText.replace(/^```\n?/gm, '');
    cleanedText = cleanedText.replace(/```$/gm, '');

    const parsed = JSON.parse(cleanedText);

    if (!parsed.routes || !Array.isArray(parsed.routes)) {
      throw new Error('Invalid response format - missing routes array');
    }

    // Map to internal route format - NOW INCLUDES WAYPOINT NAMES
    return parsed.routes.map(route => ({
      name: route.name,
      description: route.description,
      distance: route.estimatedDistance,
      elevationGain: route.estimatedElevation || 0,
      difficulty: route.difficulty,
      estimatedTime: route.estimatedTime || context.timeAvailable,
      trainingGoal: context.trainingGoal,
      // NEW: Store waypoint names for geocoding
      waypointNames: route.waypoints || [],
      surfaceType: route.surfaceType || 'mixed',
      initialDirection: route.initialDirection || null,
      routeType: route.routeType || context.routeType || 'loop',
      // Legacy support
      keyDirections: route.keyDirections || [],
      trainingFocus: route.trainingFocus || route.description,
      source: 'claude',
      confidence: 0.85,
      needsRouting: true, // Needs conversion to actual GPS coordinates
      startLocation: {
        lat: context.startLat,
        lng: context.startLng
      }
    }));

  } catch (error) {
    console.error('Error parsing Claude response:', error);
    console.error('Response text:', responseText);
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

/**
 * Calculate target distance based on available time and training goal
 */
function calculateTargetDistance(timeMinutes, trainingGoal) {
  // Default speed assumptions (km/h) based on training goal
  const speedMap = {
    recovery: 16,      // Easy recovery pace
    endurance: 22,     // Sustainable endurance pace
    intervals: 20,     // Intervals with rest periods
    hills: 15          // Climbing pace
  };

  const baseSpeed = speedMap[trainingGoal] || 20;
  const timeHours = timeMinutes / 60;

  return timeHours * baseSpeed;
}

/**
 * Convert a Claude route suggestion to actual GPS coordinates
 * NEW APPROACH: Geocode waypoint NAMES from Claude's response, then route through them
 *
 * This is the key fix - instead of generating geometric waypoints, we:
 * 1. Take the waypoint names Claude extracted (e.g., ["Coal Creek Trail", "Superior, CO"])
 * 2. Geocode each to real coordinates
 * 3. Route through those actual locations
 *
 * @param {Object} claudeRoute - Route suggestion from Claude (with waypointNames array)
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Route with GPS coordinates
 */
export async function convertClaudeToRoute(claudeRoute, options = {}) {
  const {
    mapboxToken,
    profile = 'road',
    userSpeed = null,
    routeIndex = 0,
    userRequest = null
  } = typeof options === 'string' ? { mapboxToken: options } : options;

  console.log('🚴 Converting Claude route to GPS coordinates:', claudeRoute.name);
  console.log('📍 Profile:', profile, '| Waypoint names:', claudeRoute.waypointNames);

  const { startLocation, distance, routeType, trainingGoal, waypointNames, surfaceType, initialDirection } = claudeRoute;

  try {
    // Step 1: Build waypoints array starting with user's location
    const waypoints = [startLocation];

    // Step 2: GEOCODE each waypoint name to coordinates - THIS IS THE KEY FIX
    if (waypointNames && waypointNames.length > 0) {
      console.log(`🗺️ Geocoding ${waypointNames.length} waypoint names...`);

      for (const waypointName of waypointNames) {
        const geocoded = await geocodePlace(waypointName, startLocation);

        if (geocoded) {
          waypoints.push(geocoded.coordinates);
          console.log(`✅ Waypoint "${waypointName}" → ${geocoded.address}`);
        } else {
          // Try OSM matching as fallback for trails
          try {
            const osmMatch = await matchRouteToOSM({ name: waypointName }, startLocation);
            if (osmMatch) {
              waypoints.push({ lat: osmMatch.lat, lng: osmMatch.lng });
              console.log(`✅ Waypoint "${waypointName}" → OSM: ${osmMatch.name}`);
            } else {
              console.warn(`⚠️ Could not geocode or OSM-match waypoint: "${waypointName}"`);
            }
          } catch (osmErr) {
            console.warn(`⚠️ Could not find waypoint: "${waypointName}"`);
          }
        }
      }
    }

    // Step 3: If no waypoints were geocoded, fall back to geometric generation
    if (waypoints.length === 1) {
      console.log('⚠️ No waypoints geocoded, falling back to geometric generation');
      const geometricWaypoints = generateRouteWaypoints(startLocation, distance, routeType || 'loop', {
        routeIndex,
        keyDirections: claudeRoute.keyDirections || [],
        trainingGoal
      });
      waypoints.push(...geometricWaypoints.slice(1)); // Skip first (start) point
    }

    // Step 4: Close the loop if needed
    if (routeType === 'loop' || routeType === 'out_back') {
      // Make sure we return to start
      const lastWaypoint = waypoints[waypoints.length - 1];
      if (lastWaypoint.lat !== startLocation.lat || lastWaypoint.lng !== startLocation.lng) {
        waypoints.push(startLocation);
      }
    }

    // Convert waypoints to [lon, lat] format for smart router
    const waypointsArray = waypoints.map(wp => [wp.lng, wp.lat]);

    console.log(`📍 Routing through ${waypointsArray.length} waypoints (${waypoints.length - 1} geocoded)`);

    // Determine routing profile based on surface type
    let routingProfile = profile;
    if (surfaceType === 'gravel') {
      routingProfile = 'gravel';
    } else if (surfaceType === 'mixed') {
      routingProfile = 'road'; // Default to road for mixed
    }

    // Step 5: Use smart cycling router to generate actual route
    const routeResult = await getSmartCyclingRoute(waypointsArray, {
      profile: routingProfile,
      trainingGoal: trainingGoal || 'endurance',
      mapboxToken,
      userSpeed
    });

    if (!routeResult || !routeResult.coordinates || routeResult.coordinates.length < 10) {
      throw new Error('Smart router failed to generate route through waypoints');
    }

    // Get human-readable routing strategy description
    const routingStrategy = getRoutingStrategyDescription(routeResult);

    console.log(`✅ Route generated via ${routeResult.source}: ${(routeResult.distance / 1000).toFixed(1)}km`);
    console.log(`📊 Strategy: ${routingStrategy}`);

    return {
      ...claudeRoute,
      coordinates: routeResult.coordinates,
      geometry: {
        type: 'LineString',
        coordinates: routeResult.coordinates
      },
      distance: routeResult.distance / 1000, // Convert meters to km
      duration: routeResult.duration / 60, // Convert seconds to minutes
      elevationGain: routeResult.elevationGain || claudeRoute.elevationGain || 0,
      elevationLoss: routeResult.elevationLoss || 0,
      waypoints: waypoints,
      waypointNames: waypointNames, // Keep original names for display
      needsRouting: false,
      routingSource: routeResult.source,
      routingStrategy,
      confidence: routeResult.confidence,
      profile: routeResult.profile || routingProfile
    };

  } catch (error) {
    console.error('❌ Error converting Claude route to GPS:', error);
    throw new Error(`Failed to generate route coordinates: ${error.message}`);
  }
}

/**
 * Parse direction from key directions text (e.g., "Head north" -> 0 degrees)
 */
function parseDirectionFromText(keyDirections) {
  if (!keyDirections || keyDirections.length === 0) return null;

  const directionText = keyDirections.join(' ').toLowerCase();

  // Cardinal and ordinal directions in degrees (0 = north, clockwise)
  const directions = {
    'north': 0, 'n ': 0,
    'northeast': 45, 'ne ': 45,
    'east': 90, 'e ': 90,
    'southeast': 135, 'se ': 135,
    'south': 180, 's ': 180,
    'southwest': 225, 'sw ': 225,
    'west': 270, 'w ': 270,
    'northwest': 315, 'nw ': 315
  };

  for (const [dir, angle] of Object.entries(directions)) {
    if (directionText.includes(dir)) {
      return angle;
    }
  }

  return null;
}

/**
 * Generate waypoints for route based on start location, distance, and type
 * Creates distinct routes by using different base directions for each route index
 */
function generateRouteWaypoints(startLocation, targetDistanceKm, routeType, options = {}) {
  const { lat, lng } = startLocation;
  const { routeIndex = 0, keyDirections = [], trainingGoal = 'endurance' } = options;

  // Approximate degrees per km (rough calculation for latitude)
  const degreesPerKm = 1 / 111; // ~111km per degree latitude
  const lngCorrection = Math.cos(lat * Math.PI / 180);

  // Try to parse direction from Claude's keyDirections
  const parsedDirection = parseDirectionFromText(keyDirections);

  // Base directions for each route index (spread apart by 120 degrees for 3 routes)
  // Route 0: North-ish, Route 1: Southeast-ish, Route 2: Southwest-ish
  const baseDirections = [0, 120, 240];

  // Use parsed direction if available, otherwise use route-index-based direction
  let baseAngle = parsedDirection !== null
    ? parsedDirection
    : baseDirections[routeIndex % baseDirections.length];

  // Add some randomness to prevent exact same routes on repeated requests
  // But keep it deterministic within a session by using route index
  const angleVariation = ((routeIndex * 17) % 30) - 15; // -15 to +15 degrees variation
  baseAngle = (baseAngle + angleVariation + 360) % 360;

  // Convert to radians
  const baseAngleRad = (baseAngle * Math.PI) / 180;

  console.log(`📐 Route ${routeIndex}: Base direction ${baseAngle.toFixed(0)}° (${getDirectionName(baseAngle)})`);

  if (routeType === 'loop') {
    // Create varied loop shapes based on route index
    // Different shapes: elongated, figure-8 influenced, cloverleaf influenced
    const numWaypoints = 5 + (routeIndex % 3); // 5, 6, or 7 waypoints for variety
    const radiusKm = targetDistanceKm / (Math.PI * 2); // Base radius
    const waypoints = [];

    // Shape variation based on route index
    const shapeFactors = [
      { xStretch: 1.3, yStretch: 0.8 },   // Route 0: East-west elongated
      { xStretch: 0.8, yStretch: 1.3 },   // Route 1: North-south elongated
      { xStretch: 1.1, yStretch: 1.1 }    // Route 2: More circular
    ];
    const shape = shapeFactors[routeIndex % shapeFactors.length];

    for (let i = 0; i < numWaypoints; i++) {
      // Start from base angle and go around
      const angle = baseAngleRad + (i / numWaypoints) * Math.PI * 2;

      // Apply shape distortion
      const latOffset = Math.cos(angle) * radiusKm * shape.yStretch * degreesPerKm;
      const lngOffset = Math.sin(angle) * radiusKm * shape.xStretch * degreesPerKm / lngCorrection;

      waypoints.push({
        lat: lat + latOffset,
        lng: lng + lngOffset
      });
    }

    // Close the loop
    waypoints.push({ lat, lng });

    return waypoints;

  } else if (routeType === 'out_back') {
    // Out-and-back with direction based on route index
    const halfDistance = targetDistanceKm / 2;

    // Add intermediate waypoints for more realistic routing
    const numIntermediatePoints = 2 + routeIndex; // More points for variety
    const waypoints = [{ lat, lng }];

    for (let i = 1; i <= numIntermediatePoints; i++) {
      const fraction = i / (numIntermediatePoints + 1);
      // Add slight curve variation
      const curveOffset = Math.sin(fraction * Math.PI) * 0.1 * (routeIndex + 1);
      const perpAngle = baseAngleRad + Math.PI / 2;

      const pointLat = lat + Math.cos(baseAngleRad) * halfDistance * fraction * degreesPerKm +
                       Math.cos(perpAngle) * curveOffset * degreesPerKm;
      const pointLng = lng + Math.sin(baseAngleRad) * halfDistance * fraction * degreesPerKm / lngCorrection +
                       Math.sin(perpAngle) * curveOffset * degreesPerKm / lngCorrection;

      waypoints.push({ lat: pointLat, lng: pointLng });
    }

    // End point
    const endLat = lat + Math.cos(baseAngleRad) * halfDistance * degreesPerKm;
    const endLng = lng + Math.sin(baseAngleRad) * halfDistance * degreesPerKm / lngCorrection;
    waypoints.push({ lat: endLat, lng: endLng });

    // Return path (reversed)
    for (let i = numIntermediatePoints; i >= 1; i--) {
      waypoints.push(waypoints[i]);
    }
    waypoints.push({ lat, lng });

    return waypoints;

  } else {
    // point_to_point with intermediate waypoints
    const waypoints = [{ lat, lng }];
    const numIntermediatePoints = 2 + routeIndex;

    for (let i = 1; i <= numIntermediatePoints; i++) {
      const fraction = i / (numIntermediatePoints + 1);
      const pointLat = lat + Math.cos(baseAngleRad) * targetDistanceKm * fraction * degreesPerKm;
      const pointLng = lng + Math.sin(baseAngleRad) * targetDistanceKm * fraction * degreesPerKm / lngCorrection;
      waypoints.push({ lat: pointLat, lng: pointLng });
    }

    // End point
    const endLat = lat + Math.cos(baseAngleRad) * targetDistanceKm * degreesPerKm;
    const endLng = lng + Math.sin(baseAngleRad) * targetDistanceKm * degreesPerKm / lngCorrection;
    waypoints.push({ lat: endLat, lng: endLng });

    return waypoints;
  }
}

/**
 * Get human-readable direction name from angle
 */
function getDirectionName(angle) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
}

/**
 * Generate a loop route that passes through an OSM target feature
 * Creates a more interesting loop by adding offset waypoints
 *
 * @param {Object} start - Start location {lat, lng}
 * @param {Object} osmTarget - OSM feature location {lat, lng}
 * @param {number} targetDistanceKm - Target route distance
 * @param {number} routeIndex - Index for variation (0, 1, 2)
 * @returns {Array} Array of waypoints for the loop
 */
function generateLoopWithOSMTarget(start, osmTarget, targetDistanceKm, routeIndex) {
  const degreesPerKm = 1 / 111;
  const lngCorrection = Math.cos(start.lat * Math.PI / 180);

  // Calculate direction from start to OSM target
  const deltaLat = osmTarget.lat - start.lat;
  const deltaLng = (osmTarget.lng - start.lng) * lngCorrection;
  const angleToTarget = Math.atan2(deltaLng, deltaLat);

  // Distance to target
  const distToTarget = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) / degreesPerKm;

  // Create offset waypoints perpendicular to the direct path
  // This makes the route go around rather than just out-and-back
  const offsetDistance = targetDistanceKm * 0.15; // 15% of total distance as offset
  const perpAngle = angleToTarget + (routeIndex % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);

  // Waypoint 1: Offset point on the way out
  const wp1Lat = start.lat + deltaLat * 0.3 + Math.cos(perpAngle) * offsetDistance * degreesPerKm;
  const wp1Lng = start.lng + (deltaLng * 0.3 + Math.sin(perpAngle) * offsetDistance * degreesPerKm) / lngCorrection;

  // Waypoint 2: Near the OSM target
  const wp2Lat = osmTarget.lat + Math.cos(perpAngle) * offsetDistance * 0.5 * degreesPerKm;
  const wp2Lng = osmTarget.lng + Math.sin(perpAngle) * offsetDistance * 0.5 * degreesPerKm / lngCorrection;

  // Waypoint 3: Offset point on the way back (opposite side)
  const wp3Lat = start.lat + deltaLat * 0.3 - Math.cos(perpAngle) * offsetDistance * degreesPerKm;
  const wp3Lng = start.lng + (deltaLng * 0.3 - Math.sin(perpAngle) * offsetDistance * degreesPerKm) / lngCorrection;

  console.log(`📐 OSM loop: Start → offset1 → OSM target → offset2 → Start`);

  return [
    start,
    { lat: wp1Lat, lng: wp1Lng },
    { lat: wp2Lat, lng: wp2Lng },
    osmTarget,
    { lat: wp3Lat, lng: wp3Lng },
    start
  ];
}

/**
 * Parse natural language route request into structured parameters
 * Examples:
 *   "40 mile loop from Boulder with gravel roads"
 *   "2 hour recovery ride, flat terrain"
 *   "Hilly intervals session, 90 minutes"
 *
 * @param {string} text - Natural language route description
 * @param {Object} defaultLocation - Default start location {lat, lng}
 * @returns {Object} Parsed route parameters
 */
export function parseNaturalLanguageRoute(text, defaultLocation) {
  const result = {
    timeAvailable: 60, // Default 1 hour
    targetDistanceKm: null, // Explicit distance if specified
    distanceUnit: null, // 'miles' or 'km' if specified
    originalDistance: null, // Original value for display
    trainingGoal: 'endurance',
    routeType: 'loop',
    profile: 'road',
    startLocation: defaultLocation
  };

  const lowerText = text.toLowerCase();

  // Parse distance/time - IMPORTANT: Store actual distance, not just time
  const mileMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*mile/);
  const kmMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometer)/);
  const hourMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minMatch = lowerText.match(/(\d+)\s*min/);

  if (mileMatch) {
    // User specified distance in miles - convert to km accurately
    const miles = parseFloat(mileMatch[1]);
    result.targetDistanceKm = miles * 1.60934; // Accurate conversion
    result.distanceUnit = 'miles';
    result.originalDistance = miles;
    // Also estimate time for Claude prompt context
    result.timeAvailable = Math.round(miles * 4); // ~15mph average
    console.log(`📏 Parsed ${miles} miles → ${result.targetDistanceKm.toFixed(1)} km`);
  } else if (kmMatch) {
    // User specified distance in km
    const km = parseFloat(kmMatch[1]);
    result.targetDistanceKm = km;
    result.distanceUnit = 'km';
    result.originalDistance = km;
    result.timeAvailable = Math.round(km * 2.5); // ~24km/h average
    console.log(`📏 Parsed ${km} km`);
  } else if (hourMatch) {
    result.timeAvailable = Math.round(parseFloat(hourMatch[1]) * 60);
    // No explicit distance - will be calculated from time
  } else if (minMatch) {
    result.timeAvailable = parseInt(minMatch[1]);
    // No explicit distance - will be calculated from time
  }

  // Parse route type
  if (lowerText.includes('loop')) {
    result.routeType = 'loop';
  } else if (lowerText.includes('out and back') || lowerText.includes('out-and-back')) {
    result.routeType = 'out_back';
  } else if (lowerText.includes('point to point') || lowerText.includes('one way')) {
    result.routeType = 'point_to_point';
  }

  // Parse training goal
  if (lowerText.includes('recovery') || lowerText.includes('easy')) {
    result.trainingGoal = 'recovery';
  } else if (lowerText.includes('interval') || lowerText.includes('speed') || lowerText.includes('fast')) {
    result.trainingGoal = 'intervals';
  } else if (lowerText.includes('hill') || lowerText.includes('climb') || lowerText.includes('mountain')) {
    result.trainingGoal = 'hills';
  } else if (lowerText.includes('endurance') || lowerText.includes('long') || lowerText.includes('steady')) {
    result.trainingGoal = 'endurance';
  }

  // Parse profile/surface type
  if (lowerText.includes('gravel') || lowerText.includes('dirt') || lowerText.includes('unpaved')) {
    result.profile = 'gravel';
  } else if (lowerText.includes('mountain') || lowerText.includes('mtb') || lowerText.includes('trail')) {
    result.profile = 'mountain';
  } else if (lowerText.includes('commute') || lowerText.includes('bike path') || lowerText.includes('safe')) {
    result.profile = 'commuting';
  } else {
    result.profile = 'road';
  }

  // Parse terrain preference (for training goal refinement)
  if (lowerText.includes('flat')) {
    if (result.trainingGoal === 'endurance') {
      result.trainingGoal = 'recovery'; // Flat + endurance = easy ride
    }
  }

  console.log('🗣️ Parsed natural language route:', result);
  return result;
}

export default {
  generateClaudeRoutes,
  convertClaudeToRoute,
  parseNaturalLanguageRoute
};
