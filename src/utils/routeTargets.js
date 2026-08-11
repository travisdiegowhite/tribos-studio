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
