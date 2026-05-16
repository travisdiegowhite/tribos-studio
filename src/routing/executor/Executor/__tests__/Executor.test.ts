/**
 * Tests for the Executor facade.
 *
 * Covers:
 * - The three passthrough methods (`applyMutation`, `applyMutations`,
 *   `applyManualAction`) delegate correctly to their underlying modules.
 * - Singleton accessor (`getExecutor`, `setExecutor`).
 *
 * `generate()` has its own dedicated test file (`generate.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { setRouterClient } from '../../../RouterClient';
import type {
  ManualActionPayload,
  Mutation,
  RouteSnapshot,
} from '../../types';
import { Executor, getExecutor, setExecutor } from '../Executor';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  makeStubRouterClient,
} from './helpers';

describe('Executor (facade)', () => {
  afterEach(() => {
    setRouterClient(null);
    setExecutor(null);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Passthrough: applyMutation
  // -------------------------------------------------------------------------

  describe('applyMutation', () => {
    it('delegates to MutationHandlers.applyMutation and returns its result', async () => {
      const expectedRoute = makeRoute({ distance_km: 18 });
      setRouterClient(makeStubRouterClient((providers) => {
        providers.stadia.succeedWith(expectedRoute);
      }));

      const executor = new Executor();
      const result = await executor.applyMutation(
        makeRoute(),
        makeContext(),
        { type: 'reduce_climbing', magnitude: 'moderate' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBe(18);
      expect(result.metadata.provider_used).toBe('stadia');
    });

    it('passes through RouterClient failures untouched', async () => {
      setRouterClient(makeFakeRouterClient({
        ok: false,
        reason: { kind: 'waypoint_unreachable', waypoint_index: 1 },
      }));

      const executor = new Executor();
      const mutation: Mutation = { type: 'anchor_through', coordinate: [-105.07, 40.06] };
      const result = await executor.applyMutation(makeRoute(), makeContext(), mutation);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('waypoint_unreachable');
    });
  });

  // -------------------------------------------------------------------------
  // Passthrough: applyMutations
  // -------------------------------------------------------------------------

  describe('applyMutations', () => {
    it('threads results through sequentially and returns the final route', async () => {
      const finalRoute = makeRoute({ distance_km: 22 });
      setRouterClient(makeStubRouterClient((providers) => {
        providers.stadia.succeedWithSequence([
          makeRoute({ distance_km: 18 }),
          finalRoute,
        ]);
      }));

      const executor = new Executor();
      const result = await executor.applyMutations(makeRoute(), makeContext(), [
        { type: 'extend_distance', delta_km: 6 },
        { type: 'extend_distance', delta_km: 4 },
      ]);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBe(22);
    });

    it('returns the failure shape from MutationHandlers on rollback', async () => {
      setRouterClient(makeFakeRouterClient({
        ok: false,
        reason: { kind: 'router_unavailable', providers_tried: ['stadia'] },
      }));

      const executor = new Executor();
      const original = makeRoute({ distance_km: 9 });
      const result = await executor.applyMutations(original, makeContext(), [
        { type: 'extend_distance', delta_km: 5 },
      ]);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('router_unavailable');
      expect(result.partial).toBe(original);
    });

    it('returns success with empty metadata for an empty mutation array', async () => {
      const executor = new Executor();
      const original = makeRoute();
      const result = await executor.applyMutations(original, makeContext(), []);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route).toBe(original);
    });
  });

  // -------------------------------------------------------------------------
  // Passthrough: applyManualAction
  // -------------------------------------------------------------------------

  describe('applyManualAction', () => {
    it('delegates to ManualHandlers and returns the connected route', async () => {
      const newRoute = makeRoute({ distance_km: 15 });
      setRouterClient(makeStubRouterClient((providers) => {
        providers.stadia.succeedWith(newRoute);
      }));

      const route: RouteSnapshot = makeRoute();
      const payload: ManualActionPayload = {
        action: 'add_waypoint',
        coord: [-105.04, 40.07],
      };

      const executor = new Executor();
      const result = await executor.applyManualAction(route, makeContext(), 'add_waypoint', payload);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.stats.distance_km).toBe(15);
    });

    it('clear_route returns an empty route without calling the router', async () => {
      const fake = makeFakeRouterClient({
        ok: true,
        route: makeRoute(),
        metadata: { provider_used: 'stadia', duration_ms: 0, cache_hit: false, attempts_tried: 0 },
      });
      setRouterClient(fake);

      const executor = new Executor();
      const result = await executor.applyManualAction(
        makeRoute(),
        makeContext(),
        'clear_route',
        { action: 'clear_route' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.geometry).toEqual([]);
      expect(result.route.waypoints).toEqual([]);
      // clear_route is the only handler that doesn't go through the router.
      expect((fake as unknown as { connect: ReturnType<typeof vi.fn> }).connect).not.toHaveBeenCalled();
    });

    it('returns ExecutorFailure when action and payload discriminators disagree', async () => {
      const executor = new Executor();
      const result = await executor.applyManualAction(
        makeRoute(),
        makeContext(),
        'drag_waypoint',
        { action: 'add_waypoint', coord: [-105.04, 40.07] } as ManualActionPayload,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
    });
  });
});

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

describe('getExecutor / setExecutor', () => {
  beforeEach(() => {
    setExecutor(null);
  });
  afterEach(() => {
    setExecutor(null);
  });

  it('returns the same instance on subsequent calls', () => {
    const a = getExecutor();
    const b = getExecutor();
    expect(a).toBe(b);
  });

  it('setExecutor injects a custom instance', () => {
    const custom = new Executor();
    setExecutor(custom);
    expect(getExecutor()).toBe(custom);
  });

  it('setExecutor(null) resets so the next call builds a fresh instance', () => {
    const first = getExecutor();
    setExecutor(null);
    const second = getExecutor();
    expect(second).not.toBe(first);
    expect(second).toBeInstanceOf(Executor);
  });
});
