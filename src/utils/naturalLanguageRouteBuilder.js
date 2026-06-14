/**
 * naturalLanguageRouteBuilder — the compute core of RB1's natural-language
 * route builder, lifted out of `src/pages/RouteBuilder.jsx`
 * (`handleNaturalLanguageGenerate`) so both the RB2 coach chat and RB1 can
 * share one pipeline: Claude parse → start resolution → geocoding →
 * familiar-roads / iterative / smart cycling routing → optional scoring.
 *
 * This module is pure compute — no React state, no notifications, no store
 * writes. Callers apply the returned route to their own state. Progress can be
 * surfaced via the optional `context.onProgress(stage)` callback.
 *
 * The pipeline is split into `parseRouteRequest` (one Claude call) and
 * `generateRouteFromParsedRequest` (routing) so multi-candidate callers
 * (`naturalLanguageRouteCandidates.ts`) can parse once and build several
 * route variants. `generateRouteFromNaturalLanguage` composes the two and
 * keeps the original single-route API.
 *
 * Feature parity with RB1's handler:
 *   - familiar-roads loop waypoints (when `context.accessToken` is supplied and
 *     the rider prefers familiar roads),
 *   - route familiarity scoring (when `context.accessToken` is supplied),
 *   - the non-iterative `generateSmartWaypoints` fallback (when
 *     `context.useIterativeBuilder === false`).
 * Callers that don't pass `accessToken` (e.g. an unauthenticated context)
 * simply skip the Strava-gated branches — the helpers no-op on a null token.
 */

import { buildNaturalLanguagePrompt, parseNaturalLanguageResponse } from './naturalLanguagePrompt';
import { geocodeWaypoint } from './geocoding';
import { generateIterativeRoute } from './iterativeRouteBuilder';
import { getSmartCyclingRoute } from './smartCyclingRouter';
import { getFamiliarLoopWaypoints, scoreRoutePreference } from './routeScoring';
import { M_TO_KM } from './distanceUnits';

const DEFAULT_AVG_SPEED_KMH = 28;

/**
 * Geocode a list of place names and route through them — the shared core of
 * RB1's named-waypoint path and RB2's Claude-planned candidates. Ungeocodable
 * names are dropped; the route is closed back to start for loops/out-backs.
 *
 * @param {[number, number]} startLocation - [lng, lat]
 * @param {string[]} waypointNames - real place names to route through
 * @param {object} opts
 * @param {string} opts.profile - routing profile ('road' | 'gravel' | ...)
 * @param {string} opts.goal - training goal
 * @param {string} opts.type - 'loop' | 'out_back' | 'point_to_point'
 * @param {string} [opts.mapboxToken]
 * @returns {Promise<{coordinates, distanceKm, elevationGain, duration_s, source, geocodedNames}|null>}
 *   null when fewer than one intermediate waypoint geocodes or routing fails.
 */
export async function routeThroughWaypoints(startLocation, waypointNames, opts = {}) {
  const { profile = 'road', goal = 'endurance', type = 'loop', mapboxToken } = opts;

  const geocoded = [];
  const geocodedNames = [];
  for (const name of waypointNames) {
    const result = await geocodeWaypoint(name, startLocation);
    if (result?.coordinates) {
      geocoded.push(result.coordinates);
      geocodedNames.push(result.name || name);
    }
  }
  // Need at least one real intermediate place to call this a planned route.
  if (geocoded.length < 1) return null;

  const waypointCoords = [startLocation, ...geocoded];
  if (type === 'loop' || type === 'out_back') {
    waypointCoords.push(startLocation);
  }

  const routeResult = await getSmartCyclingRoute(waypointCoords, {
    profile,
    trainingGoal: goal,
    mapboxToken: mapboxToken ?? import.meta.env.VITE_MAPBOX_TOKEN,
  });
  if (!routeResult?.coordinates || routeResult.coordinates.length < 10) return null;

  return {
    coordinates: routeResult.coordinates,
    distanceKm: parseFloat(
      M_TO_KM(routeResult.distance_m ?? routeResult.distance ?? 0).toFixed(1),
    ),
    elevationGain: routeResult.elevationGain || 0,
    duration_s: routeResult.duration_s ?? routeResult.duration ?? 0,
    source: routeResult.source,
    geocodedNames,
  };
}

/**
 * Parse a free-text route request into structured parameters (one Claude
 * call) and resolve the start coordinate.
 *
 * @param {string} userRequest - e.g. "build me a hilly 40km loop from downtown"
 * @param {object} context - same shape as `generateRouteFromNaturalLanguage`
 * @returns {Promise<{parsed, startLocation, routeProfile, goal, type, preferFamiliar, durationMinutes, targetDistanceKm, direction}>}
 * @throws {Error} 'NO_START' when no start coordinate can be resolved; other errors on parse failure.
 */
export async function parseRouteRequest(userRequest, context = {}) {
  const {
    biasCoord = null,
    userLocation = null,
    placedStart = null,
    weather = null,
    calendar = null,
    profile = 'road',
    speedProfile = null,
  } = context;

  // Step 1: ask Claude to extract waypoint names / distance / goal / surface.
  const prompt = buildNaturalLanguagePrompt(
    userRequest,
    weather,
    biasCoord,
    null, // userAddress
    calendar,
  );

  const apiUrl = import.meta.env.PROD ? '/api/claude-routes' : 'http://localhost:3000/api/claude-routes';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens: 1000, temperature: 0.3 }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to process route request');
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to parse route request');
  }

  const parsed = parseNaturalLanguageResponse(data.content);

  // Step 2: resolve start — placed waypoint, then geolocation, then viewport.
  const startLocation = placedStart ?? userLocation ?? biasCoord;
  if (!startLocation) {
    throw new Error('NO_START');
  }

  // Surface preference wins over the current builder profile (RB1 behaviour).
  const routeProfile = parsed.preferences?.surfaceType === 'gravel' ? 'gravel' : profile || 'road';
  const goal = parsed.trainingGoal || 'endurance';
  const type = parsed.routeType || 'loop';
  const preferFamiliar = Boolean(parsed.preferences?.preferFamiliar);
  const durationMinutes = parsed.timeAvailable || 60;
  const avgSpeedKmh = speedProfile?.average_speed || DEFAULT_AVG_SPEED_KMH;
  const targetDistanceKm = parsed.targetDistanceKm || (durationMinutes / 60) * avgSpeedKmh;
  const direction = parsed.direction || null;

  return {
    parsed,
    startLocation,
    routeProfile,
    goal,
    type,
    preferFamiliar,
    durationMinutes,
    targetDistanceKm,
    direction,
  };
}

/**
 * Generate a route from an already-parsed request (see `parseRouteRequest`).
 * No Claude call happens here — only geocoding/routing/scoring.
 *
 * @param {Awaited<ReturnType<typeof parseRouteRequest>>} request
 * @param {object} context - same shape as `generateRouteFromNaturalLanguage`
 * @returns {Promise<{coordinates, distanceKm, elevationGain, duration_s, name, source, parsed, familiarityScore, meta}>}
 */
export async function generateRouteFromParsedRequest(request, context = {}) {
  const {
    speedProfile = null,
    useIterativeBuilder = true,
    accessToken = null,
    onProgress = null,
  } = context;

  const {
    parsed,
    startLocation,
    routeProfile,
    goal,
    type,
    preferFamiliar,
    durationMinutes,
    targetDistanceKm,
    direction,
  } = request;

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const progress = (stage) => {
    try { onProgress?.(stage); } catch { /* progress is best-effort */ }
  };

  // Step 3a: explicit named waypoints → geocode and route through them.
  if (parsed.waypoints && parsed.waypoints.length > 0) {
    const routed = await routeThroughWaypoints(startLocation, parsed.waypoints, {
      profile: routeProfile,
      goal,
      type,
      mapboxToken,
    });
    if (!routed) {
      throw new Error('Could not generate a route. Try a different place or distance.');
    }
    // RB1 only scores the named-waypoint path when the rider prefers familiar roads.
    const familiarityScore = preferFamiliar && accessToken
      ? await scoreRoutePreference(routed.coordinates, accessToken)
      : null;
    return {
      coordinates: routed.coordinates,
      distanceKm: routed.distanceKm,
      elevationGain: routed.elevationGain,
      duration_s: routed.duration_s,
      name: `${parsed.waypoints.join(' → ')} ${type}`,
      source: routed.source,
      parsed,
      familiarityScore,
    };
  }

  // Step 3b: no named waypoints → distance/duration-driven routing.

  // Non-iterative smart-waypoints fallback (RB1's path when the iterative
  // builder is disabled). aiRouteGenerator is large, so it's dynamically
  // imported to keep it out of callers that never take this branch (the coach).
  if (!useIterativeBuilder) {
    progress('smart');
    const { generateSmartWaypoints } = await import('./aiRouteGenerator.js');
    const waypointCoords = generateSmartWaypoints(startLocation, durationMinutes, type, goal, speedProfile, direction);
    if (!waypointCoords || waypointCoords.length < 2) {
      throw new Error('Could not generate route waypoints. Please try again.');
    }
    const routeResult = await getSmartCyclingRoute(waypointCoords, {
      profile: routeProfile,
      trainingGoal: goal,
      mapboxToken,
    });
    if (!routeResult?.coordinates || routeResult.coordinates.length < 10) {
      throw new Error('Could not generate a route. Try a different duration or location.');
    }
    const distanceKm = parseFloat(
      M_TO_KM(routeResult.distance_m ?? routeResult.distance ?? 0).toFixed(1),
    );
    const familiarityScore = preferFamiliar && accessToken
      ? await scoreRoutePreference(routeResult.coordinates, accessToken)
      : null;
    return {
      coordinates: routeResult.coordinates,
      distanceKm,
      elevationGain: routeResult.elevationGain || 0,
      duration_s: routeResult.duration_s ?? routeResult.duration ?? 0,
      name: `${distanceKm}km ${goal} ${type}`,
      source: routeResult.source,
      parsed,
      familiarityScore,
    };
  }

  // Iterative path, optionally seeded with familiar-roads waypoints from the
  // rider's history (Strava-gated; skipped without an accessToken).
  let iterativeResult = null;
  let routeSource = 'iterative_quarter_loop';
  let meta = null;

  if (accessToken && preferFamiliar && type === 'loop') {
    progress('familiar');
    const familiar = await getFamiliarLoopWaypoints(
      startLocation[1], // lat
      startLocation[0], // lng
      targetDistanceKm,
      accessToken,
      false, // not explore mode
    );
    if (familiar && !familiar.fallbackToRandom && familiar.waypoints?.length >= 4) {
      const familiarCoords = [
        startLocation,
        ...familiar.waypoints.map((wp) => [wp.lng, wp.lat]),
        startLocation,
      ];
      const routeResult = await getSmartCyclingRoute(familiarCoords, {
        profile: routeProfile,
        trainingGoal: goal,
        mapboxToken,
      });
      if (routeResult?.coordinates && routeResult.coordinates.length >= 10) {
        const familiarKm = M_TO_KM(routeResult.distance_m ?? routeResult.distance ?? 0);
        iterativeResult = {
          coordinates: routeResult.coordinates,
          distanceKm: familiarKm,
          elevationGain: routeResult.elevationGain || 0,
          duration_s: routeResult.duration_s ?? routeResult.duration ?? 0,
          name: `Familiar ${familiarKm.toFixed(0)}km ${goal} loop`,
          source: 'familiar_segments',
        };
        routeSource = 'familiar_segments';
        meta = {
          segmentsUsed: familiar.segments?.length || 0,
          waypointsUsed: familiar.waypoints.length,
        };
      }
    }
  }

  if (!iterativeResult) {
    progress('iterative');
    iterativeResult = await generateIterativeRoute({
      startLocation,
      targetDistanceKm,
      routeType: type === 'out_back' ? 'out_and_back' : type,
      direction,
      options: { profile: routeProfile, trainingGoal: goal },
      trainingGoal: goal,
    });
  }

  if (!iterativeResult?.coordinates || iterativeResult.coordinates.length < 10) {
    throw new Error('Could not generate a route. Try a different duration or location.');
  }

  const distanceKm = parseFloat(iterativeResult.distanceKm.toFixed(1));
  const familiarityScore = accessToken
    ? await scoreRoutePreference(iterativeResult.coordinates, accessToken)
    : null;
  return {
    coordinates: iterativeResult.coordinates,
    distanceKm,
    elevationGain: iterativeResult.elevationGain || 0,
    duration_s: iterativeResult.duration_s ?? iterativeResult.duration ?? 0,
    name: iterativeResult.name || `${distanceKm}km ${goal} ${type}`,
    source: iterativeResult.source || routeSource,
    parsed,
    familiarityScore,
    meta,
  };
}

/**
 * Generate a fresh route from a free-text request.
 *
 * @param {string} userRequest - e.g. "build me a hilly 40km loop from downtown"
 * @param {object} context
 * @param context.biasCoord - map viewport center [lng, lat] (geocode bias + last-resort start)
 * @param [context.userLocation] - geolocated [lng, lat]
 * @param [context.placedStart] - a manually placed start [lng, lat]
 * @param {object|null} [context.weather] - current weather for prompt context
 * @param {object|null} [context.calendar] - { todaysWorkout, upcomingWorkouts } for prompt context
 * @param {string} [context.profile] - current routing profile ('road' | 'gravel' | 'mountain')
 * @param {object|null} [context.speedProfile] - { average_speed } for distance/time math
 * @param {boolean} [context.useIterativeBuilder] - defaults to true (RB1 default)
 * @param {string|null} [context.accessToken] - Supabase session token; enables familiar-roads + scoring
 * @param {(stage: string) => void} [context.onProgress] - optional progress callback ('familiar' | 'iterative' | 'smart')
 * @returns {Promise<{coordinates, distanceKm, elevationGain, duration_s, name, source, parsed, familiarityScore, meta}>}
 *   `meta` is `{ segmentsUsed, waypointsUsed }` when familiar-roads waypoints were used, else null/undefined.
 * @throws {Error} 'NO_START' when no start coordinate can be resolved; other errors on parse/routing failure.
 */
export async function generateRouteFromNaturalLanguage(userRequest, context = {}) {
  const request = await parseRouteRequest(userRequest, context);
  return generateRouteFromParsedRequest(request, context);
}
