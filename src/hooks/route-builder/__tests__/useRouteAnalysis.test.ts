import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteAnalysis } from '../useRouteAnalysis';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/routePOIService', () => ({
  queryPOIsAlongRoute: vi.fn(),
}));

vi.mock('../../../utils/elevation', () => ({
  getElevationData: vi.fn(),
  calculateElevationStats: vi.fn(),
}));

import * as poiService from '../../../utils/routePOIService';
import { getElevationData } from '../../../utils/elevation';

const mockElev = getElevationData as unknown as ReturnType<typeof vi.fn>;

function seedRoute() {
  const s = useRouteBuilderStore.getState();
  s.resetAll();
  s.setRouteGeometry({
    type: 'LineString',
    coordinates: [
      [-105, 40],
      [-105.05, 40.05],
      [-105.1, 40.1],
    ],
  });
  s.setRouteStats({ distance_km: 12, elevation_gain_m: 200, duration_s: 1800 });
}

describe('useRouteAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
    mockElev.mockResolvedValue(null);
  });

  it('has expected initial state with no route', () => {
    const { result } = renderHook(() => useRouteAnalysis());
    expect(result.current.elevationProfile).toBeNull();
    expect(result.current.gradientData).toBeNull();
    expect(result.current.activeLayers).toEqual([]);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it('derives an elevation profile from the current route', async () => {
    seedRoute();
    mockElev.mockResolvedValue([
      { distance: 0, elevation: 100 },
      { distance: 6, elevation: 200 },
      { distance: 12, elevation: 150 },
    ]);
    const { result, rerender } = renderHook(() => useRouteAnalysis());
    // Wait out the fetch debounce (rapid-edit coalescing), then the async fetch.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    rerender();
    expect(result.current.elevationProfile).not.toBeNull();
    expect(result.current.elevationProfile!.length).toBe(3);
    expect(result.current.gradientData).not.toBeNull();
  });

  it('togglePOILayer fetches POIs and tracks active layers', async () => {
    seedRoute();
    vi.mocked(poiService.queryPOIsAlongRoute).mockResolvedValue([
      { id: 'p1' },
      { id: 'p2' },
    ] as any);
    const { result } = renderHook(() => useRouteAnalysis());
    await act(async () => {
      await result.current.togglePOILayer('coffee');
    });
    expect(result.current.activeLayers).toEqual(['coffee']);
    expect(result.current.poiResults.coffee?.features.length).toBe(2);
  });

  it('togglePOILayer toggles off when already active', async () => {
    seedRoute();
    vi.mocked(poiService.queryPOIsAlongRoute).mockResolvedValue([{ id: 'p1' }] as any);
    const { result } = renderHook(() => useRouteAnalysis());
    await act(async () => {
      await result.current.togglePOILayer('water');
    });
    expect(result.current.activeLayers).toContain('water');
    await act(async () => {
      await result.current.togglePOILayer('water');
    });
    expect(result.current.activeLayers).not.toContain('water');
    expect(result.current.poiResults.water).toBeNull();
  });

  it('records error when POI fetch throws', async () => {
    seedRoute();
    vi.mocked(poiService.queryPOIsAlongRoute).mockRejectedValue(new Error('upstream'));
    const { result } = renderHook(() => useRouteAnalysis());
    await act(async () => {
      await result.current.togglePOILayer('food');
    });
    expect(result.current.lastError).toBe('upstream');
    expect(result.current.activeLayers).not.toContain('food');
  });
});
