import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteHistory } from '../useRouteHistory';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

vi.mock('../../../features/route-builder-v2/telemetry/trackRb2', () => ({
  trackRb2: vi.fn(),
}));

const routeA = {
  geometry: { type: 'LineString' as const, coordinates: [[-105, 40], [-104, 41]] },
  name: 'Loop A',
  stats: { distance_km: 10, elevation_gain_m: 100, duration_s: 1800 },
  waypoints: [
    { id: 'wp-0', position: [-105, 40] as [number, number], type: 'start', name: '' },
    { id: 'wp-1', position: [-104, 41] as [number, number], type: 'end', name: '' },
  ],
  source: 'generated',
};

function setRoute(data: typeof routeA) {
  act(() => {
    useRouteBuilderStore.getState().setRoute(data);
  });
}

describe('useRouteHistory', () => {
  beforeEach(() => {
    act(() => useRouteBuilderStore.getState().resetAll());
  });

  it('starts with nothing to undo or redo', () => {
    const { result } = renderHook(() => useRouteHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('records a change and undoes back to the prior state', () => {
    const { result } = renderHook(() => useRouteHistory());
    setRoute(routeA);
    expect(result.current.canUndo).toBe(true);
    expect(useRouteBuilderStore.getState().routeGeometry).not.toBeNull();

    act(() => result.current.undo());
    expect(useRouteBuilderStore.getState().routeGeometry).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redoes a previously undone change', () => {
    const { result } = renderHook(() => useRouteHistory());
    setRoute(routeA);
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(useRouteBuilderStore.getState().routeName).toBe('Loop A');
    expect(useRouteBuilderStore.getState().routeGeometry).not.toBeNull();
    expect(result.current.canRedo).toBe(false);
  });

  it('does not create a history entry for a stats-only change', () => {
    const { result } = renderHook(() => useRouteHistory());
    setRoute(routeA);
    // A background stats refresh (same geometry / waypoints / name).
    act(() => {
      useRouteBuilderStore.getState().setRouteStats({
        distance_km: 10,
        elevation_gain_m: 250,
        duration_s: 1900,
      });
    });
    // Still exactly one undo level — straight back to the empty start.
    act(() => result.current.undo());
    expect(useRouteBuilderStore.getState().routeGeometry).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it('clearing the redo branch after a new edit', () => {
    const { result } = renderHook(() => useRouteHistory());
    setRoute(routeA);
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    // A fresh edit invalidates redo.
    setRoute({ ...routeA, name: 'Loop B' });
    expect(result.current.canRedo).toBe(false);
  });
});
