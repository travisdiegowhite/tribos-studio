import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIGeneration } from '../useAIGeneration';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../utils/aiRouteGenerator.js', () => ({
  generateAIRoutes: vi.fn(),
}));

vi.mock('../useSpeedProfile', () => ({
  loadSpeedProfile: vi.fn().mockResolvedValue({ road_speed: 28, average_speed: 27 }),
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
    // Generated routes seed control points sampled from the geometry so they're
    // drag-editable — every position is a 2-element [lng, lat] (no elevation).
    for (const wp of state.waypoints) {
      expect(wp.position).toHaveLength(2);
    }
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

describe('route shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('passes out_back through to the generator unchanged', async () => {
    // The bug this locks down: RB2 used to send 'out_and_back', which no
    // generator branch matched, so every out-and-back request built a loop.
    mockGenerate.mockResolvedValue([{ ...makeRb1Route(), routeType: 'out_back' }]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
        route_shape: 'out_back',
      });
    });

    expect(mockGenerate.mock.calls[0][0].routeType).toBe('out_back');
    expect(useRouteBuilderStore.getState().routeType).toBe('out_back');
  });

  it('defaults to a round trip when no shape is given', async () => {
    mockGenerate.mockResolvedValue([makeRb1Route()]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });

    expect(mockGenerate.mock.calls[0][0].routeType).toBe('round_trip');
  });

  it('stores the concrete shape the generator built for a round trip', async () => {
    mockGenerate.mockResolvedValue([{ ...makeRb1Route(), routeType: 'out_back' }]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
        route_shape: 'round_trip',
      });
    });

    // `routes.route_type` is CHECK-constrained — persisting 'round_trip'
    // would fail the save outright.
    expect(useRouteBuilderStore.getState().routeType).toBe('out_back');
  });

  it('falls back to a loop when the generator reports no shape', async () => {
    mockGenerate.mockResolvedValue([makeRb1Route()]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
        route_shape: 'round_trip',
      });
    });

    expect(useRouteBuilderStore.getState().routeType).toBe('loop');
  });

  it('passes the rider speed profile into generation', async () => {
    // Was hardcoded to null, leaving the learned-speed branch of
    // calculateTargetDistance dead for every RB2 rider.
    mockGenerate.mockResolvedValue([makeRb1Route()]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate({
        goal: 'endurance',
        duration_minutes: 60,
        start_coord: [-105, 40],
      });
    });

    expect(mockGenerate.mock.calls[0][0].speedProfile).toEqual({
      road_speed: 28,
      average_speed: 27,
    });
  });
});

describe('selecting a suggestion commits its own shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('persists the shape of the picked suggestion, not the first one', async () => {
    // A round-trip request can come back as a mix, so the shape that lands in
    // routes.route_type must be the one the rider actually chose.
    mockGenerate.mockResolvedValue([
      { ...makeRb1Route(20), routeType: 'loop' },
      { ...makeRb1Route(22), routeType: 'out_back' },
    ]);
    const { result } = renderHook(() => useAIGeneration());

    await act(async () => {
      await result.current.generate(
        {
          goal: 'endurance',
          duration_minutes: 60,
          start_coord: [-105, 40],
          route_shape: 'round_trip',
        },
        3,
      );
    });

    expect(useRouteBuilderStore.getState().routeType).toBe('loop');

    act(() => {
      result.current.selectSuggestion(1);
    });

    expect(useRouteBuilderStore.getState().routeType).toBe('out_back');
  });
});
