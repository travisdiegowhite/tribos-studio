/**
 * `remove_waypoint` handler — drops a waypoint by index and re-routes.
 *
 * Refuses with `constraint_infeasible` when the route would be left with
 * fewer than 2 waypoints (RouterClient requires at least 2 to connect).
 */

import { getRouterClient } from '../../../RouterClient';
import type {
  ExecutorFailure,
  ExecutorResult,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import type { RemoveWaypointPayload } from '../payloadValidation';

export async function handleRemoveWaypoint(
  route: RouteSnapshot,
  context: RouteContext,
  payload: RemoveWaypointPayload,
): Promise<ExecutorResult> {
  if (
    payload.waypoint_index < 0 ||
    payload.waypoint_index >= route.waypoints.length
  ) {
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: `waypoint_index ${payload.waypoint_index} out of bounds (route has ${route.waypoints.length} waypoints)`,
    };
    return { ok: false, reason: failure, partial: route };
  }

  if (route.waypoints.length <= 2) {
    const failure: ExecutorFailure = {
      kind: 'constraint_infeasible',
      constraint: 'remove_waypoint',
      explanation:
        'cannot remove — route would have fewer than 2 waypoints',
    };
    return { ok: false, reason: failure, partial: route };
  }

  const newWaypoints = route.waypoints.filter(
    (_, i) => i !== payload.waypoint_index,
  );
  const result = await getRouterClient().connect(
    newWaypoints.map((w) => w.coordinate),
    context,
  );
  if (!result.ok) {
    return { ...result, partial: route };
  }
  return result;
}
