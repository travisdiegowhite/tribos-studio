import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapInteraction } from '../useMapInteraction';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/smartCyclingRouter', () => ({
  getSmartCyclingRoute: vi.fn(),
}));

vi.mock('../../../utils/elevation', () => ({
  getElevationData: vi.fn(),
  calculateElevationStats: vi.fn(),
}));

import { getSmartCyclingRoute } from '../../../utils/smartCyclingRouter';
import {
  getElevationData,
  calculateElevationStats,
} from '../../../utils/elevation';

const mockRoute = getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>;
const mockElev = getElevationData as unknown as ReturnType<typeof vi.fn>;
const mockStats = calculateElevationStats as unknown as ReturnType<typeof vi.fn>;

function seedRoute() {
  const store = useRouteBuilderStore.getState();
  store.resetAll();
  store.setRouteGeometry({
    type: 'LineString',
    coordinates: [
      [-105, 40],
      [-105.1, 40.1],
    ],
  });
  store.setRouteStats({ distance_km: 25, elevation_gain_m: 100, duration_s: 1800 });
  store.setWaypoints([
    { id: 'wp-0', position: [-105, 40], type: 'start', name: '' },
    { id: 'wp-1', position: [-105.1, 40.1], type: 'end', name: '' },
  ]);
}

function happyRouteResponse() {
  return {
    coordinates: [
      [-105, 40],
      [-105.05, 40.05],
      [-105.1, 40.1],
    ],
    distance_m: 12000,
    duration_s: 1500,
    source: 'smart_test',
  };
}

describe('useMapInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
    mockElev.mockResolvedValue(null); // skip elevation backfill by default
  });

  it('has expected initial state', () => {
    const { result } = renderHook(() => useMapInteraction());
    expect(result.current.isApplying).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.viewport).toBeTruthy();
  });

  it('handleMapClick adds a waypoint and re-snaps via v1', async () => {
    seedRoute();
    mockRoute.mockResolvedValue(happyRouteResponse());
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      const r = await result.current.handleMapClick([-105.2, 40.2]);
      expect(r.ok).toBe(true);
    });

    expect(mockRoute).toHaveBeenCalledTimes(1);
    const waypoints = useRouteBuilderStore.getState().waypoints;
    expect(waypoints.length).toBe(3);
    expect(useRouteBuilderStore.getState().routeStats?.distance_km).toBeCloseTo(12, 0);
  });

  it('handleWaypointDrag updates a waypoint position', async () => {
    seedRoute();
    mockRoute.mockResolvedValue(happyRouteResponse());
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      const r = await result.current.handleWaypointDrag(0, [-104.9, 39.9]);
      expect(r.ok).toBe(true);
    });

    const wps = useRouteBuilderStore.getState().waypoints as Array<{ position: [number, number] }>;
    expect(wps[0].position).toEqual([-104.9, 39.9]);
  });

  it('handleRemoveWaypoint removes a waypoint and re-snaps', async () => {
    seedRoute();
    useRouteBuilderStore.getState().setWaypoints([
      { id: 'wp-0', position: [-105, 40], type: 'start', name: '' },
      { id: 'wp-1', position: [-105.05, 40.05], type: 'waypoint', name: '' },
      { id: 'wp-2', position: [-105.1, 40.1], type: 'end', name: '' },
    ]);
    mockRoute.mockResolvedValue(happyRouteResponse());
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      const r = await result.current.handleRemoveWaypoint(1);
      expect(r.ok).toBe(true);
    });

    const wps = useRouteBuilderStore.getState().waypoints;
    expect(wps.length).toBe(2);
  });

  it('handleReorderWaypoints moves a waypoint and re-derives start/end', async () => {
    useRouteBuilderStore.getState().setWaypoints([
      { id: 'wp-0', position: [-105, 40], type: 'start', name: '' },
      { id: 'wp-1', position: [-105.05, 40.05], type: 'waypoint', name: '' },
      { id: 'wp-2', position: [-105.1, 40.1], type: 'end', name: '' },
    ]);
    mockRoute.mockResolvedValue(happyRouteResponse());
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      const r = await result.current.handleReorderWaypoints(2, 0);
      expect(r.ok).toBe(true);
    });

    const wps = useRouteBuilderStore.getState().waypoints as Array<{ id: string; type: string }>;
    expect(wps.map((w) => w.id)).toEqual(['wp-2', 'wp-0', 'wp-1']);
    expect(wps[0].type).toBe('start');
    expect(wps[2].type).toBe('end');
  });

  it('handleReorderWaypoints is a no-op for an unchanged index', async () => {
    seedRoute();
    const { result } = renderHook(() => useMapInteraction());
    await act(async () => {
      const r = await result.current.handleReorderWaypoints(1, 1);
      expect(r.ok).toBe(true);
    });
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it('handleReverseRoute reverses the waypoint order', async () => {
    seedRoute();
    mockRoute.mockResolvedValue(happyRouteResponse());
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      await result.current.handleReverseRoute();
    });

    const wps = useRouteBuilderStore.getState().waypoints as Array<{ id: string; type: string }>;
    expect(wps[0].id).toBe('wp-1');
    expect(wps[0].type).toBe('start');
    expect(wps[wps.length - 1].id).toBe('wp-0');
    expect(wps[wps.length - 1].type).toBe('end');
  });

  it('handleClearRoute wipes the store geometry', async () => {
    seedRoute();
    const { result } = renderHook(() => useMapInteraction());
    await act(async () => {
      await result.current.handleClearRoute();
    });
    expect(useRouteBuilderStore.getState().routeGeometry).toBeNull();
    expect(useRouteBuilderStore.getState().waypoints).toEqual([]);
  });

  it('reports routing failure when v1 returns no route', async () => {
    seedRoute();
    mockRoute.mockResolvedValue(null);
    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      const r = await result.current.handleWaypointDrag(0, [-104.9, 39.9]);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('routing_failed');
    });
  });

  it('backfills elevation when v1 returns elevation data', async () => {
    seedRoute();
    mockRoute.mockResolvedValue(happyRouteResponse());
    mockElev.mockResolvedValue([
      { distance: 0, elevation: 100 },
      { distance: 6, elevation: 200 },
      { distance: 12, elevation: 150 },
    ]);
    mockStats.mockReturnValue({ gain: 100, loss: 50, min: 100, max: 200 });

    const { result } = renderHook(() => useMapInteraction());

    await act(async () => {
      await result.current.handleMapClick([-105.2, 40.2]);
    });

    expect(useRouteBuilderStore.getState().routeStats?.elevation_gain_m).toBe(100);
  });
});
