import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../../RouterClient';
import { handleClearRoute } from '../../handlers/clear_route';
import { makeContext, makeRoute } from '../helpers';

describe('handleClearRoute', () => {
  it('returns an empty route without calling RouterClient', async () => {
    // Setting RouterClient to a throwing-on-access object would expose
    // any accidental call. We assert by setting it null (default) and
    // checking the result doesn't depend on the router.
    setRouterClient(null);
    const result = await handleClearRoute(
      makeRoute(),
      makeContext(),
      { action: 'clear_route' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry).toEqual([]);
    expect(result.route.waypoints).toEqual([]);
    expect(result.route.stats).toEqual({
      distance_km: 0,
      elevation_gain_m: 0,
      elevation_loss_m: 0,
      duration_s: 0,
    });
  });

  it('reports provider_used: null in metadata (no provider was contacted)', async () => {
    setRouterClient(null);
    const result = await handleClearRoute(
      makeRoute(),
      makeContext(),
      { action: 'clear_route' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.provider_used).toBeNull();
    expect(result.metadata.cache_hit).toBe(false);
    expect(result.metadata.duration_ms).toBe(0);
    expect(result.metadata.attempts_tried).toBe(0);
  });
});
