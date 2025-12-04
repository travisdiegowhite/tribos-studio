// Claude AI Route Generation Service
// Handles prompting and parsing for AI-generated cycling routes

import { getSmartCyclingRoute, getRoutingStrategyDescription } from './smartCyclingRouter';

/**
 * Generate route suggestions using Claude AI
 * @param {Object} params - Route generation parameters
 * @returns {Promise<Array>} - Array of route suggestions
 */
export async function generateClaudeRoutes(params) {
  const {
    startLocation,       // {lat, lng} or [lng, lat]
    timeAvailable,       // minutes
    trainingGoal = 'endurance',  // 'endurance' | 'intervals' | 'hills' | 'recovery'
    routeType = 'loop',  // 'loop' | 'out_back' | 'point_to_point'
    weatherData,         // Optional weather info
    userPreferences      // Optional user preferences
  } = params;

  // Normalize start location
  const startLat = startLocation.lat || startLocation[1];
  const startLng = startLocation.lng || startLocation[0];

  // Calculate target distance based on time and training goal
  const targetDistance = calculateTargetDistance(timeAvailable, trainingGoal);

  // Build the prompt
  const prompt = buildRoutePrompt({
    startLat,
    startLng,
    targetDistance,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData,
    userPreferences
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
 * Build the prompt for Claude
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
    userPreferences
  } = params;

  // Training goal descriptions
  const goalDescriptions = {
    endurance: 'Steady, sustainable pace with minimal stops. Focus on maintaining consistent effort in Zone 2-3.',
    intervals: 'High-intensity intervals with recovery periods. Include flat or gently rolling sections for hard efforts.',
    recovery: 'Easy spinning at conversational pace. Minimal elevation gain, focus on flat terrain.',
    hills: 'Climbing strength and power development. Prioritize routes with sustained climbs and varied gradients.'
  };

  // Route type descriptions
  const routeTypeDesc = {
    loop: 'a loop route that returns to the starting point',
    out_back: 'an out-and-back route along the same path',
    point_to_point: 'a point-to-point route to a different destination'
  };

  const prompt = `You are an expert cycling coach and route planner. Generate 3 cycling route suggestions based on these parameters:

**LOCATION & DISTANCE**
- Start Location: ${startLat.toFixed(6)}, ${startLng.toFixed(6)}
- Target Distance: ${targetDistance.toFixed(1)} km
- Available Time: ${timeAvailable} minutes
- Route Type: ${routeTypeDesc[routeType]}

**TRAINING GOAL: ${trainingGoal.toUpperCase()}**
${goalDescriptions[trainingGoal]}

${weatherData ? `**WEATHER CONDITIONS**
- Temperature: ${weatherData.temp}°C
- Conditions: ${weatherData.condition}
- Wind: ${weatherData.wind || 'Light'}
` : ''}

**OUTPUT FORMAT**
Respond with ONLY a JSON object in this exact format (no markdown, no code blocks, just raw JSON):

{
  "routes": [
    {
      "name": "Descriptive route name (e.g., 'North Valley Loop')",
      "description": "Brief explanation of why this route matches the training goal",
      "estimatedDistance": ${targetDistance.toFixed(1)},
      "estimatedElevation": 150,
      "difficulty": "easy|moderate|hard",
      "keyDirections": [
        "Head north on Main St",
        "Turn right onto Valley Rd",
        "Follow for 5km",
        "Return via Oak Ave"
      ],
      "trainingFocus": "Explanation of how this route achieves the training goal",
      "estimatedTime": ${timeAvailable}
    }
  ]
}

**IMPORTANT RULES**
1. Generate exactly 3 route variations with different characteristics
2. Keep routes within 20% of target distance (${(targetDistance * 0.8).toFixed(1)}-${(targetDistance * 1.2).toFixed(1)} km)
3. Ensure routes are realistic and rideable
4. Consider bike infrastructure and safety
5. Match difficulty to training goal
6. Respond with ONLY the JSON object (no extra text, no markdown formatting)

Generate the routes now:`;

  return prompt;
}

/**
 * Parse Claude's JSON response into route objects
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

    // Map to internal route format
    return parsed.routes.map(route => ({
      name: route.name,
      description: route.description,
      distance: route.estimatedDistance,
      elevationGain: route.estimatedElevation,
      difficulty: route.difficulty,
      estimatedTime: route.estimatedTime || context.timeAvailable,
      trainingGoal: context.trainingGoal,
      keyDirections: route.keyDirections || [],
      trainingFocus: route.trainingFocus,
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
 * Convert a Claude route suggestion to actual GPS coordinates using Smart Cycling Router
 * Uses Stadia Maps (Valhalla) as primary, with BRouter and Mapbox fallbacks
 *
 * @param {Object} claudeRoute - Route suggestion from Claude
 * @param {Object} options - Conversion options
 * @param {string} options.mapboxToken - Mapbox token for fallback
 * @param {string} options.profile - Route profile: 'road', 'gravel', 'mountain', 'commuting'
 * @param {number} options.userSpeed - Optional personalized cycling speed in km/h
 * @param {number} options.routeIndex - Index of this route (0, 1, 2) for variation
 * @returns {Promise<Object>} Route with GPS coordinates
 */
export async function convertClaudeToRoute(claudeRoute, options = {}) {
  const {
    mapboxToken,
    profile = 'road',
    userSpeed = null,
    routeIndex = 0
  } = typeof options === 'string' ? { mapboxToken: options } : options;

  console.log('🚴 Converting Claude route to GPS coordinates:', claudeRoute.name);
  console.log('📍 Profile:', profile, '| Route Index:', routeIndex);

  const { startLocation, distance, routeType, trainingGoal, keyDirections } = claudeRoute;

  try {
    // Generate waypoints based on route type, distance, and route index for variation
    const waypoints = generateRouteWaypoints(startLocation, distance, routeType || 'loop', {
      routeIndex,
      keyDirections,
      trainingGoal
    });

    // Convert waypoints to [lon, lat] format for smart router
    const waypointsArray = waypoints.map(wp => [wp.lng, wp.lat]);

    console.log(`📍 Generated ${waypointsArray.length} waypoints for smart routing`);

    // Use smart cycling router (Stadia Maps → BRouter → Mapbox fallback)
    const routeResult = await getSmartCyclingRoute(waypointsArray, {
      profile,
      trainingGoal: trainingGoal || 'endurance',
      mapboxToken,
      userSpeed
    });

    if (!routeResult || !routeResult.coordinates || routeResult.coordinates.length < 10) {
      throw new Error('Smart router failed to generate route');
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
      needsRouting: false,
      routingSource: routeResult.source,
      routingStrategy,
      confidence: routeResult.confidence,
      profile: routeResult.profile || profile
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
    trainingGoal: 'endurance',
    routeType: 'loop',
    profile: 'road',
    startLocation: defaultLocation
  };

  const lowerText = text.toLowerCase();

  // Parse distance/time
  const mileMatch = lowerText.match(/(\d+)\s*mile/);
  const kmMatch = lowerText.match(/(\d+)\s*km/);
  const hourMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minMatch = lowerText.match(/(\d+)\s*min/);

  if (mileMatch) {
    // Convert miles to approximate time (assuming ~15mph avg)
    result.timeAvailable = Math.round(parseInt(mileMatch[1]) * 4);
  } else if (kmMatch) {
    // Convert km to approximate time (assuming ~24km/h avg)
    result.timeAvailable = Math.round(parseInt(kmMatch[1]) * 2.5);
  } else if (hourMatch) {
    result.timeAvailable = Math.round(parseFloat(hourMatch[1]) * 60);
  } else if (minMatch) {
    result.timeAvailable = parseInt(minMatch[1]);
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
