/**
 * Type guards for the `ManualActionPayload` discriminated union.
 *
 * `applyManualAction` dispatches by `action`, but each handler needs a
 * narrowed payload type. These guards do that narrowing in one place so
 * the dispatcher stays type-safe without `as` casts.
 */

import type { ManualActionPayload } from '../types';

export type DragWaypointPayload = Extract<
  ManualActionPayload,
  { action: 'drag_waypoint' }
>;
export type AddWaypointPayload = Extract<
  ManualActionPayload,
  { action: 'add_waypoint' }
>;
export type RemoveWaypointPayload = Extract<
  ManualActionPayload,
  { action: 'remove_waypoint' }
>;
export type ReverseRoutePayload = Extract<
  ManualActionPayload,
  { action: 'reverse_route' }
>;
export type ClearRoutePayload = Extract<
  ManualActionPayload,
  { action: 'clear_route' }
>;

export function isDragWaypointPayload(
  p: ManualActionPayload,
): p is DragWaypointPayload {
  return p.action === 'drag_waypoint';
}

export function isAddWaypointPayload(
  p: ManualActionPayload,
): p is AddWaypointPayload {
  return p.action === 'add_waypoint';
}

export function isRemoveWaypointPayload(
  p: ManualActionPayload,
): p is RemoveWaypointPayload {
  return p.action === 'remove_waypoint';
}

export function isReverseRoutePayload(
  p: ManualActionPayload,
): p is ReverseRoutePayload {
  return p.action === 'reverse_route';
}

export function isClearRoutePayload(
  p: ManualActionPayload,
): p is ClearRoutePayload {
  return p.action === 'clear_route';
}
