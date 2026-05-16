import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIGeneration } from '../useAIGeneration';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import type { ExecutorResult } from '../../../routing/executor';

vi.mock('../../../features/route-builder-v2/adapters', async () => ({
  generateRoute: vi.fn(),
}));

import * as adapter from '../../../features/route-builder-v2/adapters';

function makeSuccess(distance = 30): ExecutorResult {
  return {
    ok: true,
    route: {
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
        elevation_gain_m: 200,
        elevation_loss_m: 200,
        duration_s: 3600,
      },
    },
    metadata: {
      provider_used: 'stadia',
      duration_ms: 50,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

describe('useAIGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('has expected initial state', () => {
    const { result } = renderHook(() => useAIGeneration());
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.suggestions).toEqual([]);
  });

  it('sets suggestions and clears error on success', async () => {
    vi.mocked(adapter.generateRoute).mockResolvedValue(makeSuccess(25));
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });

    expect(result.current.lastError).toBeNull();
    expect(result.current.suggestions.length).toBe(1);
    expect(result.current.suggestions[0].stats.distance_km).toBe(25);
    expect(result.current.isGenerating).toBe(false);
  });

  it('handles count=3 (alternatives)', async () => {
    vi.mocked(adapter.generateRoute).mockResolvedValue([
      makeSuccess(20),
      makeSuccess(30),
      makeSuccess(40),
    ] as any);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({ goal: 'endurance' }, 3);
    });

    expect(result.current.suggestions.length).toBe(3);
    expect(result.current.suggestions.map((s) => s.stats.distance_km)).toEqual([20, 30, 40]);
  });

  it('sets lastError when executor returns failure', async () => {
    vi.mocked(adapter.generateRoute).mockResolvedValue({
      ok: false,
      reason: { kind: 'router_unavailable', providers_tried: ['stadia', 'mapbox'] },
    });
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({});
    });

    expect(result.current.lastError).toContain('No routing provider');
    expect(result.current.suggestions).toEqual([]);
  });

  it('sets lastError when adapter throws', async () => {
    vi.mocked(adapter.generateRoute).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({});
    });

    expect(result.current.lastError).toBe('boom');
    expect(result.current.isGenerating).toBe(false);
  });

  it('clearSuggestions empties the list and clears error', async () => {
    vi.mocked(adapter.generateRoute).mockResolvedValue(makeSuccess());
    const { result } = renderHook(() => useAIGeneration());
    await act(async () => {
      await result.current.generate({});
    });
    expect(result.current.suggestions.length).toBe(1);

    act(() => {
      result.current.clearSuggestions();
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.lastError).toBeNull();
  });

  it('selectSuggestion writes geometry to the store', async () => {
    vi.mocked(adapter.generateRoute).mockResolvedValue(makeSuccess(15));
    const { result } = renderHook(() => useAIGeneration());
    await act(async () => {
      await result.current.generate({});
    });

    act(() => {
      const chosen = result.current.selectSuggestion(0);
      expect(chosen).not.toBeNull();
    });

    const storeState = useRouteBuilderStore.getState();
    expect(storeState.routeGeometry?.coordinates.length).toBe(2);
    expect(storeState.routeStats.distance_km).toBe(15);
    expect(storeState.builderMode).toBe('editing');
  });
});
