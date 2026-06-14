import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGenerateForm } from '../useGenerateForm';
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
