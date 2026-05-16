import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteEditing } from '../useRouteEditing';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import type { ExecutorResult, RouteSnapshot, Mutation } from '../../../routing/executor';

vi.mock('../../../features/route-builder-v2/adapters', async () => ({
  applyMutation: vi.fn(),
  interpretChatInput: vi.fn(),
}));

import * as adapter from '../../../features/route-builder-v2/adapters';

function makeRoute(distance = 25): RouteSnapshot {
  return {
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
      elevation_gain_m: 100,
      elevation_loss_m: 100,
      duration_s: 1800,
    },
  };
}

function makeSuccess(distance: number): ExecutorResult {
  return {
    ok: true,
    route: makeRoute(distance),
    metadata: {
      provider_used: 'stadia',
      duration_ms: 1,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

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

  it('returns context_missing failure when no current route', async () => {
    const { result } = renderHook(() => useRouteEditing());
    let res: ExecutorResult | null = null;
    await act(async () => {
      res = await result.current.applyMutation({
        type: 'extend_distance',
        delta_km: 5,
      } as Mutation);
    });
    expect(res!.ok).toBe(false);
    expect(result.current.lastError).toContain('No current route');
  });

  it('applies a mutation and writes back to the store', async () => {
    seedStoreWithRoute(25);
    vi.mocked(adapter.applyMutation).mockResolvedValue(makeSuccess(30));

    const { result } = renderHook(() => useRouteEditing());
    await act(async () => {
      await result.current.applyMutation({
        type: 'extend_distance',
        delta_km: 5,
      } as Mutation);
    });

    expect(result.current.lastError).toBeNull();
    expect(result.current.historyDepth).toBe(1);
    const stats = useRouteBuilderStore.getState().routeStats;
    expect(stats.distance_km).toBe(30);
  });

  it('sets lastError when executor returns failure', async () => {
    seedStoreWithRoute(25);
    vi.mocked(adapter.applyMutation).mockResolvedValue({
      ok: false,
      reason: { kind: 'constraint_infeasible', constraint: 'x', explanation: 'too short' },
    });
    const { result } = renderHook(() => useRouteEditing());
    await act(async () => {
      await result.current.applyMutation({
        type: 'extend_distance',
        delta_km: 1000,
      } as Mutation);
    });
    expect(result.current.lastError).toBe('too short');
    expect(result.current.historyDepth).toBe(0);
  });

  it('applyAIEdit returns chat_translation_unavailable when stub returns null', async () => {
    seedStoreWithRoute(25);
    vi.mocked(adapter.interpretChatInput).mockReturnValue(null);
    const { result } = renderHook(() => useRouteEditing());
    let res: any;
    await act(async () => {
      res = await result.current.applyAIEdit('make it flatter');
    });
    expect(res).toEqual({ ok: false, reason: 'chat_translation_unavailable' });
  });

  it('undo restores prior history entry', async () => {
    seedStoreWithRoute(25);
    vi.mocked(adapter.applyMutation)
      .mockResolvedValueOnce(makeSuccess(30))
      .mockResolvedValueOnce(makeSuccess(40));
    const { result } = renderHook(() => useRouteEditing());

    await act(async () => {
      await result.current.applyMutation({
        type: 'extend_distance',
        delta_km: 5,
      } as Mutation);
    });
    await act(async () => {
      await result.current.applyMutation({
        type: 'extend_distance',
        delta_km: 10,
      } as Mutation);
    });

    expect(result.current.historyDepth).toBe(2);
    expect(useRouteBuilderStore.getState().routeStats.distance_km).toBe(40);

    act(() => {
      const ok = result.current.undo();
      expect(ok).toBe(true);
    });

    expect(useRouteBuilderStore.getState().routeStats.distance_km).toBe(30);
    expect(result.current.canRedo).toBe(true);
  });
});
