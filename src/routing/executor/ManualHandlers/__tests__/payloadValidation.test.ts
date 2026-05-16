import { describe, expect, it } from 'vitest';

import type { ManualActionPayload } from '../../types';
import {
  isAddWaypointPayload,
  isClearRoutePayload,
  isDragWaypointPayload,
  isRemoveWaypointPayload,
  isReverseRoutePayload,
} from '../payloadValidation';

const payloads: Record<ManualActionPayload['action'], ManualActionPayload> = {
  drag_waypoint: {
    action: 'drag_waypoint',
    waypoint_index: 0,
    new_coord: [-105, 40],
  },
  add_waypoint: { action: 'add_waypoint', coord: [-105, 40] },
  remove_waypoint: { action: 'remove_waypoint', waypoint_index: 1 },
  reverse_route: { action: 'reverse_route' },
  clear_route: { action: 'clear_route' },
};

describe('payload type guards', () => {
  it('isDragWaypointPayload matches only drag_waypoint', () => {
    expect(isDragWaypointPayload(payloads.drag_waypoint)).toBe(true);
    expect(isDragWaypointPayload(payloads.add_waypoint)).toBe(false);
    expect(isDragWaypointPayload(payloads.remove_waypoint)).toBe(false);
    expect(isDragWaypointPayload(payloads.reverse_route)).toBe(false);
    expect(isDragWaypointPayload(payloads.clear_route)).toBe(false);
  });

  it('isAddWaypointPayload matches only add_waypoint', () => {
    expect(isAddWaypointPayload(payloads.add_waypoint)).toBe(true);
    expect(isAddWaypointPayload(payloads.drag_waypoint)).toBe(false);
  });

  it('isRemoveWaypointPayload matches only remove_waypoint', () => {
    expect(isRemoveWaypointPayload(payloads.remove_waypoint)).toBe(true);
    expect(isRemoveWaypointPayload(payloads.drag_waypoint)).toBe(false);
  });

  it('isReverseRoutePayload matches only reverse_route', () => {
    expect(isReverseRoutePayload(payloads.reverse_route)).toBe(true);
    expect(isReverseRoutePayload(payloads.clear_route)).toBe(false);
  });

  it('isClearRoutePayload matches only clear_route', () => {
    expect(isClearRoutePayload(payloads.clear_route)).toBe(true);
    expect(isClearRoutePayload(payloads.reverse_route)).toBe(false);
  });
});
