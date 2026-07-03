/**
 * Cross-hook integration smoke test.
 *
 * Everything else in the suite mocks the Map and stubs the router; this drives
 * the real hooks through the shared Zustand store — generate → select → save →
 * load — with only the network/service layer mocked, to catch wiring
 * regressions between generation, the store, and persistence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIGeneration } from '../useAIGeneration';
import { useRoutePersistence } from '../useRoutePersistence';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/aiRouteGenerator.js', () => ({
  generateAIRoutes: vi.fn(),
}));
vi.mock('../elevationEnrichment', () => ({
  enrichRouteElevation: vi.fn(async (snap) => snap),
}));
vi.mock('../../../utils/routesService', () => ({
  saveRoute: vi.fn(),
  getRoute: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
  deleteRoute: vi.fn().mockResolvedValue({ success: true }),
  setRouteVisibility: vi.fn().mockResolvedValue({ visibility: 'public' }),
  saveDraft: vi.fn().mockResolvedValue({ id: 'draft-1' }),
  getDraft: vi.fn().mockResolvedValue(null),
  deleteDraft: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../utils/routeExport', () => ({ exportAndDownloadRoute: vi.fn() }));
vi.mock('../../../utils/gpxParser.js', () => ({ parseGpxFile: vi.fn() }));
vi.mock('../../../utils/garminService', () => ({ garminService: {} }));
vi.mock('../../../utils/wahooService', () => ({ wahooService: {} }));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { generateAIRoutes } from '../../../utils/aiRouteGenerator.js';
import * as routesService from '../../../utils/routesService';

const mockGenerate = generateAIRoutes as unknown as ReturnType<typeof vi.fn>;

function rb1Route() {
  return {
    name: 'AI Route',
    distance: 42,
    elevationGain: 500,
    elevationLoss: 480,
    coordinates: [
      [-105.0, 40.0, 1500],
      [-105.05, 40.03, 1520],
      [-105.08, 40.05, 1540],
      [-105.04, 40.02, 1510],
      [-105.0, 40.0, 1500],
    ],
  };
}

describe('route-builder integration smoke: generate → save → load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('flows a generated route through the store into persistence and back', async () => {
    mockGenerate.mockResolvedValue([rb1Route()]);
    vi.mocked(routesService.saveRoute).mockResolvedValue({ id: 'route-smoke' } as any);

    const { result } = renderHook(() => ({
      gen: useAIGeneration(),
      persist: useRoutePersistence(),
    }));

    // 1. Generate + select → store populated with geometry + control points.
    await act(async () => {
      await result.current.gen.generate({
        goal: 'endurance',
        duration_minutes: 120,
        start_coord: [-105, 40],
      });
    });
    act(() => {
      result.current.gen.selectSuggestion(0);
    });

    const afterGen = useRouteBuilderStore.getState();
    expect(afterGen.routeGeometry?.coordinates?.length).toBeGreaterThan(1);
    expect(afterGen.waypoints.length).toBeGreaterThanOrEqual(2);
    afterGen.waypoints.forEach((wp: { position: number[] }) =>
      expect(wp.position).toHaveLength(2),
    );

    // 2. Save with a name + description → persisted with the generated geometry.
    await act(async () => {
      await result.current.persist.save('Sunrise Loop', 'Gravel out east');
    });
    const saveArg = vi.mocked(routesService.saveRoute).mock.calls[0][0] as Record<string, unknown>;
    expect(saveArg.name).toBe('Sunrise Loop');
    expect(saveArg.description).toBe('Gravel out east');
    expect(saveArg.generated_by).toBe('rb2');
    expect(result.current.persist.savedRouteId).toBe('route-smoke');

    // 3. Load a (different) saved route → store roundtrips name/description/geometry.
    vi.mocked(routesService.getRoute).mockResolvedValue({
      id: 'route-loaded',
      name: 'Loaded Ride',
      description: 'Saved earlier',
      geometry: { type: 'LineString', coordinates: [[-106, 41], [-106.1, 41.1]] },
      distance_km: 18,
      elevation_gain_m: 120,
      estimated_duration_minutes: 45,
      waypoints: [],
    } as any);

    let ok = false;
    await act(async () => {
      ok = await result.current.persist.loadRoute('route-loaded');
    });
    expect(ok).toBe(true);

    const afterLoad = useRouteBuilderStore.getState();
    expect(afterLoad.routeName).toBe('Loaded Ride');
    expect(afterLoad.routeDescription).toBe('Saved earlier');
    expect(afterLoad.routeStats?.distance_km).toBe(18);
    expect(result.current.persist.savedRouteId).toBe('route-loaded');
  });
});
