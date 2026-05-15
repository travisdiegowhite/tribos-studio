import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../../RouterClient';
import { handleDragWaypoint } from '../../handlers/drag_waypoint';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  okResult,
} from '../helpers';

describe('handleDragWaypoint', () => {
  afterEach(() => {
    setRouterClient(null);
  });

  it('replaces the waypoint coordinate and re-routes', async () => {
    const route = makeRoute({ waypointCount: 3 });
    const fake = makeFakeRouterClient(okResult(makeRoute({ distance_km: 9 })));
    setRouterClient(fake);

    const result = await handleDragWaypoint(route, makeContext(), {
      action: 'drag_waypoint',
      waypoint_index: 1,
      new_coord: [-104.9, 40.1],
    });

    expect(result.ok).toBe(true);
    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as readonly (readonly [number, number])[];
    expect(passedCoords[1]).toEqual([-104.9, 40.1]);
    expect(passedCoords[0]).toEqual(route.waypoints[0].coordinate);
    expect(passedCoords[2]).toEqual(route.waypoints[2].coordinate);
  });

  it('returns internal_error with partial revert for out-of-bounds index', async () => {
    const route = makeRoute({ waypointCount: 2 });
    setRouterClient(null);
    const result = await handleDragWaypoint(route, makeContext(), {
      action: 'drag_waypoint',
      waypoint_index: 5,
      new_coord: [-105, 40],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('returns internal_error for an invalid coordinate', async () => {
    const route = makeRoute();
    setRouterClient(null);
    const result = await handleDragWaypoint(route, makeContext(), {
      action: 'drag_waypoint',
      waypoint_index: 0,
      // Out-of-range latitude.
      new_coord: [0, 200] as unknown as [number, number],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('attaches partial: route when RouterClient fails', async () => {
    const route = makeRoute();
    setRouterClient(
      makeFakeRouterClient({
        ok: false,
        reason: { kind: 'router_unavailable', providers_tried: ['stadia'] },
      }),
    );
    const result = await handleDragWaypoint(route, makeContext(), {
      action: 'drag_waypoint',
      waypoint_index: 0,
      new_coord: [-105, 40],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('router_unavailable');
    expect(result.partial).toBe(route);
  });

  it('does not mutate the original route waypoints', async () => {
    const route = makeRoute({ waypointCount: 3 });
    const original0 = route.waypoints[0].coordinate;
    const original1 = route.waypoints[1].coordinate;
    setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
    await handleDragWaypoint(route, makeContext(), {
      action: 'drag_waypoint',
      waypoint_index: 1,
      new_coord: [-104.5, 40.5],
    });
    expect(route.waypoints[0].coordinate).toBe(original0);
    expect(route.waypoints[1].coordinate).toBe(original1);
  });
});
