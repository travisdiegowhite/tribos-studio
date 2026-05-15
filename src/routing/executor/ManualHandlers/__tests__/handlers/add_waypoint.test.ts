import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../../RouterClient';
import { handleAddWaypoint } from '../../handlers/add_waypoint';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  okResult,
} from '../helpers';

describe('handleAddWaypoint', () => {
  afterEach(() => {
    setRouterClient(null);
  });

  it('inserts at the explicit insert_at index when provided', async () => {
    const route = makeRoute({ waypointCount: 3 });
    const fake = makeFakeRouterClient(okResult(makeRoute()));
    setRouterClient(fake);

    await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-105.05, 40.05],
      insert_at: 1,
    });

    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as readonly (readonly [number, number])[];
    expect(passedCoords.length).toBe(4);
    expect(passedCoords[1]).toEqual([-105.05, 40.05]);
  });

  it('appends when insert_at equals waypoints.length', async () => {
    const route = makeRoute({ waypointCount: 2 });
    const fake = makeFakeRouterClient(okResult(makeRoute()));
    setRouterClient(fake);

    await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-104.5, 40.5],
      insert_at: 2,
    });

    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as readonly (readonly [number, number])[];
    expect(passedCoords.length).toBe(3);
    expect(passedCoords[2]).toEqual([-104.5, 40.5]);
  });

  it('inserts at nearest-segment index when insert_at is omitted', async () => {
    // Route: 3 waypoints along the equator at lng -105.10, -105.00, -104.90.
    // New coord [-105.05, 40] is on the first segment (between waypoints
    // 0 and 1), so insertion index should be 1.
    const waypoints = [
      { coordinate: [-105.10, 40] as [number, number] },
      { coordinate: [-105.00, 40] as [number, number] },
      { coordinate: [-104.90, 40] as [number, number] },
    ];
    const route = {
      geometry: waypoints.map((w) => w.coordinate),
      waypoints,
      stats: {
        distance_km: 17,
        elevation_gain_m: 0,
        elevation_loss_m: 0,
        duration_s: 0,
      },
    };
    const fake = makeFakeRouterClient(okResult(makeRoute()));
    setRouterClient(fake);

    await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-105.05, 40],
    });

    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as readonly (readonly [number, number])[];
    expect(passedCoords.length).toBe(4);
    expect(passedCoords[1]).toEqual([-105.05, 40]);
  });

  it('chooses the second segment when the new coord is closer to it', async () => {
    const waypoints = [
      { coordinate: [-105.10, 40] as [number, number] },
      { coordinate: [-105.00, 40] as [number, number] },
      { coordinate: [-104.90, 40] as [number, number] },
    ];
    const route = {
      geometry: waypoints.map((w) => w.coordinate),
      waypoints,
      stats: {
        distance_km: 17,
        elevation_gain_m: 0,
        elevation_loss_m: 0,
        duration_s: 0,
      },
    };
    const fake = makeFakeRouterClient(okResult(makeRoute()));
    setRouterClient(fake);

    // [-104.95, 40] is on the second segment.
    await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-104.95, 40],
    });

    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    const passedCoords = connectFn.mock.calls[0][0] as readonly (readonly [number, number])[];
    expect(passedCoords[2]).toEqual([-104.95, 40]);
  });

  it('returns internal_error with partial revert for invalid coord', async () => {
    const route = makeRoute();
    setRouterClient(null);
    const result = await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [999, 40] as unknown as [number, number],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('returns internal_error for out-of-bounds insert_at', async () => {
    const route = makeRoute({ waypointCount: 2 });
    setRouterClient(null);
    const result = await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-105, 40],
      insert_at: 99,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('internal_error');
    expect(result.partial).toBe(route);
  });

  it('returns internal_error for negative insert_at', async () => {
    const route = makeRoute({ waypointCount: 2 });
    setRouterClient(null);
    const result = await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-105, 40],
      insert_at: -1,
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
        reason: { kind: 'waypoint_unreachable', waypoint_index: 1 },
      }),
    );
    const result = await handleAddWaypoint(route, makeContext(), {
      action: 'add_waypoint',
      coord: [-105.05, 40],
      insert_at: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('waypoint_unreachable');
    expect(result.partial).toBe(route);
  });
});
