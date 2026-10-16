/**
 * Route profiles for runs (multisport phase 2).
 *
 * A route profile string travels through every routing layer — the store, the
 * smart router, Stadia, the Mapbox fallback, the AI generator. Each of those
 * used to treat an unknown string as a road bike ride (or, in
 * useRouteManipulation, as DRIVING), so a run profile must be recognised
 * explicitly everywhere. This module is the one place that says which profiles
 * are runs.
 *
 *   run        roads, paths and sidewalks
 *   trail_run  prefers tracks and trails
 *
 * Pure; also holds the run-pace maths the builder's targets and ETA share.
 */

import { K_CLIMB } from '../../api/utils/runLoad.js';

export const RUN_PROFILES = Object.freeze(['run', 'trail_run']);

export const DEFAULT_RUN_PROFILE = 'run';
export const DEFAULT_RIDE_PROFILE = 'road';

export function isRunProfile(profile) {
  return RUN_PROFILES.includes(profile);
}

/** 'running' for a run profile, else 'cycling'. */
export function sportOfProfile(profile) {
  return isRunProfile(profile) ? 'running' : 'cycling';
}

/** The profile a sport starts on. */
export function defaultProfileFor(sport) {
  return sport === 'running' ? DEFAULT_RUN_PROFILE : DEFAULT_RIDE_PROFILE;
}

/** Bike profiles the builder can restore from a saved route's surface_type. */
const RIDE_PROFILES = new Set(['road', 'gravel', 'mountain', 'commuting', 'walking']);

/** 'running' for a saved run route (routes.sport, else a run surface_type). */
export function sportOfSavedRoute(route) {
  return route?.sport === 'running' || isRunProfile(route?.surface_type) ? 'running' : 'cycling';
}

/**
 * The builder profile a saved route reopens on, from its `surface_type` and
 * `sport` (routes.sport, migration 135; inferred from surface_type when the
 * column is missing). Null when the row says nothing usable, so the caller
 * leaves the current profile alone.
 *
 * @param {{ surface_type?: string|null, sport?: string|null }|null} route
 * @returns {string|null}
 */
export function profileFromSavedRoute(route) {
  const surface = route?.surface_type ?? null;
  if (sportOfSavedRoute(route) === 'running') {
    return isRunProfile(surface) ? surface : DEFAULT_RUN_PROFILE;
  }
  if (surface === 'mtb') return 'mountain';
  if (surface === 'commute') return 'commuting';
  return RIDE_PROFILES.has(surface) ? surface : null;
}

/**
 * Easy (endurance-goal) running speed when nothing is known about the
 * athlete. A trail run is
 * slower at the same effort (footing, not just climb, which K_CLIMB covers).
 */
export const DEFAULT_RUN_SPEED_KMH = Object.freeze({ run: 10, trail_run: 8.5 });

/**
 * Pace for each goal as a multiple of threshold pace (higher = slower).
 * Intervals is the session's average, not the rep pace.
 */
export const RUN_GOAL_PACE_FACTOR = Object.freeze({
  recovery: 1.35,
  endurance: 1.25,
  long_ride: 1.28, // the form's "Long run" maps onto the long_ride goal key
  tempo: 1.05,
  threshold: 1.05,
  intervals: 1.12,
  hills: 1.2,
});

/** Trail footing costs ~15% of flat speed beyond the climb itself. */
const TRAIL_SPEED_FACTOR = 0.85;

/**
 * Flat running speed (km/h) for a goal, from the athlete's threshold pace when
 * known. Never reads the cycling speed profile, which is built from rides.
 *
 * @param {{ profile?: string, goal?: string, thresholdPaceSec?: number|null }} opts
 */
export function runFlatSpeedKmh({ profile = 'run', goal = 'endurance', thresholdPaceSec = null } = {}) {
  const trail = profile === 'trail_run';
  const factor = RUN_GOAL_PACE_FACTOR[goal] ?? RUN_GOAL_PACE_FACTOR.endurance;
  if (!(Number(thresholdPaceSec) > 0)) {
    // The defaults are easy (endurance) speeds; other goals scale from there.
    const base = DEFAULT_RUN_SPEED_KMH[trail ? 'trail_run' : 'run'];
    return base * (RUN_GOAL_PACE_FACTOR.endurance / factor);
  }
  const kmh = 3600 / (Number(thresholdPaceSec) * factor);
  return trail ? kmh * TRAIL_SPEED_FACTOR : kmh;
}

/**
 * Running time for a route: flat pace over distance plus climb converted to
 * equivalent flat metres — the same K_CLIMB the run-load model uses, so the
 * builder's ETA and the scored session agree on what a hill costs.
 *
 * @returns {number} seconds
 */
export function runDurationSeconds({ distance_m, elevation_gain_m = 0, speedKmh }) {
  if (!(distance_m > 0) || !(speedKmh > 0)) return 0;
  const equivalent_m = distance_m + K_CLIMB * Math.max(0, elevation_gain_m || 0);
  return (equivalent_m / 1000 / speedKmh) * 3600;
}
