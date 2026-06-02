/**
 * naturalLanguageRouteBuilder — the compute core of RB1's natural-language
 * route builder, lifted out of `src/pages/RouteBuilder.jsx`
 * (`handleNaturalLanguageGenerate`) so the RB2 coach chat can reuse the exact
 * same pipeline: Claude parse → start resolution → geocoding → iterative /
 * smart cycling routing.
 *
 * This module is pure compute — no React state, no notifications, no store
 * writes. Callers apply the returned route to their own state.
 *
 * RB1 keeps its own handler (which adds familiar-roads waypoints, familiarity
 * scoring, and a non-iterative smart-waypoints fallback — all gated on a Strava
 * token the coach doesn't pass, so they're intentionally not lifted here).
 */

import { buildNaturalLanguagePrompt, parseNaturalLanguageResponse } from './naturalLanguagePrompt';
import { geocodeWaypoint } from './geocoding';
import { generateIterativeRoute } from './iterativeRouteBuilder';
import { getSmartCyclingRoute } from './smartCyclingRouter';
import { M_TO_KM } from './distanceUnits';

const DEFAULT_AVG_SPEED_KMH = 28;

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
 * @returns {Promise<{coordinates, distanceKm, elevationGain, duration_s, name, source, parsed}>}
 * @throws {Error} 'NO_START' when no start coordinate can be resolved; other errors on parse/routing failure.
 */
export async function generateRouteFromNaturalLanguage(userRequest, context = {}) {
  const {
    biasCoord = null,
    userLocation = null,
    placedStart = null,
    weather = null,
    calendar = null,
    profile = 'road',
    speedProfile = null,
    useIterativeBuilder = true,
  } = context;

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

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

  // Step 3a: explicit named waypoints → geocode and route through them.
  if (parsed.waypoints && parsed.waypoints.length > 0) {
    const waypointCoords = [startLocation];
    for (const waypointName of parsed.waypoints) {
      const geocoded = await geocodeWaypoint(waypointName, startLocation);
      if (geocoded?.coordinates) {
        waypointCoords.push(geocoded.coordinates);
      }
    }
    if (type === 'loop' || type === 'out_back') {
      waypointCoords.push(startLocation);
    }
    if (waypointCoords.length < 2) {
      throw new Error('Could not geocode any of the requested places.');
    }

    const routeResult = await getSmartCyclingRoute(waypointCoords, {
      profile: routeProfile,
      trainingGoal: goal,
      mapboxToken,
    });
    if (!routeResult?.coordinates || routeResult.coordinates.length < 10) {
      throw new Error('Could not generate a route. Try a different place or distance.');
    }

    const distanceKm = parseFloat(
      M_TO_KM(routeResult.distance_m ?? routeResult.distance ?? 0).toFixed(1),
    );
    return {
      coordinates: routeResult.coordinates,
      distanceKm,
      elevationGain: routeResult.elevationGain || 0,
      duration_s: routeResult.duration_s ?? routeResult.duration ?? 0,
      name: `${parsed.waypoints.join(' → ')} ${type}`,
      source: routeResult.source,
      parsed,
    };
  }

  // Step 3b: no named waypoints → distance/duration-driven iterative builder.
  const duration = parsed.timeAvailable || 60;
  const direction = parsed.direction || null;
  const avgSpeed = speedProfile?.average_speed || DEFAULT_AVG_SPEED_KMH;
  const targetDistanceKm = parsed.targetDistanceKm || (duration / 60) * avgSpeed;

  if (!useIterativeBuilder) {
    // RB2 always uses the iterative builder; the non-iterative smart-waypoints
    // fallback lives in RB1 only.
    throw new Error('Smart-waypoints fallback is not available here.');
  }

  const iterativeResult = await generateIterativeRoute({
    startLocation,
    targetDistanceKm,
    routeType: type === 'out_back' ? 'out_and_back' : type,
    direction,
    options: { profile: routeProfile, trainingGoal: goal },
    trainingGoal: goal,
  });

  if (!iterativeResult?.coordinates || iterativeResult.coordinates.length < 10) {
    throw new Error('Could not generate a route. Try a different duration or location.');
  }

  const distanceKm = parseFloat(iterativeResult.distanceKm.toFixed(1));
  return {
    coordinates: iterativeResult.coordinates,
    distanceKm,
    elevationGain: iterativeResult.elevationGain || 0,
    duration_s: iterativeResult.duration_s ?? iterativeResult.duration ?? 0,
    name: iterativeResult.name || `${distanceKm}km ${goal} ${type}`,
    source: iterativeResult.source || 'iterative_quarter_loop',
    parsed,
  };
}
