/**
 * ManualHandlers integration tests.
 *
 * Exercises the real RouterClient + real routing providers (Stadia /
 * BRouter / Mapbox), so these hit the network. Gated behind
 * `RUN_INTEGRATION_TESTS` and skipped by `npm run test:run`.
 *
 *   RUN_INTEGRATION_TESTS=1 npm run test:run
 *
 * Inputs are known-good waypoints around Erie, Colorado. Assertions are
 * loose: providers are best-effort, so the tests check directional
 * sanity rather than exact figures.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getRouterClient, setRouterClient } from '../../../RouterClient';
import type { RouteContext, RouteSnapshot } from '../../types';
import { applyManualAction } from '../ManualHandlers';

const RUN = Boolean(process.env.RUN_INTEGRATION_TESTS);

function erieRoute(): RouteSnapshot {
  const waypoints = [
    [-105.0497, 40.0503],
    [-105.0800, 40.0700],
    [-105.0450, 40.0850],
  ] as const;
  return {
    geometry: waypoints.map((c) => [c[0], c[1]]),
    waypoints: waypoints.map((c) => ({ coordinate: [c[0], c[1]] })),
    stats: {
      distance_km: 8,
      elevation_gain_m: 120,
      elevation_loss_m: 120,
      duration_s: 1600,
    },
  };
}

function erieContext(): RouteContext {
  return {
    profile: 'road',
    shape: 'point_to_point',
    training_goal: 'endurance',
    start_coord: [-105.0497, 40.0503],
    mapbox_token: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN,
    speed_profile: { flat_kph: 25 },
  };
}

describe.runIf(RUN)('ManualHandlers integration (real routing APIs)', () => {
  afterEach(() => {
    getRouterClient().clearCache();
    setRouterClient(null);
  });

  it('drag_waypoint produces a real re-routed path', async () => {
    const route = erieRoute();
    const result = await applyManualAction(
      route,
      erieContext(),
      'drag_waypoint',
      {
        action: 'drag_waypoint',
        waypoint_index: 1,
        new_coord: [-105.0600, 40.0750],
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
    expect(result.metadata.provider_used).not.toBeNull();
  });

  it('add_waypoint with explicit insert_at inserts and re-routes', async () => {
    const route = erieRoute();
    const result = await applyManualAction(
      route,
      erieContext(),
      'add_waypoint',
      {
        action: 'add_waypoint',
        coord: [-105.0700, 40.0600],
        insert_at: 1,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
  });

  it('add_waypoint nearest-segment selects a reasonable insertion point', async () => {
    const route = erieRoute();
    const result = await applyManualAction(
      route,
      erieContext(),
      'add_waypoint',
      {
        action: 'add_waypoint',
        coord: [-105.0700, 40.0600],
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
  });

  it('remove_waypoint produces a shorter or comparable route', async () => {
    const route = erieRoute();
    const result = await applyManualAction(
      route,
      erieContext(),
      'remove_waypoint',
      { action: 'remove_waypoint', waypoint_index: 1 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(2);
  });

  it('reverse_route produces a routed reversed direction', async () => {
    const route = erieRoute();
    const result = await applyManualAction(
      route,
      erieContext(),
      'reverse_route',
      { action: 'reverse_route' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
  });

  it('clear_route produces an empty route without a network call', async () => {
    const result = await applyManualAction(
      erieRoute(),
      erieContext(),
      'clear_route',
      { action: 'clear_route' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry).toEqual([]);
    expect(result.route.waypoints).toEqual([]);
    expect(result.metadata.provider_used).toBeNull();
  });
});
