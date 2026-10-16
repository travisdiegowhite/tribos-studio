import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useGenerateForm, RUN_GOAL_OPTIONS, RUN_SURFACE_OPTIONS } from '../useGenerateForm';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';
import type { UseAIGenerationReturn } from '../../../../hooks/route-builder';

function makeGeneration() {
  return {
    isGenerating: false,
    lastError: null,
    suggestions: [],
    generate: vi.fn(),
    selectSuggestion: vi.fn(),
    clearSuggestions: vi.fn(),
  } as unknown as UseAIGenerationReturn & { generate: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  useRouteBuilderStore.getState().resetAll();
});

describe('useGenerateForm — Ride / Run (multisport phase 2)', () => {
  it('switching to Run offers run goals and surfaces and submits a run profile', async () => {
    const generation = makeGeneration();
    const { result } = renderHook(() => useGenerateForm({ generation, defaultStart: [-105, 40] }));
    act(() => result.current.setSport('running'));

    expect(result.current.isRun).toBe(true);
    expect(result.current.goalOptions).toBe(RUN_GOAL_OPTIONS);
    expect(result.current.surfaceOptions).toBe(RUN_SURFACE_OPTIONS);
    expect(result.current.surface).toBe('run');
    expect(useRouteBuilderStore.getState().routeProfile).toBe('run');

    await act(async () => {
      await result.current.onSubmit();
    });
    const sent = generation.generate.mock.calls[0][0];
    expect(sent.route_profile).toBe('run');
    // Road comfort is a cycling preference.
    expect(sent.traffic_tolerance).toBeUndefined();
  });

  it('the Trail surface submits trail_run', async () => {
    const generation = makeGeneration();
    const { result } = renderHook(() => useGenerateForm({ generation, defaultStart: [-105, 40] }));
    act(() => result.current.setSport('running'));
    act(() => result.current.setSurface('trail'));
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(generation.generate.mock.calls[0][0].route_profile).toBe('trail_run');
  });

  it('a run derives distance from run pace, not ride speed', () => {
    const generation = makeGeneration();
    const { result } = renderHook(() => useGenerateForm({ generation }));
    act(() => result.current.setSport('running'));
    // 60 easy minutes at the 10 km/h default.
    expect(result.current.derivedDistanceKm).toBeCloseTo(10, 5);
  });

  it('switching back to Ride restores the bike surface', () => {
    const generation = makeGeneration();
    const { result } = renderHook(() => useGenerateForm({ generation }));
    act(() => result.current.setSport('running'));
    act(() => result.current.setSport('cycling'));
    expect(result.current.surface).toBe('road');
    expect(useRouteBuilderStore.getState().routeProfile).toBe('road');
  });
});
