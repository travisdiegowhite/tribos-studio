// Claude AI Route Generation Service
// Uses secure backend API for Claude AI integration

import { EnhancedContextCollector } from './enhancedContext';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return ''; // Use relative URLs in production (same origin)
  }
  return 'http://localhost:3001'; // Development API server
};

// Check if Claude service is available
const isClaudeAvailable = () => {
  // Always available now since it's server-side
  return true;
};

/**
 * Generate intelligent route suggestions using Claude AI
 * @param {Object} params - Route generation parameters
 * @returns {Promise<Array>} Array of AI-generated route suggestions
 */
export async function generateClaudeRoutes(params) {
  if (!isClaudeAvailable()) {
    console.warn('Claude not available, falling back to existing route generation');
    return [];
  }

  const {
    startLocation,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData,
    ridingPatterns,
    targetDistance,
    userId,
    trainingContext
  } = params;

  try {
    console.log('🧠 Calling secure Claude API for route generation...');

    // Try to get enhanced context if userId is available
    let prompt;
    if (userId) {
      try {
        // Pass trainingContext to the enhanced context collector
        const paramsWithContext = { ...params, trainingContext };
        const enhancedContext = await EnhancedContextCollector.gatherDetailedPreferences(userId, paramsWithContext);
        console.log('Using enhanced context for route generation');
        if (trainingContext) {
          console.log('🎯 Training context included:', trainingContext);
        }
        prompt = EnhancedContextCollector.buildEnhancedRoutePrompt(enhancedContext);
      } catch (error) {
        console.warn('Failed to get enhanced context, using basic prompt:', error);
        prompt = buildRoutePrompt({ ...params, trainingContext });
      }
    } else {
      prompt = buildRoutePrompt({ ...params, trainingContext });
    }

    console.log('Sending prompt to secure API...');

    // Call secure backend API instead of client-side Claude
    const response = await fetch(`${getApiBaseUrl()}/api/claude-routes`, {
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
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown API error');
    }

    console.log('Secure Claude API response received');
    const suggestions = parseClaudeResponse(data.content);
    console.log('Parsed Claude suggestions:', suggestions);
    return suggestions;

  } catch (error) {
    console.error('Claude route generation failed:', error);
    console.error('Error details:', error.message);
    return [];
  }
}

/**
 * Build a comprehensive prompt for Claude route generation
 */
function buildRoutePrompt(params) {
  const {
    startLocation: rawStartLocation,
    timeAvailable,
    trainingGoal,
    routeType,
    weatherData,
    ridingPatterns,
    targetDistance,
    trainingContext
  } = params;

  // Normalize startLocation to array format [lng, lat]
  let startLocation = rawStartLocation;
  if (!Array.isArray(rawStartLocation) && typeof rawStartLocation === 'object') {
    const lng = rawStartLocation.lng ?? rawStartLocation.longitude ?? rawStartLocation.lon;
    const lat = rawStartLocation.lat ?? rawStartLocation.latitude;
    if (lng !== undefined && lat !== undefined) {
      startLocation = [lng, lat];
    }
  }

  // Validate startLocation
  if (!startLocation || !Array.isArray(startLocation) || startLocation.length < 2) {
    console.error('Invalid startLocation in buildRoutePrompt:', rawStartLocation);
    throw new Error('Invalid startLocation format');
  }

  const [longitude, latitude] = startLocation;

  let prompt = `You are an expert cycling coach and route planner. Generate 3-4 intelligent cycling route suggestions based on the following parameters:

LOCATION & DISTANCE:
- Start coordinates: ${latitude}, ${longitude}
- Target distance: ${targetDistance.toFixed(1)}km
- Time available: ${timeAvailable} minutes
- Route type: ${routeType}

TRAINING GOAL: ${trainingGoal}
${getTrainingGoalDescription(trainingGoal)}

WEATHER CONDITIONS:`;

  if (weatherData) {
    prompt += `
- Temperature: ${weatherData.temperature}°C
- Wind: ${weatherData.windSpeed} km/h from ${weatherData.windDirection}
- Conditions: ${weatherData.description}
- Humidity: ${weatherData.humidity}%`;
  } else {
    prompt += `
- Weather data not available`;
  }

  // Add training context if provided (from training plan workout)
  if (trainingContext) {
    prompt += `

TRAINING PLAN WORKOUT:
- Workout Type: ${trainingContext.workoutType}
- Training Phase: ${trainingContext.phase}
- Target Duration: ${trainingContext.targetDuration} minutes
- Target TSS (Training Stress Score): ${trainingContext.targetTSS}
- Primary Heart Rate Zone: Zone ${trainingContext.primaryZone}

IMPORTANT: This route should be specifically designed for a ${trainingContext.workoutType} workout in the ${trainingContext.phase} phase.
The route must match the intensity requirements and duration of this structured training session.`;
  }

  if (ridingPatterns) {
    prompt += `

RIDER PREFERENCES (based on past rides):`;
    
    if (ridingPatterns.preferredDistances?.mean) {
      prompt += `
- Typical ride distance: ${ridingPatterns.preferredDistances.mean.toFixed(1)}km (range: ${ridingPatterns.preferredDistances.range?.min?.toFixed(1)}-${ridingPatterns.preferredDistances.range?.max?.toFixed(1)}km)`;
    }
    
    if (ridingPatterns.elevationTolerance?.preferred) {
      prompt += `
- Preferred elevation gain: ${ridingPatterns.elevationTolerance.preferred}m (tolerance: up to ${ridingPatterns.elevationTolerance.tolerance}m)`;
    }
    
    if (ridingPatterns.frequentAreas?.length > 0) {
      prompt += `
- Frequently visited areas: ${ridingPatterns.frequentAreas.length} known locations`;
      ridingPatterns.frequentAreas.slice(0, 3).forEach((area, i) => {
        prompt += `
  • Area ${i+1}: visited ${area.frequency} times (confidence: ${(area.confidence * 100).toFixed(0)}%)`;
      });
    }
    
    if (ridingPatterns.preferredDirections?.length > 0) {
      prompt += `
- Preferred directions: `;
      ridingPatterns.preferredDirections.slice(0, 2).forEach((dir, i) => {
        prompt += `${dir.direction} (${(dir.preference * 100).toFixed(0)}% of rides)${i === 0 && ridingPatterns.preferredDirections.length > 1 ? ', ' : ''}`;
      });
    }
    
    if (ridingPatterns.routeTemplates?.length > 0) {
      prompt += `
- Past route patterns: ${ridingPatterns.routeTemplates.length} templates available
  • Most common route type: ${getMostCommonRouteType(ridingPatterns.routeTemplates)}
  • Preferred difficulty: ${getMostCommonDifficulty(ridingPatterns.routeTemplates)}`;
    }
    
    if (ridingPatterns.distanceDistribution) {
      const dist = ridingPatterns.distanceDistribution;
      prompt += `
- Distance preferences: ${(dist.short * 100).toFixed(0)}% short rides, ${(dist.medium * 100).toFixed(0)}% medium, ${(dist.long * 100).toFixed(0)}% long rides`;
    }
  }

  prompt += `

Please provide 3-4 route suggestions in the following JSON format:
{
  "routes": [
    {
      "name": "descriptive route name",
      "description": "detailed description explaining why this route fits the training goal",
      "estimatedDistance": distance_in_km,
      "estimatedElevation": elevation_gain_in_meters,
      "difficulty": "easy|moderate|hard",
      "keyDirections": ["turn by turn directions as array of strings"],
      "trainingFocus": "what makes this route good for the specified training goal",
      "weatherConsiderations": "how this route works with current weather",
      "estimatedTime": time_in_minutes
    }
  ]
}

IMPORTANT:
- Focus on realistic, rideable routes
- Consider safety (bike lanes, traffic levels)
- Match difficulty to training goal
- Explain route benefits clearly
- Account for weather impact on route choice
- Provide specific turn-by-turn guidance
- Keep routes within 20% of target distance`;

  return prompt;
}

/**
 * Calculate realistic time estimate based on distance and difficulty
 */
function calculateRealisticTime(distanceKm, difficulty) {
  let avgSpeed = 20; // Base speed in km/h
  
  // Adjust speed based on difficulty
  switch (difficulty) {
    case 'easy':
      avgSpeed = 22;
      break;
    case 'moderate':
      avgSpeed = 20;
      break;
    case 'hard':
      avgSpeed = 15;
      break;
    default:
      avgSpeed = 20;
  }
  
  return Math.round((distanceKm / avgSpeed) * 60); // Convert to minutes
}

/**
 * Get detailed description for training goals
 */
function getTrainingGoalDescription(goal) {
  const descriptions = {
    endurance: `
- Focus: Aerobic base building, steady effort
- Intensity: Moderate, sustainable pace
- Route needs: Consistent terrain, minimal stops`,
    
    intervals: `
- Focus: High-intensity efforts with recovery periods
- Intensity: Alternating hard efforts and easy recovery
- Route needs: Safe sections for hard efforts, good visibility`,
    
    recovery: `
- Focus: Active recovery, easy spinning
- Intensity: Very easy, conversational pace
- Route needs: Flat terrain, scenic/enjoyable, minimal traffic`,
    
    hills: `
- Focus: Climbing strength and power development
- Intensity: Sustained efforts on climbs
- Route needs: Significant elevation gain, varied gradients`
  };
  
  return descriptions[goal] || 'General fitness and enjoyment';
}

/**
 * Extract and repair JSON from Claude's response
 * Handles common formatting issues like trailing commas, incomplete arrays, etc.
 */
function extractAndRepairJSON(text) {
  // Try to find the JSON object containing routes
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0];

  // First attempt: parse as-is
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Continue to repair attempts
  }

  // Repair attempt 1: Fix trailing commas
  try {
    const fixed = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    return JSON.parse(fixed);
  } catch (e) {
    // Continue to next repair
  }

  // Repair attempt 2: Try to find routes array directly
  try {
    const routesMatch = text.match(/"routes"\s*:\s*\[([\s\S]*?)\]/);
    if (routesMatch) {
      // Try to extract individual route objects
      const routeObjects = [];
      const routePattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      let match;
      while ((match = routePattern.exec(routesMatch[1])) !== null) {
        try {
          const routeObj = JSON.parse(match[0].replace(/,\s*$/, ''));
          routeObjects.push(routeObj);
        } catch (e) {
          // Skip malformed route
        }
      }
      if (routeObjects.length > 0) {
        return { routes: routeObjects };
      }
    }
  } catch (e) {
    // Continue
  }

  // Repair attempt 3: Truncate at last valid position
  try {
    // Find the last complete route object
    let lastValidPos = 0;
    let braceCount = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastValidPos = i + 1;
          }
        }
      }
    }

    if (lastValidPos > 0 && lastValidPos < jsonStr.length) {
      const truncated = jsonStr.substring(0, lastValidPos);
      return JSON.parse(truncated);
    }
  } catch (e) {
    // All repairs failed
  }

  return null;
}

/**
 * Parse Claude's response and convert to route objects
 */
function parseClaudeResponse(responseText) {
  try {
    // Extract and repair JSON from response
    const parsed = extractAndRepairJSON(responseText);

    if (!parsed) {
      console.warn('No valid JSON found in Claude response');
      return [];
    }

    const routes = parsed.routes || [];

    return routes.map((route, index) => ({
      name: route.name || `Claude Route ${index + 1}`,
      description: route.description || 'AI-generated cycling route',
      distance: route.estimatedDistance || 25,
      elevationGain: route.estimatedElevation || 150,
      elevationLoss: Math.round((route.estimatedElevation || 150) * 0.9),
      difficulty: route.difficulty || 'moderate',
      coordinates: [], // Will be filled by Mapbox routing
      trainingGoal: route.trainingFocus || 'General training',
      pattern: 'claude_generated',
      confidence: 0.85,
      source: 'claude',
      keyDirections: route.keyDirections || [],
      weatherConsiderations: route.weatherConsiderations || '',
      estimatedTime: calculateRealisticTime(route.estimatedDistance || 25, route.difficulty || 'moderate'),
      elevationProfile: [],
      windFactor: 0.8
    }));

  } catch (error) {
    console.warn('Failed to parse Claude response:', error);
    return [];
  }
}

/**
 * Enhance existing route with Claude-generated description and analysis
 */
export async function enhanceRouteWithClaude(route, params) {
  if (!isClaudeAvailable()) {
    return route;
  }

  try {
    console.log('🔧 Enhancing route with secure Claude API...');

    // Call secure backend API
    const response = await fetch(`${getApiBaseUrl()}/api/claude-enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route,
        params
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Enhancement failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown enhancement error');
    }

    // Parse the enhancement response
    const enhancement = JSON.parse(data.enhancement);

    return {
      ...route,
      description: enhancement.enhancedDescription || route.description,
      trainingBenefits: enhancement.trainingBenefits,
      pacingAdvice: enhancement.pacingAdvice,
      keyChallenges: enhancement.keyChallenges
    };

  } catch (error) {
    console.warn('Failed to enhance route with Claude:', error);
    return route;
  }
}

/**
 * Get Claude's analysis of riding patterns for personalized recommendations
 */
export async function analyzeRidingPatternsWithClaude(patterns, currentParams) {
  if (!isClaudeAvailable()) {
    return null;
  }

  try {
    console.log('📊 Analyzing riding patterns with secure Claude API...');

    const prompt = `You are a cycling coach analyzing a rider's patterns. Based on this riding history, provide personalized recommendations:

RIDING PATTERNS:
${JSON.stringify(patterns, null, 2)}

CURRENT REQUEST:
- Training goal: ${currentParams.trainingGoal}
- Time available: ${currentParams.timeAvailable} minutes
- Target distance: ${currentParams.targetDistance}km

Analyze their patterns and provide recommendations in JSON format:
{
  "personalizedAdvice": "coaching advice based on their history",
  "recommendedIntensity": "suggested intensity level",
  "routePreferences": "what type of routes they seem to prefer",
  "progressionSuggestions": "how to progress their training"
}`;

    // Call secure backend API
    const response = await fetch(`${getApiBaseUrl()}/api/claude-routes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        maxTokens: 600,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Pattern analysis failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown analysis error');
    }

    return JSON.parse(data.content);

  } catch (error) {
    console.warn('Failed to analyze patterns with Claude:', error);
    return null;
  }
}

// Helper function to analyze most common route type from templates
function getMostCommonRouteType(templates) {
  const counts = {};
  templates.forEach(template => {
    counts[template.routeType] = (counts[template.routeType] || 0) + 1;
  });
  
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

// Helper function to analyze most common difficulty from templates  
function getMostCommonDifficulty(templates) {
  const counts = {};
  templates.forEach(template => {
    counts[template.difficulty] = (counts[template.difficulty] || 0) + 1;
  });
  
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

const claudeService = {
  generateClaudeRoutes,
  enhanceRouteWithClaude,
  analyzeRidingPatternsWithClaude
};

export default claudeService;