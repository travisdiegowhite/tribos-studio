import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteEditing } from '../useRouteEditing';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../features/route-builder-v2/chat/replicatedEditLogic', () => ({
  applyAIEdit: vi.fn(),
}));

import { applyAIEdit } from '../../../features/route-builder-v2/chat/replicatedEditLogic';

const mockApply = applyAIEdit as unknown as ReturnType<typeof vi.fn>;

function seedStoreWithRoute(distance = 25) {
  const store = useRouteBuilderStore.getState();
  store.resetAll();
  store.setRouteGeometry({
    type: 'LineString',
    coordinates: [
      [-105, 40],
      [-105.1, 40.1],
    ],
  });
  store.setRouteStats({
    distance_km: distance,
    elevation_gain_m: 100,
    duration_s: 1800,
  });
  store.setWaypoints([
    { id: 'wp-0', position: [-105, 40], type: 'start', name: '' },
    { id: 'wp-1', position: [-105.1, 40.1], type: 'end', name: '' },
  ]);
}

describe('useRouteEditing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('has expected initial state', () => {
    const { result } = renderHook(() => useRouteEditing());
    expect(result.current.isApplying).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.historyDepth).toBe(0);
  });

  it('applyAIEdit on success returns ok and records history', async () => {
    seedStoreWithRoute(25);
    mockApply.mockResolvedValue({
      ok: true,
      assistantText: 'Done.',
      distance_km: 22,
      elevation_gain_m: 80,
    });
    const { result } = renderHook(() => useRouteEditing());

    await act(async () => {
      const r = await result.current.applyAIEdit('make it flatter');
      expect(r.ok).toBe(true);
    });

    expect(mockApply).toHaveBeenCalledWith('make it flatter');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.historyDepth).toBe(1);
  });

  it('applyAIEdit on failure surfaces the reason and does not record history', async () => {
    seedStoreWithRoute(25);
    mockApply.mockResolvedValue({ ok: false, reason: 'no route to edit' });
    const { result } = renderHook(() => useRouteEditing());

    await act(async () => {
      const r = await result.current.applyAIEdit('make it flatter');
      expect(r.ok).toBe(false);
    });

    expect(result.current.lastError).toBe('no route to edit');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.historyDepth).toBe(0);
  });

  it('undo restores the prior geometry/stats', async () => {
    seedStoreWithRoute(25);
    const initialGeom = useRouteBuilderStore.getState().routeGeometry;

    mockApply.mockImplementation(async () => {
      // simulate the edit pipeline writing a new geometry/stats to the store
      const store = useRouteBuilderStore.getState();
      store.setRouteGeometry({
        type: 'LineString',
        coordinates: [
          [-105, 40],
          [-105.2, 40.2],
        ],
      });
      store.setRouteStats({
        distance_km: 30,
        elevation_gain_m: 200,
        duration_s: 2400,
      });
      return {
        ok: true,
        assistantText: 'Longer.',
        distance_km: 30,
        elevation_gain_m: 200,
      };
    });

    const { result } = renderHook(() => useRouteEditing());

    await act(async () => {
      await result.current.applyAIEdit('longer');
    });

    expect(useRouteBuilderStore.getState().routeStats?.distance_km).toBe(30);

    act(() => {
      const didUndo = result.current.undo();
      expect(didUndo).toBe(true);
    });

    expect(useRouteBuilderStore.getState().routeGeometry).toEqual(initialGeom);
    expect(useRouteBuilderStore.getState().routeStats?.distance_km).toBe(25);
  });

  it('canUndo is false with empty history', () => {
    const { result } = renderHook(() => useRouteEditing());
    expect(result.current.canUndo).toBe(false);
    act(() => {
      const ok = result.current.undo();
      expect(ok).toBe(false);
    });
  });
});
