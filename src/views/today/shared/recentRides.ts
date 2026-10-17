/**
 * recentRides — shared helpers for the "last N rides" map shown on both the live
 * Today (RecentRides.tsx) and the routing-first glance (HeroRecentRides.tsx).
 *
 * Pure: row→RecentRide mapping (canonical-first with the historical column
 * fallbacks), the color palette, and the geo-filter that keeps indoor/virtual
 * rides with bogus coordinates from pulling the map bounds into the ocean.
 */

import { ridePolylineOf } from '../../../utils/rideGeo';
import { getActivitySport } from '../../../utils/sportType';

export interface RecentRide {
  id: string;
  name: string;
  startDate: string;
  distanceKm: number;
  elevationM: number;
  durationSec: number;
  polyline: string | null;
  provider: string | null;
  /** 'cycling' | 'running' | 'other' (multisport phase 4). */
  sport?: 'cycling' | 'running' | 'other';
}

/** Distinct line colors for up to 5 overlaid ride traces. */
export const RIDE_PALETTE = ['#2A8C82', '#3BA89D', '#D4600A', '#C49A0A', '#7A7970'];

/** ~200km at mid-latitudes — see filterRidesNearLatest. */
export const MAX_RIDE_DISTANCE_DEG = 2;

type ActivityRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  start_date: string;
  provider?: string | null;
};

/**
 * Map a raw activities row to a RecentRide, trying every historical distance /
 * duration / polyline column variant (including the Strava-shaped nested
 * `map.summary_polyline`). Distances are meters in the DB → km here.
 */
export function mapRowToRecentRide(a: ActivityRow): RecentRide {
  const sport = getActivitySport(a as { sport_type?: string | null; type?: string | null });
  return {
    id: a.id,
    name: a.name ?? (sport === 'running' ? 'Untitled Run' : 'Untitled Ride'),
    startDate: a.start_date,
    distanceKm: (Number(a.distance_meters) || Number(a.distance) || 0) / 1000,
    elevationM:
      Number(a.elevation_gain_meters) || Number(a.total_elevation_gain) || 0,
    durationSec:
      Number(a.duration_seconds) ||
      Number(a.moving_time) ||
      Number(a.elapsed_time) ||
      0,
    polyline: ridePolylineOf(a),
    provider: a.provider ?? null,
    sport,
  };
}

/**
 * Keep only rides whose first decoded point is geographically near the most
 * recent ride's. A virtual/indoor ride with bogus coordinates can otherwise
 * pull the bounds into the ocean and the map renders as a black tile.
 *
 * Generic over any shape carrying decoded `coords` ([lng, lat][]).
 */
export function filterRidesNearLatest<T extends { coords: Array<[number, number]> }>(
  decoded: T[],
): T[] {
  if (decoded.length <= 1) return decoded;
  const [refLng, refLat] = decoded[0].coords[0];
  const nearby = decoded.filter((r) => {
    const [lng, lat] = r.coords[0];
    const dist = Math.sqrt((lng - refLng) ** 2 + (lat - refLat) ** 2);
    return dist < MAX_RIDE_DISTANCE_DEG;
  });
  return nearby.length > 0 ? nearby : [decoded[0]];
}
