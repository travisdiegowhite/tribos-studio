import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapInteraction, VIEWPORT_DEBOUNCE_MS } from '../useMapInteraction';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import type { ExecutorResult, RouteSnapshot } from '../../../routing/executor';

vi.mock('../../../features/route-builder-v2/adapters', async () => ({
  applyManualAction: vi.fn(),
}));

import * as adapter from '../../../features/route-builder-v2/adapters';

function makeRoute(distance = 25): RouteSnapshot {
  return {
    geometry: [
      [-105, 40],
      [-105.1, 40.1],
    ],
    waypoints: [
      { coordinate: [-105, 40] },
      { coordinate: [-105.1, 40.1] },
    ],
    stats: {
      distance_km: distance,
      elevation_gain_m: 100,
      elevation_loss_m: 100,
      duration_s: 1800,
    },
  };
}

function makeSuccess(distance = 25): ExecutorResult {
  return {
    ok: true,
    route: makeRoute(distance),
    metadata: {
      provider_used: 'stadia',
      duration_ms: 1,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

function seedRoute() {
  const s = useRouteBuilderStore.getState();
  s.resetAll();
  s.setRouteGeometry({
    type: 'LineString',
    coordinates: [
      [-105, 40],
      [-105.1, 40.1],
    ],
  });
  s.setRouteStats({ distance_km: 25, elevation_gain_m: 100, duration_s: 1800 });
  s.setWaypoints([
    { id: 'wp-0', position: [-105, 40], type: 'start', name: '' },
    { id: 'wp-1', position: [-105.1, 40.1], type: 'end', name: '' },
  ]);
}

describe('useMapInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('exports VIEWPORT_DEBOUNCE_MS = 500', () => {
    expect(VIEWPORT_DEBOUNCE_MS).toBe(500);
  });

  it('has expected initial state mirroring the store viewport', () => {
    const { result } = renderHook(() => useMapInteraction());
    expect(result.current.isApplying).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.viewport.latitude).toBeCloseTo(37.7749);
  });

  it('setViewport updates locally and debounces store write', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapInteraction());
    act(() => {
      result.current.setViewport({ longitude: -105, latitude: 40, zoom: 11 });
    });
    expect(result.current.viewport.longitude).toBe(-105);
    // store not yet updated
    expect(useRouteBuilderStore.getState().viewport.longitude).not.toBe(-105);
    await act(async () => {
      vi.advanceTimersByTime(VIEWPORT_DEBOUNCE_MS + 10);
    });
    expect(useRouteBuilderStore.getState().viewport.longitude).toBe(-105);
    vi.useRealTimers();
  });

  it('handleWaypointDrag forwards drag action to adapter and writes result', async () => {
    seedRoute();
    vi.mocked(adapter.applyManualAction).mockResolvedValue(makeSuccess(28));
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      await result.current.handleWaypointDrag(0, [-105.05, 40.05]);
    });

    expect(adapter.applyManualAction).toHaveBeenCalledTimes(1);
    const [, action, payload] = vi.mocked(adapter.applyManualAction).mock.calls[0];
    expect(action).toBe('drag_waypoint');
    expect(payload).toMatchObject({
      waypoint_index: 0,
      new_coord: [-105.05, 40.05],
    });
    expect(useRouteBuilderStore.getState().routeStats.distance_km).toBe(28);
    expect(result.current.lastError).toBeNull();
  });

  it('reports failure when adapter returns ok=false', async () => {
    seedRoute();
    vi.mocked(adapter.applyManualAction).mockResolvedValue({
      ok: false,
      reason: { kind: 'waypoint_unreachable', waypoint_index: 0 },
    });
    const { result } = renderHook(() => useMapInteraction());
    await act(async () => {
      await result.current.handleWaypointDrag(0, [-105.05, 40.05]);
    });
    expect(result.current.lastError).toContain('waypoint_unreachable');
  });

  it('handleMapClick when no route exists allows add_waypoint to proceed', async () => {
    vi.mocked(adapter.applyManualAction).mockResolvedValue(makeSuccess(5));
    const { result } = renderHook(() => useMapInteraction());
    await act(async () => {
      await result.current.handleMapClick([-105, 40]);
    });
    expect(adapter.applyManualAction).toHaveBeenCalled();
  });

  it('handleWaypointDrag fails fast when no route exists', async () => {
    const { result } = renderHook(() => useMapInteraction());
    let res: any;
    await act(async () => {
      res = await result.current.handleWaypointDrag(0, [-105, 40]);
    });
    expect(res).toBeNull();
    expect(adapter.applyManualAction).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe('No current route');
  });
});
