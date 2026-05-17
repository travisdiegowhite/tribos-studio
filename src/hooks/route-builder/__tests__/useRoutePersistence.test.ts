import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoutePersistence } from '../useRoutePersistence';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/routesService', () => ({
  saveRoute: vi.fn(),
  getRoute: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../utils/routeExport', () => ({
  exportAndDownloadRoute: vi.fn(),
}));

import * as routesService from '../../../utils/routesService';

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
  s.setRouteStats({ distance_km: 20, elevation_gain_m: 150, duration_s: 1800 });
  s.setRouteName('My Test Ride');
}

describe('useRoutePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('has expected initial state', () => {
    const { result } = renderHook(() => useRoutePersistence());
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.savedRouteId).toBeNull();
  });

  it('save returns null and sets error when no route exists', async () => {
    const { result } = renderHook(() => useRoutePersistence());
    let res: any;
    await act(async () => {
      res = await result.current.save();
    });
    expect(res).toBeNull();
    expect(result.current.lastError).toBe('No route to save');
  });

  it('save calls routesService.saveRoute and records savedRouteId', async () => {
    seedRoute();
    vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'route-123' } as any);
    const { result } = renderHook(() => useRoutePersistence());
    let res: any;
    await act(async () => {
      res = await result.current.save();
    });
    expect(res).toEqual({ id: 'route-123', name: 'My Test Ride' });
    expect(result.current.savedRouteId).toBe('route-123');
    const call = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
    expect(call.distance_km).toBe(20);
    expect(call.elevation_gain_m).toBe(150);
    expect(call.estimated_duration_minutes).toBe(30);
    expect(call.generated_by).toBe('rb2');
  });

  it('save handles thrown errors by recording lastError', async () => {
    seedRoute();
    vi.mocked(routesService.saveRoute).mockRejectedValue(new Error('db down'));
    const { result } = renderHook(() => useRoutePersistence());
    let res: any;
    await act(async () => {
      res = await result.current.save();
    });
    expect(res).toBeNull();
    expect(result.current.lastError).toBe('db down');
  });

  it('loadRoute populates store and tracks savedRouteId', async () => {
    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'route-xyz',
      name: 'Loaded',
      geometry: { type: 'LineString', coordinates: [[-105, 40]] },
      distance_km: 12,
      elevation_gain_m: 80,
      estimated_duration_minutes: 30,
      waypoints: [],
    } as any);
    const { result } = renderHook(() => useRoutePersistence());
    let ok = false;
    await act(async () => {
      ok = await result.current.loadRoute('route-xyz');
    });
    expect(ok).toBe(true);
    expect(result.current.savedRouteId).toBe('route-xyz');
    expect(useRouteBuilderStore.getState().routeName).toBe('Loaded');
  });

  it('loadRoute returns false and sets error when route is missing', async () => {
    vi.mocked(routesService.getRoute).mockResolvedValue(null as any);
    const { result } = renderHook(() => useRoutePersistence());
    let ok = true;
    await act(async () => {
      ok = await result.current.loadRoute('missing');
    });
    expect(ok).toBe(false);
    expect(result.current.lastError).toBe('Route not found');
  });

  it('exportRoute is a no-op launcher that does not throw', () => {
    const { result } = renderHook(() => useRoutePersistence());
    expect(() => result.current.exportRoute('gpx')).not.toThrow();
  });
});
