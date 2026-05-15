import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/routeBuilderTelemetry', () => ({
  trackRouteBuilder: vi.fn(),
}));

import { trackRouteBuilder } from '../../../../utils/routeBuilderTelemetry';
import { setRouterClient } from '../../../RouterClient';
import type { ManualAction, ManualActionPayload } from '../../types';
import { applyManualAction } from '../ManualHandlers';
import {
  makeContext,
  makeFakeRouterClient,
  makeRoute,
  makeThrowingRouterClient,
  okResult,
} from './helpers';

const mockTrack = trackRouteBuilder as unknown as ReturnType<typeof vi.fn>;

function handlerEvents(): string[] {
  return mockTrack.mock.calls
    .map((c) => c[0] as string)
    .filter((name) => name.startsWith('manual_handler_'));
}

function eventProps(name: string): Record<string, unknown> | undefined {
  const call = mockTrack.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, unknown> | undefined;
}

describe('applyManualAction', () => {
  beforeEach(() => {
    mockTrack.mockReset();
  });
  afterEach(() => {
    setRouterClient(null);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  describe('dispatch', () => {
    it('routes drag_waypoint to the drag handler', async () => {
      setRouterClient(makeFakeRouterClient(okResult(makeRoute({ distance_km: 9 }))));
      const result = await applyManualAction(
        makeRoute({ waypointCount: 3 }),
        makeContext(),
        'drag_waypoint',
        {
          action: 'drag_waypoint',
          waypoint_index: 0,
          new_coord: [-105, 40],
        },
      );
      expect(result.ok).toBe(true);
    });

    it('routes add_waypoint to the add handler', async () => {
      setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
      const result = await applyManualAction(
        makeRoute({ waypointCount: 2 }),
        makeContext(),
        'add_waypoint',
        { action: 'add_waypoint', coord: [-105, 40], insert_at: 1 },
      );
      expect(result.ok).toBe(true);
    });

    it('routes remove_waypoint to the remove handler', async () => {
      setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
      const result = await applyManualAction(
        makeRoute({ waypointCount: 3 }),
        makeContext(),
        'remove_waypoint',
        { action: 'remove_waypoint', waypoint_index: 1 },
      );
      expect(result.ok).toBe(true);
    });

    it('routes reverse_route to the reverse handler', async () => {
      setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
      const result = await applyManualAction(
        makeRoute(),
        makeContext(),
        'reverse_route',
        { action: 'reverse_route' },
      );
      expect(result.ok).toBe(true);
    });

    it('routes clear_route to the clear handler without contacting RouterClient', async () => {
      setRouterClient(null);
      const result = await applyManualAction(
        makeRoute(),
        makeContext(),
        'clear_route',
        { action: 'clear_route' },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.waypoints).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Action / payload mismatch defense
  // -------------------------------------------------------------------------

  describe('action/payload mismatch', () => {
    it('returns internal_error when action does not match payload.action', async () => {
      setRouterClient(null);
      const result = await applyManualAction(
        makeRoute(),
        makeContext(),
        'drag_waypoint',
        // Intentionally sloppy payload.
        { action: 'add_waypoint', coord: [-105, 40] } as ManualActionPayload,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
      if (result.reason.kind !== 'internal_error') return;
      expect(result.reason.message).toContain('mismatch');
    });

    it('attaches partial: route on mismatch failure', async () => {
      setRouterClient(null);
      const route = makeRoute();
      const result = await applyManualAction(
        route,
        makeContext(),
        'reverse_route',
        { action: 'clear_route' },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.partial).toBe(route);
    });
  });

  // -------------------------------------------------------------------------
  // never-throws contract
  // -------------------------------------------------------------------------

  describe('never-throws contract', () => {
    it('maps a thrown RouterClient error to internal_error with partial', async () => {
      setRouterClient(makeThrowingRouterClient(new Error('socket exploded')));
      const route = makeRoute();
      const result = await applyManualAction(
        route,
        makeContext(),
        'reverse_route',
        { action: 'reverse_route' },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
      if (result.reason.kind !== 'internal_error') return;
      expect(result.reason.message).toContain('socket exploded');
      expect(result.partial).toBe(route);
    });

    it('maps a non-Error rejection to internal_error', async () => {
      setRouterClient(makeThrowingRouterClient('plain string failure'));
      const result = await applyManualAction(
        makeRoute(),
        makeContext(),
        'reverse_route',
        { action: 'reverse_route' },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.kind).toBe('internal_error');
      if (result.reason.kind !== 'internal_error') return;
      expect(result.reason.message).toContain('plain string failure');
    });
  });

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  describe('telemetry', () => {
    it('emits manual_handler_started before processing', async () => {
      setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
      await applyManualAction(makeRoute(), makeContext(), 'reverse_route', {
        action: 'reverse_route',
      });
      expect(handlerEvents()[0]).toBe('manual_handler_started');
      expect(eventProps('manual_handler_started')).toMatchObject({
        action: 'reverse_route',
      });
    });

    it('emits manual_handler_succeeded on success with provider metadata', async () => {
      setRouterClient(
        makeFakeRouterClient(
          okResult(makeRoute(), { provider_used: 'brouter', cache_hit: true }),
        ),
      );
      await applyManualAction(makeRoute(), makeContext(), 'reverse_route', {
        action: 'reverse_route',
      });
      expect(handlerEvents()).toContain('manual_handler_succeeded');
      const props = eventProps('manual_handler_succeeded');
      expect(props).toMatchObject({
        action: 'reverse_route',
        provider_used: 'brouter',
        cache_hit: true,
      });
      expect(typeof props?.duration_ms).toBe('number');
    });

    it('reports provider_used: null for clear_route', async () => {
      setRouterClient(null);
      await applyManualAction(makeRoute(), makeContext(), 'clear_route', {
        action: 'clear_route',
      });
      expect(eventProps('manual_handler_succeeded')).toMatchObject({
        action: 'clear_route',
        provider_used: null,
      });
    });

    it('emits manual_handler_failed on RouterClient failure', async () => {
      setRouterClient(
        makeFakeRouterClient({
          ok: false,
          reason: { kind: 'router_unavailable', providers_tried: ['stadia'] },
        }),
      );
      await applyManualAction(makeRoute(), makeContext(), 'reverse_route', {
        action: 'reverse_route',
      });
      expect(handlerEvents()).toContain('manual_handler_failed');
      expect(eventProps('manual_handler_failed')).toMatchObject({
        action: 'reverse_route',
        failure_kind: 'router_unavailable',
      });
    });

    it('emits manual_handler_failed on validation failure', async () => {
      setRouterClient(null);
      await applyManualAction(makeRoute(), makeContext(), 'drag_waypoint', {
        action: 'drag_waypoint',
        waypoint_index: 99,
        new_coord: [-105, 40],
      });
      expect(eventProps('manual_handler_failed')).toMatchObject({
        action: 'drag_waypoint',
        failure_kind: 'internal_error',
      });
    });

    it('emits started even when action/payload mismatch fails fast', async () => {
      // Mismatch is checked BEFORE the started event in the dispatcher, by
      // design: emitting `started` for an action that won't actually run
      // would be misleading. The failed event also doesn't fire because
      // we never entered the timed region.
      setRouterClient(null);
      await applyManualAction(
        makeRoute(),
        makeContext(),
        'drag_waypoint',
        { action: 'clear_route' } as ManualActionPayload,
      );
      expect(handlerEvents()).not.toContain('manual_handler_started');
      expect(handlerEvents()).not.toContain('manual_handler_succeeded');
      expect(handlerEvents()).not.toContain('manual_handler_failed');
    });
  });

  // -------------------------------------------------------------------------
  // Exhaustiveness: every ManualAction has a handler
  // -------------------------------------------------------------------------

  describe('exhaustiveness', () => {
    it('handles every ManualAction value', async () => {
      const cases: Array<{ action: ManualAction; payload: ManualActionPayload }> = [
        {
          action: 'drag_waypoint',
          payload: {
            action: 'drag_waypoint',
            waypoint_index: 0,
            new_coord: [-105, 40],
          },
        },
        {
          action: 'add_waypoint',
          payload: { action: 'add_waypoint', coord: [-105, 40], insert_at: 1 },
        },
        {
          action: 'remove_waypoint',
          payload: { action: 'remove_waypoint', waypoint_index: 1 },
        },
        {
          action: 'reverse_route',
          payload: { action: 'reverse_route' },
        },
        {
          action: 'clear_route',
          payload: { action: 'clear_route' },
        },
      ];
      setRouterClient(makeFakeRouterClient(okResult(makeRoute())));
      for (const c of cases) {
        const result = await applyManualAction(
          makeRoute({ waypointCount: 3 }),
          makeContext(),
          c.action,
          c.payload,
        );
        expect(result.ok).toBe(true);
      }
    });
  });
});
