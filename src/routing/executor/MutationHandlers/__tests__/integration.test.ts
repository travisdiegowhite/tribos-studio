/**
 * MutationHandlers integration tests.
 *
 * These exercise the genuine composition seam — real ConstraintBuilder,
 * real RouterClient, real routing providers (Stadia / BRouter / Mapbox)
 * — and therefore hit the network. They are gated behind the
 * `RUN_INTEGRATION_TESTS` env var and skipped by the default
 * `npm run test:run`.
 *
 *   RUN_INTEGRATION_TESTS=1 npm run test:run
 *
 * Inputs are known-good coordinates around Erie, Colorado. Assertions
 * are intentionally loose: routing providers are best-effort, so the
 * tests check directional sanity (a route came back, distance moved the
 * expected way) rather than exact figures.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getRouterClient, setRouterClient } from '../../../RouterClient';
import type { RouteContext, RouteSnapshot } from '../../types';
import { applyMutation, applyMutations } from '../MutationHandlers';

const RUN = Boolean(process.env.RUN_INTEGRATION_TESTS);

/** A small synthetic loop around Erie, CO. */
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

describe.runIf(RUN)('MutationHandlers integration (real routing APIs)', () => {
  afterEach(() => {
    // Each test uses the process-wide singleton; clear its cache so
    // tests don't bleed into each other.
    getRouterClient().clearCache();
    setRouterClient(null);
  });

  it('reduce_climbing produces a real route via the provider chain', async () => {
    const route = erieRoute();
    const result = await applyMutation(route, erieContext(), {
      type: 'reduce_climbing',
      magnitude: 'moderate',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.geometry.length).toBeGreaterThan(10);
    expect(result.route.stats.distance_km).toBeGreaterThan(0);
    expect(result.metadata.provider_used).not.toBeNull();
  });

  it('extend_distance produces a longer route', async () => {
    const route = erieRoute();
    const result = await applyMutation(route, erieContext(), {
      type: 'extend_distance',
      delta_km: 5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Best-effort: the router should land somewhere north of the
    // original 12 km. Loose lower bound to absorb provider variance.
    expect(result.route.stats.distance_km).toBeGreaterThan(route.stats.distance_km);
  });

  it('anchor_through produces a route passing near the anchor', async () => {
    const route = erieRoute();
    const anchor: [number, number] = [-105.07, 40.065];
    const result = await applyMutation(route, erieContext(), {
      type: 'anchor_through',
      coordinate: anchor,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Some geometry point should land within ~1.5 km of the anchor.
    const near = result.route.geometry.some(
      ([lng, lat]) =>
        Math.hypot((lng - anchor[0]) * 85, (lat - anchor[1]) * 111) < 1.5,
    );
    expect(near).toBe(true);
  });

  it('compositional reduce_climbing + extend_distance produces a consistent result', async () => {
    const route = erieRoute();
    const result = await applyMutations(route, erieContext(), [
      { type: 'reduce_climbing', magnitude: 'small' },
      { type: 'extend_distance', delta_km: 3 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Final route reflects both mutations: it routed, and it is longer
    // than the original (the extend_distance step).
    expect(result.route.geometry.length).toBeGreaterThan(10);
    expect(result.route.stats.distance_km).toBeGreaterThan(route.stats.distance_km);
    expect(result.metadata.duration_ms).toBeGreaterThan(0);
  });
});
