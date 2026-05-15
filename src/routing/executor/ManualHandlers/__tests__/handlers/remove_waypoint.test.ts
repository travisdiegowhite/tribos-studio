import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../../RouterClient';
import { handleRemoveWaypoint } from '../../handlers/remove_waypoint';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  okResult,
} from '../helpers';

describe('handleRemoveWaypoint', () => {
  afterEach(() => {
    setRouterClient(null);
  });

  it('removes the waypoint and re-routes', async () => {
    const route = makeRoute({ waypointCount: 4 });
    const fake = makeFakeRouterClient(okResult(makeRoute({ distance_km: 7 })));
    setRouterClient(fake);

    const result = await handleRemoveWaypoint(route, makeContext(), {
      action: 'remove_waypoint',
      waypoint_index: 1,
    });

    expect(result.ok).toBe(true);
    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as ReadonlyArray<readonly [number, number]>;
    expect(passedCoords.length).toBe(3);
    // Index 1 should not appear.
    expect(passedCoords).not.toContainEqual(route.waypoints[1].coordinate);
  });

  it('returns internal_error with partial revert for out-of-bounds index', async () => {
    const route = makeRoute({ waypointCount: 3 });
    setRouterClient(null);
    const result = await handleRemoveWaypoint(route, makeContext(), {
      action: 'remove_waypoint',
      waypoint_index: 99,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('returns internal_error with partial revert for negative index', async () => {
    const route = makeRoute({ waypointCount: 3 });
    setRouterClient(null);
    const result = await handleRemoveWaypoint(route, makeContext(), {
      action: 'remove_waypoint',
      waypoint_index: -1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('returns constraint_infeasible when removal would leave <2 waypoints', async () => {
    const route = makeRoute({ waypointCount: 2 });
    setRouterClient(null);
    const result = await handleRemoveWaypoint(route, makeContext(), {
      action: 'remove_waypoint',
      waypoint_index: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('constraint_infeasible');
    if (result.reason.kind !== 'constraint_infeasible') return;
    expect(result.reason.constraint).toBe('remove_waypoint');
    expect(result.partial).toBe(route);
  });

  it('attaches partial: route when RouterClient fails', async () => {
    const route = makeRoute({ waypointCount: 4 });
    setRouterClient(
      makeFakeRouterClient({
        ok: false,
        reason: { kind: 'waypoint_unreachable', waypoint_index: 1 },
      }),
    );
    const result = await handleRemoveWaypoint(route, makeContext(), {
      action: 'remove_waypoint',
      waypoint_index: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('waypoint_unreachable');
    expect(result.partial).toBe(route);
  });
});
