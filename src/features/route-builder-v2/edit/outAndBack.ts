/**
 * Out-and-back: ride the drawn route out, then back the same way (Phase 2,
 * docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.4).
 *
 * Pure geometry, no router call: the return leg is the outbound line
 * reversed, so it follows exactly the roads the rider chose (a router could
 * pick different ones). Waypoints are mirrored so a later edit on either leg
 * re-routes only that leg. Distance and time double; climbing becomes the
 * outbound climbing plus the outbound descending.
 */
import type { Coordinate } from '../../../types/geo';

export interface OutAndBackWaypoint {
  id: string;
  position: Coordinate | [number, number];
  type?: string;
  name?: string;
}

export interface OutAndBackStats {
  distance_km: number;
  elevation_gain_m: number;
  duration_s: number;
  elevation_loss_m?: number;
  [key: string]: unknown;
}

export interface OutAndBackResult {
  coordinates: number[][];
  waypoints: OutAndBackWaypoint[];
  stats: OutAndBackStats;
}

function samePoint(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  return !!a && !!b && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

/** True when the route already ends where it starts (a loop): out-and-back would double it. */
export function isLoop(coordinates: ReadonlyArray<readonly number[]> | null | undefined): boolean {
  if (!coordinates || coordinates.length < 2) return false;
  return samePoint(coordinates[0], coordinates[coordinates.length - 1]);
}

export function makeOutAndBack(
  coordinates: ReadonlyArray<readonly number[]>,
  waypoints: ReadonlyArray<OutAndBackWaypoint>,
  stats: OutAndBackStats,
): OutAndBackResult | null {
  if (!coordinates || coordinates.length < 2 || isLoop(coordinates)) return null;

  const out = coordinates.map((c) => [...c]);
  // The turnaround point is shared by both legs; don't repeat it.
  const back = out.slice(0, -1).reverse().map((c) => [...c]);

  const wps = waypoints.length >= 2 ? waypoints : [];
  const mirrored = wps
    .slice(0, -1)
    .reverse()
    .map((wp, i) => ({ ...wp, id: `${wp.id}-back-${i}` }));
  const all = [...wps, ...mirrored].map((wp, i, arr) => ({
    ...wp,
    type: i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'waypoint',
  }));

  const gain_m = Number(stats.elevation_gain_m) || 0;
  const loss_m = Number.isFinite(stats.elevation_loss_m) ? Number(stats.elevation_loss_m) : gain_m;
  return {
    coordinates: [...out, ...back],
    waypoints: all,
    stats: {
      ...stats,
      distance_km: (Number(stats.distance_km) || 0) * 2,
      duration_s: (Number(stats.duration_s) || 0) * 2,
      elevation_gain_m: Math.round(gain_m + loss_m),
      elevation_loss_m: Math.round(gain_m + loss_m),
    },
  };
}
