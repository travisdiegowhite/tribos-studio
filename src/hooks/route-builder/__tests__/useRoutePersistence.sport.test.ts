import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoutePersistence } from '../useRoutePersistence';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/routesService', () => ({
  saveRoute: vi.fn(),
  getRoute: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
  deleteRoute: vi.fn(),
  setRouteVisibility: vi.fn(),
  saveDraft: vi.fn(),
  getDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));
vi.mock('../../../utils/routeExport', () => ({ exportAndDownloadRoute: vi.fn() }));

import * as routesService from '../../../utils/routesService';

const GEOMETRY = { type: 'LineString', coordinates: [[-105, 40], [-105.01, 40.01]] };

describe('useRoutePersistence sport (multisport phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('saves a run with its sport and run profile', async () => {
    const s = useRouteBuilderStore.getState();
    s.setSport('running');
    s.setRouteProfile('trail_run');
    s.setRouteGeometry(GEOMETRY);
    s.setRouteStats({ distance_km: 8, elevation_gain_m: 120, duration_s: 3000 });
    vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'r-run' } as never);

    const { result } = renderHook(() => useRoutePersistence());
    await act(async () => {
      await result.current.save('Trail loop');
    });
    const sent = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
    expect(sent.sport).toBe('running');
    expect(sent.surface_type).toBe('trail_run');
  });

  it('reopens a saved run as a run', async () => {
    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'r-run',
      name: 'Trail loop',
      geometry: GEOMETRY,
      distance_km: 8,
      surface_type: 'trail_run',
      sport: 'running',
    } as never);
    const { result } = renderHook(() => useRoutePersistence());
    await act(async () => {
      await result.current.loadRoute('r-run');
    });
    const s = useRouteBuilderStore.getState();
    expect(s.sport).toBe('running');
    expect(s.routeProfile).toBe('trail_run');
    expect(s.routeGeometry).toEqual(GEOMETRY);
  });

  it('reopens a ride as a ride after building a run', async () => {
    useRouteBuilderStore.getState().setSport('running');
    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'r-ride',
      name: 'Gravel loop',
      geometry: GEOMETRY,
      surface_type: 'gravel',
      sport: 'cycling',
    } as never);
    const { result } = renderHook(() => useRoutePersistence());
    await act(async () => {
      await result.current.loadRoute('r-ride');
    });
    expect(useRouteBuilderStore.getState().sport).toBe('cycling');
    expect(useRouteBuilderStore.getState().routeProfile).toBe('gravel');
  });

  it('lists saved routes with their sport', async () => {
    vi.mocked(routesService.listRoutes).mockResolvedValue([
      { id: 'a', surface_type: 'road', sport: 'cycling' },
      { id: 'b', surface_type: 'run' },
    ] as never);
    const { result } = renderHook(() => useRoutePersistence());
    let rows: Array<{ id: string; sport?: string }> = [];
    await act(async () => {
      rows = await result.current.listSavedRoutes();
    });
    expect(rows.map((r) => r.sport)).toEqual(['cycling', 'running']);
  });
});
