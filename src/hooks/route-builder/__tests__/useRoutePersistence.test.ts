import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoutePersistence } from '../useRoutePersistence';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/routesService', () => ({
  saveRoute: vi.fn(),
  getRoute: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
  deleteRoute: vi.fn().mockResolvedValue({ success: true }),
  setRouteVisibility: vi.fn().mockResolvedValue({ visibility: 'public' }),
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

  it('save includes the description and load restores it to the store', async () => {
    seedRoute();
    useRouteBuilderStore.getState().setRouteDescription('Hill repeats out east');
    vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'route-d' } as any);
    const { result } = renderHook(() => useRoutePersistence());
    await act(async () => {
      await result.current.save();
    });
    const call = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
    expect(call.description).toBe('Hill repeats out east');

    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'route-d',
      name: 'Loaded',
      description: 'Loaded desc',
      geometry: { type: 'LineString', coordinates: [[-105, 40]] },
      distance_km: 10,
      elevation_gain_m: 50,
      estimated_duration_minutes: 20,
      waypoints: [],
    } as any);
    await act(async () => {
      await result.current.loadRoute('route-d');
    });
    expect(useRouteBuilderStore.getState().routeDescription).toBe('Loaded desc');
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

  it('shareRoute returns not_saved when the route has no id yet', async () => {
    const { result } = renderHook(() => useRoutePersistence());
    let res: any;
    await act(async () => {
      res = await result.current.shareRoute();
    });
    expect(res).toEqual({ ok: false, reason: 'not_saved' });
  });

  it('shareRoute copies a /routes/:id link once the route is saved', async () => {
    seedRoute();
    vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'route-abc' } as any);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { result } = renderHook(() => useRoutePersistence());
    await act(async () => {
      await result.current.save();
    });
    let res: any;
    await act(async () => {
      res = await result.current.shareRoute();
    });
    expect(res.ok).toBe(true);
    expect(res.url).toMatch(/\/routes\/route-abc$/);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/routes\/route-abc$/));
  });
});
