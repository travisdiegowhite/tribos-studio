/**
 * Pure target-scoring helpers shared by route generation
 * (aiRouteGenerator.js) and route editing (aiRouteEditService.js).
 *
 * Extracted from aiRouteGenerator.js so the edit service can use them
 * without importing the generator's heavy browser-coupled graph
 * (enhancedContext → Supabase client). aiRouteGenerator.js re-exports
 * both for its existing callers.
 */

/**
 * Score how close an actual value lands to an explicit rider target.
 * Returns 0 when no target was set. Exported for tests.
 */
export function getTargetProximityScore(actual, target, weight) {
  if (!target || target <= 0 || !actual || actual <= 0) return 0;
  const ratio = actual / target;
  if (ratio >= 0.85 && ratio <= 1.15) return weight;        // on target
  if (ratio >= 0.7 && ratio <= 1.35) return weight * 0.4;   // close
  if (ratio >= 0.5 && ratio <= 1.7) return 0;               // meh
  return -weight;                                            // way off
}

/**
 * Map an elevation-gain target to a Valhalla use_hills bias (0–1) via the
 * implied gain-per-km. Exported for tests.
 */
export function hillsBiasForTarget(elevationGainTargetM, targetDistanceKm) {
  if (!elevationGainTargetM || !targetDistanceKm || targetDistanceKm <= 0) return null;
  const gainPerKm = elevationGainTargetM / targetDistanceKm;
  if (gainPerKm < 5) return 0.15;   // pancake request — actively avoid climbs
  if (gainPerKm < 10) return 0.35;  // gently rolling
  if (gainPerKm < 18) return 0.6;   // rolling/hilly
  if (gainPerKm < 28) return 0.8;   // hilly
  return 0.95;                      // mountain day
}

// ── Canonical ride-goal + speed model ────────────────────────────────
//
// One vocabulary, one speed model, shared by the two places that used to
// disagree: target-distance calculation (aiRouteGenerator.calculateTargetDistance)
// and displayed ride time (personalizedETA.calculatePersonalizedETA).
//
// Before this existed they were keyed differently — targeting understood
// `recovery/endurance/intervals/hills` while the generate form offers
// `endurance/tempo/threshold/recovery/long_ride/commute`, so four of the six
// fell through to a 19 km/h default while the ETA used 25 km/h × its own
// multiplier. A 90-minute tempo request produced a route the UI then labelled
// ~65 minutes. Every goal string in the app must resolve here.

/**
 * Intensity multiplier applied to flat-ground speed, by ride goal.
 * Values carried over from personalizedETA's original GOAL_MULTIPLIERS so
 * displayed ETAs don't shift for the goals it already knew about.
 */
export const RIDE_GOAL_INTENSITY = {
  // The six goals the RB2 generate form offers.
  recovery: 0.82,
  endurance: 0.95,
  tempo: 1.05,
  threshold: 1.05,
  long_ride: 0.92,
  commute: 0.90,
  // Goals used by other callers (v1 form, natural-language parsing, plans).
  intervals: 0.90, // includes rest between efforts
  hills: 0.92,
  climbing: 0.92,
  race: 1.10,
};

export const DEFAULT_RIDE_GOAL = 'endurance';

/** Flat-ground speeds (km/h) by routing profile when we have no rider data. */
export const DEFAULT_FLAT_SPEED_KMH = {
  road: 25,
  gravel: 20,
  mountain: 16,
  mtb: 16,
  commute: 20,
  commuting: 20,
  walking: 5,
};

/** Resolve a goal string to its intensity multiplier. Unknown → endurance. */
export function rideGoalIntensity(goal) {
  if (typeof goal !== 'string') return RIDE_GOAL_INTENSITY[DEFAULT_RIDE_GOAL];
  return (
    RIDE_GOAL_INTENSITY[goal] ??
    RIDE_GOAL_INTENSITY[goal.toLowerCase()] ??
    RIDE_GOAL_INTENSITY[DEFAULT_RIDE_GOAL]
  );
}

/**
 * The rider's flat-ground speed for a routing profile, before any goal,
 * grade, surface or fatigue adjustment. Prefers their measured speed
 * profile, then Strava-derived performance metrics, then the profile default.
 *
 * @param {object}  params
 * @param {string}  [params.routeProfile='road']
 * @param {object}  [params.speedProfile]        rider speed profile row
 * @param {object}  [params.performanceMetrics]  { averageSpeed, confidence }
 * @returns {number} km/h
 */
export function flatProfileSpeedKmh({
  routeProfile = 'road',
  speedProfile = null,
  performanceMetrics = null,
} = {}) {
  const fallback = DEFAULT_FLAT_SPEED_KMH[routeProfile] ?? DEFAULT_FLAT_SPEED_KMH.road;

  if (speedProfile) {
    switch (routeProfile) {
      case 'gravel':
        if (speedProfile.gravel_speed) return speedProfile.gravel_speed;
        if (speedProfile.average_speed) return speedProfile.average_speed * 0.85;
        break;
      case 'mountain':
      case 'mtb':
        if (speedProfile.mtb_speed) return speedProfile.mtb_speed;
        if (speedProfile.average_speed) return speedProfile.average_speed * 0.7;
        break;
      case 'commute':
      case 'commuting':
        if (speedProfile.easy_speed) return speedProfile.easy_speed;
        if (speedProfile.average_speed) return speedProfile.average_speed * 0.9;
        break;
      case 'walking':
        return DEFAULT_FLAT_SPEED_KMH.walking;
      default: {
        const road = speedProfile.road_speed || speedProfile.average_speed;
        if (road) return road;
      }
    }
    const any = speedProfile.road_speed || speedProfile.average_speed;
    if (any) return any;
  }

  // No speed profile: blend the Strava-derived average toward the default,
  // weighted by how much we trust it. Replaces the old separate
  // `fitnessLevel` multiplier, which double-counted fitness already
  // reflected in the rider's measured speed.
  if (performanceMetrics?.averageSpeed > 0) {
    const confidence = Math.min(Math.max(performanceMetrics.confidence ?? 0, 0), 0.8);
    if (confidence > 0) {
      const profileAdjusted =
        routeProfile === 'road' || !DEFAULT_FLAT_SPEED_KMH[routeProfile]
          ? performanceMetrics.averageSpeed
          : performanceMetrics.averageSpeed *
            (DEFAULT_FLAT_SPEED_KMH[routeProfile] / DEFAULT_FLAT_SPEED_KMH.road);
      return profileAdjusted * confidence + fallback * (1 - confidence);
    }
  }

  return fallback;
}

/**
 * Flat-ground speed with the goal's intensity folded in — what a target
 * distance should be derived from, and the same number personalizedETA
 * reaches before grade/surface/fatigue.
 *
 * @returns {number} km/h
 */
export function flatSpeedKmh({
  goal = DEFAULT_RIDE_GOAL,
  routeProfile = 'road',
  speedProfile = null,
  performanceMetrics = null,
  speedModifier = 1.0,
} = {}) {
  const base = flatProfileSpeedKmh({ routeProfile, speedProfile, performanceMetrics });
  const modifier = Number.isFinite(speedModifier) && speedModifier > 0 ? speedModifier : 1.0;
  return base * rideGoalIntensity(goal) * modifier;
}

/**
 * Target distance for a requested ride time. The inverse of the ETA model on
 * flat ground, so "90 minutes" and the duration the UI shows agree by
 * construction on a flat route (hills are corrected for separately).
 *
 * @returns {number} km
 */
export function targetDistanceKmForTime(timeMinutes, opts = {}) {
  const minutes = Number(timeMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return (minutes / 60) * flatSpeedKmh(opts);
}
