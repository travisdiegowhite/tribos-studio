import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const api = { nameSegments: vi.fn(), updateSegmentName: vi.fn() };
vi.mock('../utils/segmentApiClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/segmentApiClient')>('../utils/segmentApiClient');
  return {
    ...actual,
    nameSegments: (...args: unknown[]) => api.nameSegments(...args),
    updateSegmentName: (...args: unknown[]) => api.updateSegmentName(...args),
  };
});

import { useSegmentNamer } from './useSegmentNamer';
import type { RepeatAnchorSegment } from './useRepeatAnchorSegments';

function seg(id: string, generic: boolean): RepeatAnchorSegment {
  return {
    id,
    display_name: generic ? 'Rolling 1km' : 'Nelson Rd',
    auto_name: generic ? 'Rolling 1km' : 'Nelson Rd',
    custom_name: null,
    generic,
    distance_meters: 1000,
    avg_gradient: 0,
    elevation_gain_meters: 0,
    ride_count: 3,
    terrain_type: 'rolling',
    last_ridden_at: null,
    geojson: { coordinates: [] },
  };
}

const named = (id: string, source: 'roads' | 'place' | 'unchanged') => ({
  segmentId: id,
  auto_name: source === 'unchanged' ? 'Rolling 1km' : `Road ${id}`,
  custom_name: null,
  display_name: source === 'unchanged' ? 'Rolling 1km' : `Road ${id}`,
  roads: [],
  source,
});

beforeEach(() => {
  api.nameSegments.mockReset();
  api.updateSegmentName.mockReset();
});

describe('useSegmentNamer', () => {
  it('counts the generic names and sends them in batches until the server has reached them all', async () => {
    const segments = [seg('a', true), seg('b', false), seg('c', true), seg('d', true)];
    const patch = vi.fn();
    api.nameSegments
      .mockResolvedValueOnce({ results: [named('a', 'roads'), named('c', 'unchanged')], processed: 2, remaining: ['d'] })
      .mockResolvedValueOnce({ results: [named('d', 'place')], processed: 1, remaining: [] });

    const { result } = renderHook(() => useSegmentNamer(segments, patch));
    expect(result.current.unnamedCount).toBe(3);

    act(() => result.current.nameAll());
    await waitFor(() => expect(result.current.progress.running).toBe(false));

    expect(api.nameSegments).toHaveBeenNthCalledWith(1, ['a', 'c', 'd']);
    expect(api.nameSegments).toHaveBeenNthCalledWith(2, ['d']);
    expect(patch).toHaveBeenCalledWith('a', { auto_name: 'Road a' });
    expect(patch).toHaveBeenCalledWith('d', { auto_name: 'Road d' });
    expect(patch).not.toHaveBeenCalledWith('c', expect.anything());
    expect(result.current.progress).toEqual({ running: false, done: 3, total: 3, named: 2, error: null });
  });

  it('reports a failed call and stops', async () => {
    const patch = vi.fn();
    api.nameSegments.mockRejectedValueOnce(new Error('Request failed (500)'));
    const { result } = renderHook(() => useSegmentNamer([seg('a', true)], patch));
    act(() => result.current.nameAll());
    await waitFor(() => expect(result.current.progress.running).toBe(false));
    expect(result.current.progress.error).toBe('Request failed (500)');
    expect(patch).not.toHaveBeenCalled();
  });

  it('does nothing when every segment already has a name', () => {
    const { result } = renderHook(() => useSegmentNamer([seg('a', false)], vi.fn()));
    act(() => result.current.nameAll());
    expect(api.nameSegments).not.toHaveBeenCalled();
    expect(result.current.progress.running).toBe(false);
  });

  it('renames through the API and patches the row, clearing on an empty name', async () => {
    const patch = vi.fn();
    api.updateSegmentName.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useSegmentNamer([seg('a', true)], patch));
    await act(() => result.current.rename('a', '  Tuesday loop '));
    expect(api.updateSegmentName).toHaveBeenCalledWith('a', 'Tuesday loop');
    expect(patch).toHaveBeenCalledWith('a', { custom_name: 'Tuesday loop' });
    await act(() => result.current.rename('a', '   '));
    expect(api.updateSegmentName).toHaveBeenLastCalledWith('a', null);
    expect(patch).toHaveBeenLastCalledWith('a', { custom_name: null });
    expect(result.current.renaming).toBeNull();
  });
});
