/**
 * Natural Language Route Prompt Builder and Parser
 *
 * Builds prompts for Claude to parse natural language route requests,
 * and parses the structured JSON responses.
 *
 * Extracted from RouteBuilder.jsx for maintainability.
 */

/**
 * Build a prompt for Claude to parse natural language route requests
 * Returns waypoint NAMES that will be geocoded, not generic route suggestions
 * @param {string} userRequest - The user's natural language request
 * @param {object} weatherData - Current weather conditions
 * @param {object} userLocation - User's location {latitude, longitude}
 * @param {string} userAddress - User's address for regional context
 * @param {object} calendarData - Calendar context with upcoming workouts
 */
export function buildNaturalLanguagePrompt(userRequest, weatherData, userLocation, userAddress, calendarData = null, sportType = 'cycling') {
  const isRunning = sportType === 'running';
  const athlete = isRunning ? 'runner' : 'cyclist';
  const activity = isRunning ? 'running' : 'cycling';

  // Build region context from user's address (no hardcoded state assumptions)
  let regionContext = '';
  let surfaceExamples = '';

  if (userAddress) {
    regionContext = `The ${athlete} is near: ${userAddress}`;
    surfaceExamples = isRunning ? `
   **Running Route Strategy:**
   - Suggest parks, trails, greenways, and pedestrian paths near the ${athlete}'s location
   - Prefer sidewalked streets, multi-use paths, and running-friendly areas
   - Use actual, geocodable park or trail names from the ${athlete}'s region` : `
   **Gravel Route Strategy:**
   - Suggest small towns and communities near the ${athlete}'s location
   - Rural areas and county roads between small towns are often unpaved
   - Agricultural areas and foothills typically have good gravel riding
   - Use actual, geocodable town or landmark names from the ${athlete}'s region`;
  } else {
    regionContext = `${athlete.charAt(0).toUpperCase() + athlete.slice(1)} location unknown.`;
    surfaceExamples = isRunning ? `
   **Running Route Strategy:**
   - Suggest parks, greenways, and pedestrian-friendly areas
   - Running trails and multi-use paths are ideal
   - Use actual trail/park names that will geocode reliably` : `
   **Gravel Route Strategy:**
   - Suggest small towns logically placed between start and destination
   - Rural areas and small communities often have gravel roads
   - Use actual town names that will geocode reliably`;
  }

  // Build calendar context string if available
  let calendarContext = '';
  if (calendarData?.todaysWorkout || calendarData?.upcomingWorkouts?.length > 0) {
    calendarContext = `
TRAINING CALENDAR CONTEXT:
The ${athlete} has a training plan. When they reference "today's workout", "my scheduled ${isRunning ? 'run' : 'ride'}", "this week's long ${isRunning ? 'run' : 'ride'}", etc., use this information:
`;
    if (calendarData.todaysWorkout) {
      const tw = calendarData.todaysWorkout;
      calendarContext += `
- TODAY'S WORKOUT: ${tw.name || tw.workout_type} (${tw.target_duration || 60} minutes, ${tw.workout_type} type)`;
    }
    if (calendarData.upcomingWorkouts?.length > 0) {
      calendarContext += `
- UPCOMING WORKOUTS:`;
      calendarData.upcomingWorkouts.slice(0, 5).forEach(w => {
        const date = new Date(w.scheduled_date + 'T00:00:00');
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        calendarContext += `
  * ${dayName}: ${w.name || w.workout_type} (${w.target_duration || 60} min)`;
      });
    }
  }

  const trainingGoalList = isRunning
    ? '"easy_run|tempo|long_run|intervals|hills|recovery"'
    : '"endurance|intervals|recovery|hills"';

  return `You are an expert ${activity} route planner. A ${athlete} has requested: "${userRequest}"

${regionContext}
${calendarContext}

Your task is to extract the route requirements and return a structured JSON response with ACTUAL WAYPOINT NAMES that can be geocoded.

CRITICAL: If the user mentions SPECIFIC trail names or paths (e.g., "Coal Creek Path", "Boulder Creek Trail", "Cherry Creek Trail"), you MUST include those EXACT names as waypoints. These are the user's primary request.

Extract the following:
1. Start location (if mentioned)
2. Waypoints - CRITICAL: Include any trail names, path names, roads, or landmarks the user specifically mentioned
3. Route type (loop, out_back, point_to_point)
4. Distance or time
5. Surface preference (${isRunning ? 'trail, paved, mixed' : 'gravel, paved, mixed'})

ROUTE TYPE DEFINITIONS:
- "loop": Returns to start via DIFFERENT roads. If user says "heading south and back", this is a loop.
- "out_back": Returns via the SAME route (only when explicitly requested)
- "point_to_point": Different start and end

Current conditions:
${weatherData ? `- Weather: ${weatherData.temperature}°C, ${weatherData.description}
- Wind: ${weatherData.windSpeed} km/h` : '- Weather data not available'}

${surfaceExamples}

Return ONLY a JSON object:
{
  "startLocation": "start location if mentioned, or null",
  "waypoints": ["IMPORTANT: Include EXACT trail/path names user mentioned here", "additional waypoint"],
  "routeType": "loop|out_back|point_to_point",
  "distance": number in km (or null),
  "timeAvailable": number in minutes (or null),
  "surfaceType": "gravel|paved|mixed",
  "avoidHighways": true/false,
  "trainingGoal": ${trainingGoalList} or null,
  "direction": "north|south|east|west" if user mentioned a direction,
  "preferFamiliar": true if user mentions "familiar roads", "roads I know", "my usual routes", or similar
}

EXAMPLES:

User: "30 mile loop heading south on the river trail"
Response:
{
  "startLocation": null,
  "waypoints": ["River Trail"],
  "routeType": "loop",
  "distance": 48.3,
  "surfaceType": "paved",
  "direction": "south"
}

User: "Ride to the creek path and back on gravel"
Response:
{
  "startLocation": null,
  "waypoints": ["Creek Path"],
  "routeType": "loop",
  "surfaceType": "gravel"
}

User: "40 mile loop through Smithville and Riverside on dirt roads"
Response:
{
  "startLocation": null,
  "waypoints": ["Smithville", "Riverside"],
  "routeType": "loop",
  "distance": 64.4,
  "surfaceType": "gravel"
}

User: "Create a route for today's workout" (when today's workout is a 90-minute endurance ride)
Response:
{
  "startLocation": null,
  "waypoints": [],
  "routeType": "loop",
  "timeAvailable": 90,
  "trainingGoal": "endurance",
  "surfaceType": "mixed"
}

User: "Route for my Saturday long ride" (when Saturday has a 3-hour endurance workout scheduled)
Response:
{
  "startLocation": null,
  "waypoints": [],
  "routeType": "loop",
  "timeAvailable": 180,
  "trainingGoal": "endurance",
  "surfaceType": "mixed"
}

CRITICAL RULES:
1. If user mentions a TRAIL NAME or PATH NAME, it MUST be in waypoints exactly as named
2. Return ONLY valid JSON, no extra text
3. Waypoints should be actual place names that can be geocoded
4. If user references their training calendar (today's workout, this week's ride, etc.), use the TRAINING CALENDAR CONTEXT above
5. IMPORTANT: "home", "back home", or "back to [Place]" at the END of a route means the user wants to return to a specific location. Include that location as the FINAL waypoint.
6. For loop routes that mention returning home, include the home location as the final waypoint so the route closes properly.

EXAMPLES OF HANDLING "HOME":

User: "Ride to Oakdale and Riverside then back home to Springfield"
Response:
{
  "startLocation": "Springfield",
  "waypoints": ["Oakdale", "Riverside", "Springfield"],
  "routeType": "loop",
  "surfaceType": "mixed"
}

User: "Loop from here to Greenville then Lakewood and back home"
Response:
{
  "startLocation": null,
  "waypoints": ["Greenville", "Lakewood"],
  "routeType": "loop",
  "surfaceType": "mixed"
}
Note: "back home" without a place name = return to start (handled automatically for loops)`;
}

/**
 * Parse Claude's natural language response to extract waypoints
 */
export function parseNaturalLanguageResponse(responseText) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('📝 Parsed natural language response:', parsed);

    // Convert to route generator parameters
    const result = {};

    // Determine route type
    if (parsed.routeType) {
      result.routeType = parsed.routeType;
    } else if (parsed.endLocation && parsed.endLocation !== parsed.startLocation) {
      result.routeType = 'point_to_point';
    } else {
      result.routeType = 'loop';
    }

    // Set time or distance
    if (parsed.timeAvailable) {
      result.timeAvailable = parsed.timeAvailable;
    } else if (parsed.distance) {
      // Estimate time from distance (assume 25 km/h average)
      result.timeAvailable = Math.round((parsed.distance / 25) * 60);
      result.targetDistanceKm = parsed.distance;
    }

    // Set training goal
    if (parsed.trainingGoal) {
      result.trainingGoal = parsed.trainingGoal;
    } else {
      result.trainingGoal = 'endurance';
    }

    // Extract waypoints - THIS IS THE KEY DIFFERENCE
    result.startLocationName = parsed.startLocation;
    result.waypoints = parsed.waypoints || [];
    result.direction = parsed.direction;

    // Surface/preferences
    result.preferences = {
      avoidHighways: parsed.avoidHighways,
      surfaceType: parsed.surfaceType || 'mixed',
      trailPreference: parsed.surfaceType === 'gravel',
      preferFamiliar: parsed.preferFamiliar || false
    };

    // Log if familiar roads preference is detected
    if (parsed.preferFamiliar) {
      console.log('🧠 User prefers familiar roads - will score against riding history');
    }

    console.log('🎯 Extracted waypoints:', result.waypoints);
    console.log('🧭 Direction:', result.direction);
    return result;

  } catch (error) {
    console.error('Failed to parse natural language response:', error);
    throw new Error('Could not understand the route request. Please try being more specific.');
  }
}
