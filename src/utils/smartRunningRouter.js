/**
 * Routing for runs (multisport phase 2).
 *
 *   1. Stadia Maps, Valhalla `pedestrian` costing — sidewalks, paths,
 *      greenways; a trail run leans onto tracks.
 *   2. Mapbox Directions `walking` — when Stadia is unavailable or fails.
 *
 * No BRouter: there is no foot profile in the repo and none is confirmed on
 * the self-hosted server. No stress re-ranking or alternates either — both
 * choose between BIKE lines (BRouter trekking/safety), which would swap a
 * runner onto a bike route.
 *
 * Returns the same shape as smartCyclingRouter: canonical [lng, lat]
 * coordinates, `distance_m` / `duration_s` plus the legacy aliases. Reached
 * through getSmartCyclingRoute, which hands run profiles here so its ~25
 * callers and its cache need no change.
 */

import { getStadiaMapsRoute, isStadiaMapsAvailable } from './stadiaMapsRouter';
import { trackRouteBuilder, truncateErrorMessage } from './routeBuilderTelemetry';
import { assertCoordinate } from '../types/geo';
import { isRunProfile, DEFAULT_RUN_PROFILE } from './runProfiles';

function shape(result, profile, source) {
  const distance_m = result.distance_m ?? result.distance;
  const duration_s = result.duration_s ?? result.duration;
  return {
    coordinates: result.coordinates,
    distance_m,
    duration_s,
    distance: distance_m, // alias (deprecated)
    duration: duration_s, // alias (deprecated)
    elevationGain: result.elevationGain || 0,
    elevationLoss: result.elevationLoss || 0,
    confidence: result.confidence ?? 1.0,
    profile,
    source,
    maneuvers: result.maneuvers || null,
    alternates: [],
  };
}

async function tryStadiaPedestrian(waypoints, profile, { trainingGoal, walkingSpeedKmh, useHills }) {
  if (!isStadiaMapsAvailable()) return null;
  const startMs = Date.now();
  trackRouteBuilder('generation_routing_called', { provider: 'stadia', profile, waypoint_count: waypoints.length });
  try {
    const result = await getStadiaMapsRoute(waypoints, {
      profile,
      trainingGoal,
      userSpeed: walkingSpeedKmh,
      useHills,
    });
    if (result?.coordinates?.length > 0) {
      trackRouteBuilder('generation_routing_succeeded', { provider: 'stadia', duration_ms: Date.now() - startMs });
      return shape(result, profile, 'stadia_pedestrian');
    }
    trackRouteBuilder('generation_routing_failed', {
      provider: 'stadia', duration_ms: Date.now() - startMs, failure_reason: 'empty_or_no_coordinates',
    });
  } catch (error) {
    console.warn('🏃 Stadia pedestrian routing failed:', error?.message || error);
    trackRouteBuilder('generation_routing_failed', {
      provider: 'stadia', duration_ms: Date.now() - startMs, failure_reason: truncateErrorMessage(error?.message),
    });
  }
  return null;
}

async function tryMapboxWalking(waypoints, profile, mapboxToken) {
  const token = mapboxToken || import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) return null;
  const startMs = Date.now();
  trackRouteBuilder('generation_routing_called', { provider: 'mapbox', profile: 'walking', waypoint_count: waypoints.length });
  try {
    const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?` +
      `geometries=geojson&overview=full&exclude=ferry&access_token=${token}`;
    const response = await fetch(url);
    if (!response.ok) {
      trackRouteBuilder('generation_routing_failed', {
        provider: 'mapbox', duration_ms: Date.now() - startMs, failure_reason: `http_${response.status}`,
      });
      return null;
    }
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    trackRouteBuilder('generation_routing_succeeded', { provider: 'mapbox', duration_ms: Date.now() - startMs });
    return shape(
      {
        coordinates: route.geometry.coordinates,
        distance_m: route.distance,
        duration_s: route.duration,
        confidence: 0.8,
      },
      profile,
      'mapbox_walking',
    );
  } catch (error) {
    console.warn('🏃 Mapbox walking routing failed:', error?.message || error);
    return null;
  }
}

/**
 * Best available run route, or null when every provider failed.
 *
 * @param {Array<[number, number]>} waypoints  canonical [lng, lat]
 * @param {{ profile?: string, trainingGoal?: string, userSpeed?: number|null,
 *           useHills?: number|null, mapboxToken?: string|null }} options
 *   `userSpeed` is the athlete's flat RUNNING speed in km/h — never a cycling
 *   speed (callers must not pass a speed profile built from rides).
 */
export async function computeRunRoute(waypoints, options = {}) {
  const {
    profile: requested = DEFAULT_RUN_PROFILE,
    trainingGoal = 'endurance',
    userSpeed = null,
    useHills = null,
    mapboxToken = null,
  } = options;
  const profile = isRunProfile(requested) ? requested : DEFAULT_RUN_PROFILE;

  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  waypoints.forEach((c, i) => assertCoordinate(c, `smartRunningRouter.waypoints[${i}]`));

  return (
    (await tryStadiaPedestrian(waypoints, profile, { trainingGoal, walkingSpeedKmh: userSpeed, useHills })) ??
    (await tryMapboxWalking(waypoints, profile, mapboxToken))
  );
}
