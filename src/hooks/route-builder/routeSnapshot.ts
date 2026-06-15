/**
 * routeSnapshot — build a `RouteSnapshot` from a generated route.
 *
 * Shared by `useAIGeneration` (form-driven generation) and the chat-driven
 * multi-candidate builder (`src/utils/naturalLanguageRouteCandidates.ts`) so
 * both produce identically-shaped suggestions: dense geometry plus a handful
 * of resampled control points that keep the route drag-editable.
 */
import { resamplePositionsFromGeometry } from './waypointResample';
import type { Coordinate, RouteSnapshot } from './types';

/** How many control points to seed along a generated route for editability. */
const GENERATED_WAYPOINT_SAMPLES = 6;

/**
 * Control-point coordinates for a generated route: resampled from the geometry
 * (loop-closed, elevation-stripped) so the route is drag-editable, falling back
 * to the stripped endpoints if sampling yields fewer than two distinct points.
 */
export function waypointCoordsForGeometry(
  rawCoords: ReadonlyArray<ReadonlyArray<number>>,
): Coordinate[] {
  const sampled = resamplePositionsFromGeometry(rawCoords, GENERATED_WAYPOINT_SAMPLES);
  if (sampled.length >= 2) return sampled;
  const first = rawCoords[0];
  const last = rawCoords[rawCoords.length - 1];
  return [
    [first[0], first[1]],
    [last[0], last[1]],
  ];
}

export interface GeneratedRouteStatsInput {
  coordinates: ReadonlyArray<ReadonlyArray<number>>;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m?: number;
  duration_s: number;
}

/**
 * Build a RouteSnapshot from generated-route geometry + canonical-unit stats.
 * Returns null when the geometry can't support a route (< 2 points).
 */
export function snapshotFromGeneratedRoute(input: GeneratedRouteStatsInput): RouteSnapshot | null {
  const { coordinates } = input;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const coords = coordinates as Coordinate[];
  const finiteOrZero = (v: number | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return {
    geometry: coords,
    waypoints: waypointCoordsForGeometry(coordinates).map((coordinate) => ({ coordinate })),
    stats: {
      distance_km: finiteOrZero(input.distance_km),
      elevation_gain_m: finiteOrZero(input.elevation_gain_m),
      elevation_loss_m: finiteOrZero(input.elevation_loss_m),
      duration_s: finiteOrZero(input.duration_s),
    },
  };
}
