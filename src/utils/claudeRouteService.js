// Claude AI Route Generation Service
// Handles prompting and parsing for AI-generated cycling routes

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
 * Convert a Claude route suggestion to actual GPS coordinates
 * This would normally use routing services, but for MVP we'll return a placeholder
 */
export async function convertClaudeToRoute(claudeRoute, mapboxToken) {
  // For MVP, we'll return the Claude suggestion as-is
  // In full implementation, this would:
  // 1. Parse keyDirections into waypoints
  // 2. Use Mapbox Directions API to get actual coordinates
  // 3. Fetch elevation profile
  // 4. Return complete route with geometry

  console.log('Converting Claude route to GPS coordinates:', claudeRoute.name);

  return {
    ...claudeRoute,
    coordinates: [], // Would be filled by routing API
    geometry: null,   // Would be GeoJSON geometry
    needsRouting: true
  };
}

export default {
  generateClaudeRoutes,
  convertClaudeToRoute
};
