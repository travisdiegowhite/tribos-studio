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
export function buildNaturalLanguagePrompt(userRequest, weatherData, userLocation, userAddress, calendarData = null) {
  // Build region context from user's address (no hardcoded state assumptions)
  let regionContext = '';
  let gravelExamples = '';

  if (userAddress) {
    regionContext = `The cyclist is near: ${userAddress}`;
    gravelExamples = `
   **Gravel Route Strategy:**
   - Suggest small towns and communities near the cyclist's location
   - Rural areas and county roads between small towns are often unpaved
   - Agricultural areas and foothills typically have good gravel riding
   - Use actual, geocodable town or landmark names from the cyclist's region`;
  } else {
    regionContext = 'Cyclist location unknown.';
    gravelExamples = `
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
The cyclist has a training plan. When they reference "today's workout", "my scheduled ride", "this week's long ride", etc., use this information:
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

  return `You are an expert cycling route planner. A cyclist has requested: "${userRequest}"

${regionContext}
${calendarContext}

Your task is to extract the route requirements and return a structured JSON response with ACTUAL WAYPOINT NAMES that can be geocoded.

CRITICAL: If the user mentions SPECIFIC trail names or paths (e.g., "Coal Creek Path", "Boulder Creek Trail", "Cherry Creek Trail"), you MUST include those EXACT names as waypoints. These are the user's primary request.

Extract the following:
1. Start location (if mentioned)
2. Waypoints - CRITICAL: Include any trail names, path names, roads, or landmarks the user specifically mentioned
3. Route type (loop, out_back, point_to_point)
4. Distance or time
5. Surface preference (gravel, paved, mixed)

ROUTE TYPE DEFINITIONS:
- "loop": Returns to start via DIFFERENT roads. If user says "heading south and back", this is a loop.
- "out_back": Returns via the SAME route (only when explicitly requested)
- "point_to_point": Different start and end

Current conditions:
${weatherData ? `- Weather: ${weatherData.temperature}°C, ${weatherData.description}
- Wind: ${weatherData.windSpeed} km/h` : '- Weather data not available'}

${gravelExamples}

Return ONLY a JSON object:
{
  "startLocation": "start location if mentioned, or null",
  "waypoints": ["IMPORTANT: Include EXACT trail/path names user mentioned here", "additional waypoint"],
  "routeType": "loop|out_back|point_to_point",
  "distance": number in km (or null),
  "timeAvailable": number in minutes (or null),
  "surfaceType": "gravel|paved|mixed",
  "avoidHighways": true/false,
  "trainingGoal": "endurance|intervals|recovery|hills" or null,
  "direction": "north|northeast|east|southeast|south|southwest|west|northwest" if user mentioned a direction — when they combine directions (e.g. "east and north", "out west then south"), resolve to the single closest compass value (here "northeast" and "southwest"),
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

User: "Lets do a loop that heads east and north, try and make it 50% gravel, between 40-50 miles"
Response:
{
  "startLocation": null,
  "waypoints": [],
  "routeType": "loop",
  "distance": 72.4,
  "surfaceType": "gravel",
  "direction": "northeast"
}
Note: distance ranges resolve to the midpoint (45 miles = 72.4 km); combined directions resolve to one compass value.

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

/**
 * Build a prompt that asks Claude to PLAN routes — i.e. propose real,
 * geocodable waypoints (towns, named gravel roads, landmarks) to route
 * through — rather than just extract parameters. This restores the
 * intentional, region-aware planning RB1 had and RB2 dropped.
 *
 * @param {string} userRequest - The cyclist's free-text request
 * @param {object} opts
 * @param {object|null} [opts.weatherData] - Current weather for context
 * @param {string|null} [opts.regionLabel] - Reverse-geocoded start region (e.g. "Longmont, Colorado")
 * @param {object|null} [opts.calendarData] - Training calendar context
 * @returns {string} - The planning prompt
 */
export function buildRoutePlanningPrompt(userRequest, { weatherData = null, regionLabel = null, calendarData = null } = {}) {
  let regionContext;
  let gravelStrategy;
  if (regionLabel) {
    regionContext = `The cyclist is starting near: ${regionLabel}. Propose REAL places in this area.`;
    gravelStrategy = `
GRAVEL STRATEGY (when gravel is requested):
- Route through small towns and rural communities near ${regionLabel}.
- County roads and farm roads between small towns are often unpaved.
- Foothills and agricultural areas typically have the best gravel riding.
- Name actual, geocodable towns/roads/landmarks — never coordinates.`;
  } else {
    regionContext = 'Cyclist start region unknown — infer plausible nearby places from the request.';
    gravelStrategy = `
GRAVEL STRATEGY (when gravel is requested):
- Route through small towns and rural communities likely near the start.
- Name actual, geocodable towns/roads/landmarks — never coordinates.`;
  }

  let calendarContext = '';
  if (calendarData?.todaysWorkout || calendarData?.upcomingWorkouts?.length > 0) {
    calendarContext = '\nThe cyclist has a training plan; if they reference it, use the intent (duration/goal) when sizing the route.';
  }

  return `You are an expert cycling route planner. A cyclist asked: "${userRequest}"

${regionContext}
${calendarContext}

Your job is to PLAN 3 distinct, thoughtful route options by proposing the actual
waypoints each route should pass through. Think like a local who knows the good roads.

${gravelStrategy}

Current conditions:
${weatherData ? `- Weather: ${weatherData.temperature}°C, ${weatherData.description}` : '- Weather data not available'}

RULES:
1. Propose EXACTLY 3 route plans, each genuinely different (different towns/roads, not the same loop nudged).
2. Each plan has 2-4 intermediate "waypoints": REAL geocodable place names (towns, named gravel roads,
   parks, landmarks) near the start — NOT coordinates, NOT vague descriptions.
3. When routed start → waypoints → back to start, the plan should roughly achieve the requested
   direction, the target distance, and (if gravel is requested) maximize time on unpaved roads.
4. If the user combines directions ("east and north"), resolve to one compass value ("northeast").
5. If the user gives a distance range (e.g. "40-50 miles"), use the midpoint in km.
6. Extract the explicit gravel percentage when stated ("50% gravel" → gravelTargetPct: 50), else null.
7. Give each plan a short human name and a one-line rationale.

Return ONLY this JSON (no prose):
{
  "direction": "north|northeast|east|southeast|south|southwest|west|northwest or null",
  "distance_km": number or null,
  "surfaceType": "gravel|paved|mixed",
  "gravelTargetPct": number 0-100 or null,
  "routeType": "loop|out_back|point_to_point",
  "routes": [
    {
      "name": "short descriptive name",
      "rationale": "one sentence on why this route fits the request",
      "waypoints": ["Real Town", "Named Road", "Landmark"]
    }
  ]
}

EXAMPLE:
User: "Loop heading east and north, 50% gravel, 40-50 miles" (starting near Longmont, Colorado)
{
  "direction": "northeast",
  "distance_km": 72.4,
  "surfaceType": "gravel",
  "gravelTargetPct": 50,
  "routeType": "loop",
  "routes": [
    { "name": "Hygiene–Berthoud Gravel", "rationale": "County gravel north to Hygiene then Berthoud, paved return.", "waypoints": ["Hygiene", "Berthoud", "Campion"] },
    { "name": "St. Vrain Farm Roads", "rationale": "Farm-road gravel northeast through the St. Vrain valley.", "waypoints": ["Mead", "Platteville", "Fort Lupton"] },
    { "name": "Niwot–Hygiene Mixed", "rationale": "Mixed surface northeast via Niwot with a gravel midsection.", "waypoints": ["Niwot", "Hygiene", "Longmont"] }
  ]
}`;
}

/**
 * Parse Claude's route-planning JSON response into structured plans.
 * Defensive: tolerates surrounding prose, clamps the gravel target, and
 * drops plans without a usable waypoint list.
 *
 * @param {string} responseText
 * @returns {{direction: string|null, distance_km: number|null, surfaceType: string,
 *   gravelTargetPct: number|null, routeType: string, routes: Array<{name: string, rationale: string, waypoints: string[]}>}}
 */
export function parseRoutePlanningResponse(responseText) {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in planning response');
  }
  const parsed = JSON.parse(jsonMatch[0]);

  const rawRoutes = Array.isArray(parsed.routes) ? parsed.routes : [];
  const routes = rawRoutes
    .map((r) => ({
      name: typeof r?.name === 'string' ? r.name.trim() : '',
      rationale: typeof r?.rationale === 'string' ? r.rationale.trim() : '',
      waypoints: Array.isArray(r?.waypoints)
        ? r.waypoints.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim())
        : [],
    }))
    .filter((r) => r.waypoints.length >= 1);

  let gravelTargetPct = null;
  if (typeof parsed.gravelTargetPct === 'number' && Number.isFinite(parsed.gravelTargetPct)) {
    gravelTargetPct = Math.max(0, Math.min(100, Math.round(parsed.gravelTargetPct)));
  }

  return {
    direction: typeof parsed.direction === 'string' ? parsed.direction : null,
    distance_km:
      typeof parsed.distance_km === 'number' && Number.isFinite(parsed.distance_km)
        ? parsed.distance_km
        : null,
    surfaceType: typeof parsed.surfaceType === 'string' ? parsed.surfaceType : 'mixed',
    gravelTargetPct,
    routeType: typeof parsed.routeType === 'string' ? parsed.routeType : 'loop',
    routes,
  };
}
