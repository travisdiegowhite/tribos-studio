/**
 * `drag_waypoint` handler — replaces a waypoint coordinate and re-routes.
 *
 * The user dragged waypoint `waypoint_index` to `new_coord`. We swap it
 * in and call `RouterClient.connect` over the full waypoint list. The
 * router naturally produces the "partial re-route" effect: geometry only
 * changes around the modified waypoint.
 */

import { isValidCoordinate } from '../../../../types/geo';
import { getRouterClient } from '../../../RouterClient';
import type {
  ExecutorFailure,
  ExecutorResult,
  RouteContext,
  RouteSnapshot,
} from '../../types';
import type { DragWaypointPayload } from '../payloadValidation';

export async function handleDragWaypoint(
  route: RouteSnapshot,
  context: RouteContext,
  payload: DragWaypointPayload,
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

  if (!isValidCoordinate(payload.new_coord)) {
    const failure: ExecutorFailure = {
      kind: 'internal_error',
      message: 'new_coord is not a valid coordinate',
    };
    return { ok: false, reason: failure, partial: route };
  }

  const newWaypoints = route.waypoints.map((w, i) =>
    i === payload.waypoint_index ? { coordinate: payload.new_coord } : w,
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
