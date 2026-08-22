import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGenerateForm, SHAPE_OPTIONS } from '../useGenerateForm';
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
