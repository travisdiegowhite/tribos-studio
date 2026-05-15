import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../../RouterClient';
import { handleReverseRoute } from '../../handlers/reverse_route';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  okResult,
} from '../helpers';

describe('handleReverseRoute', () => {
  afterEach(() => {
    setRouterClient(null);
  });

  it('passes a reversed waypoint list to RouterClient.connect', async () => {
    const route = makeRoute({ waypointCount: 3 });
    const originalCoords = route.waypoints.map((w) => w.coordinate);
    const fake = makeFakeRouterClient(okResult(makeRoute({ distance_km: 11 })));
    setRouterClient(fake);

    const result = await handleReverseRoute(
      route,
      makeContext(),
      { action: 'reverse_route' },
    );

    expect(result.ok).toBe(true);
    const connectFn = (fake as unknown as { connect: ReturnType<typeof vi.fn> })
      .connect;
    expect(connectFn).toHaveBeenCalledTimes(1);
    const passedCoords = connectFn.mock.calls[0][0];
    expect(passedCoords).toEqual([...originalCoords].reverse());
  });

  it('returns the routed result on success', async () => {
    setRouterClient(
      makeFakeRouterClient(okResult(makeRoute({ distance_km: 13 }))),
    );
    const result = await handleReverseRoute(
      makeRoute(),
      makeContext(),
      { action: 'reverse_route' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.stats.distance_km).toBe(13);
  });

  it('on router failure, attaches partial: route for UI revert', async () => {
    const route = makeRoute();
    setRouterClient(
      makeFakeRouterClient({
        ok: false,
        reason: { kind: 'waypoint_unreachable', waypoint_index: 0 },
      }),
    );
    const result = await handleReverseRoute(
      route,
      makeContext(),
      { action: 'reverse_route' },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.kind).toBe('waypoint_unreachable');
    expect(result.partial).toBe(route);
  });
});
