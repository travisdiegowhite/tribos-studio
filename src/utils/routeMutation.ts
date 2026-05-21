/**
 * Shared route-mutation helpers for the v2 chat edit pipeline.
 *
 * Both `replicatedEditLogic.ts` (the v1 keyword-classifier dispatch) and
 * `applyAIEditViaCoach.ts` (the /api/route-coach dispatch) recompute a
 * route's distance/elevation after `applyRouteEdit` mutates geometry,
 * and both re-snap shortened routes. Lifting these three functions here
 * keeps the two dispatch paths from drifting.
 */
import { getSmartCyclingRoute } from './smartCyclingRouter';
import { getElevationData, calculateElevationStats } from './elevation';
import { haversineMeters, M_TO_KM } from './distanceUnits';
import type { Coordinate } from '../types/geo';

export function computeDistanceKm(coordinates: ReadonlyArray<Coordinate>): number {
  let total_m = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    total_m += haversineMeters(lat1, lon1, lat2, lon2);
  }
  return M_TO_KM(total_m);
}

/**
 * Re-snap a trimmed coordinate list to roads. Used for intents that
 * return `needsReroute: true` (currently `shorter`) — the raw trim
 * produces a straight chord that needs routing back onto the network.
 */
export async function rerouteShortened(
  trimmed: ReadonlyArray<Coordinate>,
  profile: string,
): Promise<Coordinate[]> {
  if (trimmed.length < 2) return trimmed as Coordinate[];
  const stride = Math.max(1, Math.floor(trimmed.length / 4));
  const seedWaypoints = trimmed.filter(
    (_, i) => i === 0 || i === trimmed.length - 1 || i % stride === 0,
  ) as Array<[number, number]>;
  try {
    const rerouted = await (
      getSmartCyclingRoute as unknown as (
        waypoints: Array<[number, number]>,
        options: { profile: string },
      ) => Promise<{ coordinates?: Array<[number, number]> } | null>
    )(seedWaypoints, { profile });
    if (rerouted?.coordinates && rerouted.coordinates.length > 1) {
      return rerouted.coordinates as Coordinate[];
    }
  } catch {
    /* fall through */
  }
  return trimmed as Coordinate[];
}

export async function fetchElevationGain(
  coordinates: ReadonlyArray<Coordinate>,
): Promise<number | null> {
  try {
    const profile = (await getElevationData(
      coordinates as Array<[number, number]>,
    )) as Array<{ elevation: number }> | null;
    if (!profile || !Array.isArray(profile) || profile.length === 0) return null;
    const stats = calculateElevationStats(profile) as { gain?: number };
    return stats.gain ?? null;
  } catch {
    return null;
  }
}
