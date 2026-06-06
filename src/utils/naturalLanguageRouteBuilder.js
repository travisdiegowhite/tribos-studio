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
  const {
    biasCoord = null,
    userLocation = null,
    placedStart = null,
    weather = null,
    calendar = null,
    profile = 'road',
    speedProfile = null,
    useIterativeBuilder = true,
    accessToken = null,
    onProgress = null,
  } = context;

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const progress = (stage) => {
    try { onProgress?.(stage); } catch { /* progress is best-effort */ }
  };

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
    // RB1 only scores the named-waypoint path when the rider prefers familiar roads.
    const familiarityScore = preferFamiliar && accessToken
      ? await scoreRoutePreference(routeResult.coordinates, accessToken)
      : null;
    return {
      coordinates: routeResult.coordinates,
      distanceKm,
      elevationGain: routeResult.elevationGain || 0,
      duration_s: routeResult.duration_s ?? routeResult.duration ?? 0,
      name: `${parsed.waypoints.join(' → ')} ${type}`,
      source: routeResult.source,
      parsed,
      familiarityScore,
    };
  }

  // Step 3b: no named waypoints → distance/duration-driven routing.
  const duration = parsed.timeAvailable || 60;
  const direction = parsed.direction || null;
  const avgSpeed = speedProfile?.average_speed || DEFAULT_AVG_SPEED_KMH;
  const targetDistanceKm = parsed.targetDistanceKm || (duration / 60) * avgSpeed;

  // Non-iterative smart-waypoints fallback (RB1's path when the iterative
  // builder is disabled). aiRouteGenerator is large, so it's dynamically
  // imported to keep it out of callers that never take this branch (the coach).
  if (!useIterativeBuilder) {
    progress('smart');
    const { generateSmartWaypoints } = await import('./aiRouteGenerator.js');
    const waypointCoords = generateSmartWaypoints(startLocation, duration, type, goal, speedProfile, direction);
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
