/**
 * `add_waypoint` handler — inserts a new waypoint and re-routes.
 *
 * Two insertion modes:
 * - If `insert_at` is provided: splice at that exact index after a
 *   bounds check (0 ≤ insert_at ≤ waypoints.length).
 * - If omitted: find the segment (between consecutive waypoints) whose
 *   perpendicular distance to `coord` is smallest and insert there.
 *
 * Nearest-segment uses Turf's `pointToLineDistance` over each
 * consecutive waypoint pair — well-tested geometric primitive, avoids
 * reinventing perpendicular-distance math.
 */

import { pointToLineDistance } from '@turf/turf';

import { isValidCoordinate } from '../../../../types/geo';
import { getRouterClient } from '../../../RouterClient';
import type { Coordinate } from '../../../../types/geo';
import type {
  ExecutorFailure,
  ExecutorResult,
  RouteContext,
  RouteSnapshot,
  RouteWaypoint,
} from '../../types';
import type { AddWaypointPayload } from '../payloadValidation';

export async function handleAddWaypoint(
  route: RouteSnapshot,
  context: RouteContext,
  payload: AddWaypointPayload,
): Promise<ExecutorResult> {
  if (!isValidCoordinate(payload.coord)) {
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: 'coord is not a valid coordinate',
    };
    return { ok: false, reason: failure, partial: route };
  }

  let insertIndex: number;
  if (payload.insert_at !== undefined) {
    if (
      !Number.isInteger(payload.insert_at) ||
      payload.insert_at < 0 ||
      payload.insert_at > route.waypoints.length
    ) {
      const failure: ExecutorFailure = {
        kind: 'internal_error',
        message: `insert_at ${payload.insert_at} out of bounds (route has ${route.waypoints.length} waypoints)`,
      };
      return { ok: false, reason: failure, partial: route };
    }
    insertIndex = payload.insert_at;
  } else {
    insertIndex = findInsertionIndex(route.waypoints, payload.coord);
  }

  const newWaypoint: RouteWaypoint = { coordinate: payload.coord };
  const newWaypoints = [
    ...route.waypoints.slice(0, insertIndex),
    newWaypoint,
    ...route.waypoints.slice(insertIndex),
  ];

  if (newWaypoints.length < 2) {
    // RouterClient.connect needs at least 2 waypoints. Happens only when
    // inserting into a 0-waypoint route — not a normal flow, but covered.
    const failure: ExecutorFailure = {
      kind: 'constraint_infeasible',
      constraint: 'add_waypoint',
      explanation: 'route needs at least 2 waypoints after insertion',
    };
    return { ok: false, reason: failure, partial: route };
  }

  const result = await getRouterClient().connect(
    newWaypoints.map((w) => w.coordinate),
    context,
  );
  if (!result.ok) {
    return { ...result, partial: route };
  }
  return result;
}

/**
 * Find the index at which to insert `newCoord` such that it lands on
 * the nearest segment of the current waypoint chain. Linear scan;
 * routes typically have <100 waypoints so O(n) is fine.
 *
 * Returns 1 for routes with <2 waypoints (insert after the first).
 */
function findInsertionIndex(
  waypoints: readonly RouteWaypoint[],
  newCoord: Coordinate,
): number {
  if (waypoints.length < 2) return waypoints.length;

  let bestIndex = 1;
  let bestDistance = Infinity;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i].coordinate;
    const b = waypoints[i + 1].coordinate;
    const d = pointToLineDistance(
      [newCoord[0], newCoord[1]],
      {
        type: 'LineString',
        coordinates: [
          [a[0], a[1]],
          [b[0], b[1]],
        ],
      },
      { units: 'kilometers' },
    );
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}
