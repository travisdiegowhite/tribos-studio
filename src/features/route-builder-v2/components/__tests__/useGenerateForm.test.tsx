import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGenerateForm, SHAPE_OPTIONS, TARGET_MODE_OPTIONS } from '../useGenerateForm';
import type { UseAIGenerationReturn } from '../../../../hooks/route-builder';

const generation = {
  isGenerating: false,
  lastError: null,
  suggestions: [],
  generate: vi.fn(),
  selectSuggestion: vi.fn(),
  clearSuggestions: vi.fn(),
} as unknown as UseAIGenerationReturn;

describe('useGenerateForm summary surface label', () => {
  it('reflects the active route profile when one is set', () => {
    const { result } = renderHook(() =>
      useGenerateForm({ generation, activeRouteProfile: 'gravel' }),
    );
    // Local surface defaults to road, but the chip shows the active profile.
    expect(result.current.surface).toBe('road');
    expect(result.current.summary).toMatch(/· Gravel$/);
  });

  it('maps mtb to Mountain', () => {
    const { result } = renderHook(() =>
      useGenerateForm({ generation, activeRouteProfile: 'mtb' }),
    );
    expect(result.current.summary).toMatch(/· Mountain$/);
  });

  it('falls back to the form surface when no active profile', () => {
    const { result } = renderHook(() => useGenerateForm({ generation }));
    expect(result.current.summary).toMatch(/· Road$/);
    act(() => result.current.setSurface('gravel'));
    expect(result.current.summary).toMatch(/· Gravel$/);
  });
});

describe('useGenerateForm shape', () => {
  it('defaults to a round trip', () => {
    // Most riders start and finish in the same place and don't mind whether
    // that's a loop or an out-and-back — so the generator gets to pick.
    const { result } = renderHook(() => useGenerateForm({ generation }));
    expect(result.current.shape).toBe('round_trip');
    expect(SHAPE_OPTIONS[0].value).toBe('round_trip');
  });

  it('offers the generator/database shape vocabulary', () => {
    // 'out_and_back' was RB2-only spelling that no generator branch matched.
    expect(SHAPE_OPTIONS.map((o) => o.value)).toEqual([
      'round_trip',
      'loop',
      'out_back',
      'point_to_point',
    ]);
  });

  it('submits the selected shape', async () => {
    const generate = vi.fn();
    const gen = { ...generation, generate } as unknown as UseAIGenerationReturn;
    const { result } = renderHook(() =>
      useGenerateForm({ generation: gen, defaultStart: [-105, 40] }),
    );
    act(() => result.current.setShape('out_back'));
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ route_shape: 'out_back' }),
    );
  });

  it('resets back to a round trip', () => {
    const { result } = renderHook(() => useGenerateForm({ generation }));
    act(() => result.current.setShape('point_to_point'));
    act(() => result.current.onReset());
    expect(result.current.shape).toBe('round_trip');
  });
});

describe('useGenerateForm target mode', () => {
  it('binds on time by default', () => {
    const { result } = renderHook(() => useGenerateForm({ generation }));
    expect(result.current.targetMode).toBe('time');
    expect(TARGET_MODE_OPTIONS.map((o) => o.value)).toEqual(['time', 'distance']);
  });

  it('binds on distance when one is seeded', () => {
    // A planned workout that names a distance is the rider asking for it.
    const { result } = renderHook(() =>
      useGenerateForm({ generation, initialDistanceKm: 40 }),
    );
    expect(result.current.targetMode).toBe('distance');
  });

  it('derives the counterpart from the same pace the generator will use', () => {
    const { result } = renderHook(() =>
      useGenerateForm({ generation, initialDurationMinutes: 60 }),
    );
    // 60 min at the endurance pace, and the round trip back through it.
    expect(result.current.derivedDistanceKm).toBeCloseTo(result.current.paceKmh, 5);
    act(() => result.current.setDistanceKm(result.current.paceKmh));
    expect(result.current.derivedDurationMinutes).toBe(60);
  });

  it('sends only the binding target', async () => {
    const generate = vi.fn();
    const gen = { ...generation, generate } as unknown as UseAIGenerationReturn;
    const { result } = renderHook(() =>
      useGenerateForm({ generation: gen, defaultStart: [-105, 40] }),
    );

    await act(async () => {
      await result.current.onSubmit();
    });
    expect(generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target_mode: 'time',
        duration_minutes: 60,
        distance_km: undefined,
      }),
    );

    act(() => result.current.setTargetMode('distance'));
    act(() => result.current.setDistanceKm(40));
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ target_mode: 'distance', distance_km: 40 }),
    );
  });

  it('resets back to time', () => {
    const { result } = renderHook(() => useGenerateForm({ generation }));
    act(() => result.current.setTargetMode('distance'));
    act(() => result.current.onReset());
    expect(result.current.targetMode).toBe('time');
  });
});
