import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoutePersistence } from '../useRoutePersistence';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/routesService', () => {
  const getRoute = vi.fn();
  return {
  saveRoute: vi.fn(),
  getRoute,
  // The hook loads through getRouteForViewer; route it to the getRoute mock.
  getRouteForViewer: (id: string) => getRoute(id),
  getPublicRoute: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
  deleteRoute: vi.fn().mockResolvedValue({ success: true }),
  setRouteVisibility: vi.fn().mockResolvedValue({ visibility: 'public' }),
  saveDraft: vi.fn().mockResolvedValue({ id: 'draft-1' }),
  getDraft: vi.fn().mockResolvedValue(null),
  deleteDraft: vi.fn().mockResolvedValue(true),
};
});

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

  it('importGpx keeps elevation and seeds resampled control points', async () => {
    // 11 spread-out points climbing 0→100m over ~11km of longitude change.
    const trkpts = Array.from({ length: 11 }, (_, i) => {
      const lon = (-105 + i * 0.01).toFixed(5);
      return `<trkpt lat="40.00000" lon="${lon}"><ele>${i * 10}</ele></trkpt>`;
    }).join('');
    const gpx =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">' +
      `<trk><name>Test Import</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
    const file = new File([gpx], 'test-import.gpx', { type: 'application/gpx+xml' });

    const { result } = renderHook(() => useRoutePersistence());
    let coords: unknown = null;
    await act(async () => {
      coords = await result.current.importGpx(file);
    });
    expect(Array.isArray(coords)).toBe(true);

    const s = useRouteBuilderStore.getState();
    const geomCoords = (s.routeGeometry as { coordinates: number[][] }).coordinates;
    // Elevation carried through as a GeoJSON third element.
    expect(geomCoords[0]).toHaveLength(3);
    expect(geomCoords[10][2]).toBe(100);
    // Control points resampled along the track, not just start/end.
    expect(s.waypoints.length).toBeGreaterThan(2);
    const first = s.waypoints[0] as { type: string; position: number[] };
    const last = s.waypoints[s.waypoints.length - 1] as { type: string; position: number[] };
    expect(first.type).toBe('start');
    expect(last.type).toBe('end');
    // Waypoint positions honour the 2-tuple [lng, lat] contract.
    expect(first.position).toHaveLength(2);
  });

  it('shareRoute returns not_saved when the route has no id yet', async () => {
    const { result } = renderHook(() => useRoutePersistence());
    let res: any;
    await act(async () => {
      res = await result.current.shareRoute();
    });
    expect(res).toEqual({ ok: false, reason: 'not_saved' });
  });

  it('shareRoute makes the route public and copies the public /r/:id link', async () => {
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
    expect(res.url).toMatch(/\/r\/route-abc$/);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/r\/route-abc$/));
    expect(vi.mocked(routesService.setRouteVisibility)).toHaveBeenCalledWith(
      'route-abc',
      'public',
    );
  });

  describe('route origin → generated_by', () => {
    it("saves a plain RB2 route as 'rb2'", async () => {
      seedRoute();
      vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'r1' } as any);
      const { result } = renderHook(() => useRoutePersistence());
      await act(async () => {
        await result.current.save();
      });
      const call = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
      expect(call.generated_by).toBe('rb2');
    });

    it("saves an AI-originated route as 'ai'", async () => {
      seedRoute();
      useRouteBuilderStore.getState().setRouteOrigin('ai');
      vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'r2' } as any);
      const { result } = renderHook(() => useRoutePersistence());
      await act(async () => {
        await result.current.save();
      });
      const call = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
      expect(call.generated_by).toBe('ai');
    });

    it('loading a route restores its origin, and clearing resets it', async () => {
      vi.mocked(routesService.getRoute).mockResolvedValue({
        id: 'r3',
        name: 'Smart loop',
        geometry: { type: 'LineString', coordinates: [[-105, 40], [-105.1, 40.1]] },
        generated_by: 'ai',
        waypoints: [],
      } as any);
      const { result } = renderHook(() => useRoutePersistence());
      await act(async () => {
        await result.current.loadRoute('r3');
      });
      expect(useRouteBuilderStore.getState().routeOrigin).toBe('ai');
      useRouteBuilderStore.getState().clearRoute();
      expect(useRouteBuilderStore.getState().routeOrigin).toBeNull();
    });

    it('a history-style setRoute (no origin) keeps the origin', () => {
      const s = useRouteBuilderStore.getState();
      s.setRouteOrigin('ai');
      s.setRoute({ geometry: { type: 'LineString', coordinates: [[-105, 40]] }, source: 'history' });
      expect(useRouteBuilderStore.getState().routeOrigin).toBe('ai');
    });
  });

  it('loads a shared route a guest opened as an unsaved copy', async () => {
    // getRouteForViewer returns the public read with is_owner:false for guests.
    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'shared-1',
      name: 'Shared loop',
      geometry: { type: 'LineString', coordinates: [[-105, 40], [-105.1, 40.1]] },
      is_owner: false,
    } as any);
    const { result } = renderHook(() => useRoutePersistence());
    let ok = false;
    await act(async () => {
      ok = await result.current.loadRoute('shared-1');
    });
    expect(ok).toBe(true);
    expect(result.current.savedRouteId).toBeNull();
    expect(useRouteBuilderStore.getState().routeName).toBe('Shared loop');
  });

  it('imports a TCX course through the same path as GPX', async () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Courses><Course><Name>River Path</Name><Track>
      <Trackpoint><Position><LatitudeDegrees>40.01</LatitudeDegrees><LongitudeDegrees>-105.27</LongitudeDegrees></Position><AltitudeMeters>1600</AltitudeMeters><DistanceMeters>0</DistanceMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>40.02</LatitudeDegrees><LongitudeDegrees>-105.26</LongitudeDegrees></Position><AltitudeMeters>1610</AltitudeMeters><DistanceMeters>1400</DistanceMeters></Trackpoint>
    </Track></Course></Courses></TrainingCenterDatabase>`;
    const file = new File([tcx], 'river.tcx', { type: 'application/xml' });
    const { result } = renderHook(() => useRoutePersistence());
    let coords: unknown = null;
    await act(async () => {
      coords = await result.current.importRouteFile(file);
    });
    expect(coords).toEqual([
      [-105.27, 40.01],
      [-105.26, 40.02],
    ]);
    const state = useRouteBuilderStore.getState();
    expect(state.routeName).toBe('River Path');
    expect(state.routeStats.distance_km).toBeCloseTo(1.4, 3);
  });
});
