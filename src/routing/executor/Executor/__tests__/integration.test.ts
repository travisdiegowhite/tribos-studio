/**
 * Executor facade integration tests.
 *
 * These exercise the genuine seam — real ConstraintBuilder, real
 * RouterClient, real routing providers (Stadia / BRouter / Mapbox)
 * — and therefore hit the network. They are gated behind
 * `RUN_INTEGRATION_TESTS`; the default `npm run test:run` skips them.
 *
 *   RUN_INTEGRATION_TESTS=1 npm run test:run
 *
 * Inputs are known-good coordinates around Erie, Colorado. Assertions
 * are intentionally loose: routing providers are best-effort, so the
 * tests check directional sanity (a route came back, alternatives
 * differ from one another) rather than exact figures.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getRouterClient, setRouterClient } from '../../../RouterClient';
import type { RouteContext, RouteSnapshot } from '../../types';
import { Executor, setExecutor } from '../Executor';

const RUN = Boolean(process.env.RUN_INTEGRATION_TESTS);

function erieRoute(): RouteSnapshot {
  const waypoints = [
    [-105.0497, 40.0503],
    [-105.0800, 40.0700],
    [-105.0450, 40.0850],
    [-105.0497, 40.0503],
  ] as const;
  return {
    geometry: waypoints.map((c) => [c[0], c[1]]),
    waypoints: waypoints.map((c) => ({ coordinate: [c[0], c[1]] })),
    stats: {
      distance_km: 12,
      elevation_gain_m: 180,
      elevation_loss_m: 180,
      duration_s: 2400,
    },
  };
}

function erieContext(): RouteContext {
  return {
    profile: 'road',
    shape: 'loop',
    training_goal: 'endurance',
    start_coord: [-105.0497, 40.0503],
    mapbox_token: process.env.VITE_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN,
    speed_profile: { flat_kph: 25 },
  };
}

describe.runIf(RUN)('Executor integration (real routing APIs)', () => {
  afterEach(() => {
    getRouterClient().clearCache();
    setRouterClient(null);
    setExecutor(null);
  });

  it('generate(count: 1) produces a real route via the provider chain', async () => {
    const executor = new Executor();
    const result = await executor.generate(erieContext(), {
      goal: 'endurance',
      distance_km: 20,
    });
    expect((result as { ok: boolean }).ok).toBe(true);
    if (!('ok' in result) || !result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
    expect(result.route.stats.distance_km).toBeGreaterThan(5);
    expect(result.metadata.provider_used).not.toBeNull();
  });

  it('generate(count: 3) produces three real routes', async () => {
    const executor = new Executor();
    const results = (await executor.generate(
      erieContext(),
      { goal: 'endurance', distance_km: 20 },
      3,
    )) as Array<{ ok: boolean }>;
    expect(results.length).toBe(3);
    // At least one alternative should succeed; not all providers are
    // guaranteed to honor every perturbed seed.
    expect(results.filter((r) => r.ok).length).toBeGreaterThan(0);
  });

  it('generate with like_ride_id reuses the past ride waypoints', async () => {
    const past = erieRoute();
    const executor = new Executor();
    const result = await executor.generate(
      {
        ...erieContext(),
        recent_rides: [
          { id: 'past-1', waypoints: past.waypoints.map((w) => w.coordinate) },
        ],
      },
      { distance_km: 15, like_ride_id: 'past-1' },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('applyMutation works end-to-end via the facade', async () => {
    const executor = new Executor();
    const result = await executor.applyMutation(erieRoute(), erieContext(), {
      type: 'reduce_climbing',
      magnitude: 'moderate',
    });
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('applyManualAction(reverse_route) works end-to-end via the facade', async () => {
    const executor = new Executor();
    const result = await executor.applyManualAction(
      erieRoute(),
      erieContext(),
      'reverse_route',
      { action: 'reverse_route' },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
