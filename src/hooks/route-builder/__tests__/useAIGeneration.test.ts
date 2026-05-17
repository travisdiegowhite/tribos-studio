import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIGeneration } from '../useAIGeneration';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/aiRouteGenerator.js', () => ({
  generateAIRoutes: vi.fn(),
}));

vi.mock('../elevationEnrichment', () => ({
  enrichRouteElevation: vi.fn(async (snap) => snap),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
  },
}));

import { generateAIRoutes } from '../../../utils/aiRouteGenerator.js';

const mockGenerate = generateAIRoutes as unknown as ReturnType<typeof vi.fn>;

function makeRb1Route(distance = 30, elevationGain = 200) {
  return {
    name: 'Test Route',
    distance,
    elevationGain,
    elevationLoss: elevationGain,
    coordinates: [
      [-105, 40],
      [-105.05, 40.05],
      [-105.1, 40.1],
    ],
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
    mockGenerate.mockResolvedValue([makeRb1Route(25, 300)]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
        route_profile: 'road',
        route_shape: 'loop',
      });
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result.current.suggestions.length).toBe(1);
    expect(result.current.suggestions[0].stats.distance_km).toBe(25);
    expect(result.current.suggestions[0].stats.elevation_gain_m).toBe(300);
    expect(result.current.lastError).toBeNull();
  });

  it('sets lastError when v1 throws', async () => {
    mockGenerate.mockRejectedValue(new Error('routing engine offline'));
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });

    expect(result.current.lastError).toMatch(/routing engine offline/);
    expect(result.current.suggestions).toEqual([]);
  });

  it('sets a helpful error when v1 returns zero routes', async () => {
    mockGenerate.mockResolvedValue([]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });

    expect(result.current.lastError).toMatch(/no routes generated/i);
  });

  it('refuses to generate without start_coord', async () => {
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
      });
    });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.lastError).toMatch(/start_coord/i);
  });

  it('selectSuggestion writes geometry, stats, and waypoints to the store', async () => {
    mockGenerate.mockResolvedValue([makeRb1Route(40, 500)]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 90,
        start_coord: [-105, 40],
      });
    });

    act(() => {
      result.current.selectSuggestion(0);
    });

    const state = useRouteBuilderStore.getState();
    expect(state.routeGeometry).toBeTruthy();
    expect(state.routeStats?.distance_km).toBe(40);
    expect(state.routeStats?.elevation_gain_m).toBe(500);
    expect(state.waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 3 suggestions when count is 3, padding if v1 returns fewer', async () => {
    mockGenerate.mockResolvedValue([makeRb1Route(20, 100), makeRb1Route(22, 110)]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate(
        {
          goal: 'endurance',
          duration_minutes: 60,
          start_coord: [-105, 40],
        },
        3,
      );
    });

    expect(result.current.suggestions.length).toBe(3);
  });

  it('clearSuggestions empties the list and resets the error', async () => {
    mockGenerate.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });
    expect(result.current.lastError).not.toBeNull();

    act(() => {
      result.current.clearSuggestions();
    });

    expect(result.current.lastError).toBeNull();
    expect(result.current.suggestions).toEqual([]);
  });
});
