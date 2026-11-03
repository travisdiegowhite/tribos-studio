import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPreferences = vi.fn();
const updatePreferences = vi.fn();
vi.mock('../../../utils/routePreferences', () => ({
  getPreferences: (...a: unknown[]) => getPreferences(...a),
  updatePreferences: (...a: unknown[]) => updatePreferences(...a),
}));

const getSession = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { useRoadComfort, resetRoadComfortSync, isTrafficTolerance } from '../useRoadComfort';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';

beforeEach(() => {
  vi.clearAllMocks();
  resetRoadComfortSync();
  useRouteBuilderStore.setState({ trafficTolerance: 'medium', comfortLevel: null });
});

describe('useRoadComfort', () => {
  it('defaults to medium and validates values', () => {
    const { result } = renderHook(() => useRoadComfort());
    expect(result.current.roadComfort).toBe('medium');
    expect(isTrafficTolerance('low')).toBe(true);
    expect(isTrafficTolerance('nope')).toBe(false);
  });

  it('applies the stored server value on first use', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getPreferences.mockResolvedValue({ traffic_tolerance: 'low' });
    const { result } = renderHook(() => useRoadComfort());
    await waitFor(() => expect(result.current.roadComfort).toBe('low'));
    expect(getPreferences).toHaveBeenCalledWith('tok');
  });

  it('does not fetch without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderHook(() => useRoadComfort());
    await new Promise((r) => setTimeout(r, 0));
    expect(getPreferences).not.toHaveBeenCalled();
  });

  it('updates the store immediately and persists in the background', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getPreferences.mockResolvedValue({ traffic_tolerance: 'medium' });
    updatePreferences.mockResolvedValue({ traffic_tolerance: 'high' });
    const { result } = renderHook(() => useRoadComfort());
    act(() => result.current.setRoadComfort('high'));
    expect(result.current.roadComfort).toBe('high');
    expect(useRouteBuilderStore.getState().trafficTolerance).toBe('high');
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ traffic_tolerance: 'high' }, 'tok'),
    );
  });

  it('ignores invalid values', () => {
    const { result } = renderHook(() => useRoadComfort());
    act(() => (result.current.setRoadComfort as (v: string) => void)('bogus'));
    expect(result.current.roadComfort).toBe('medium');
  });
});

describe('useRoadComfort — comfort level (migration 139)', () => {
  it('derives the level from the tolerance until one is set', () => {
    useRouteBuilderStore.setState({ trafficTolerance: 'high', comfortLevel: null });
    const { result } = renderHook(() => useRoadComfort());
    expect(result.current.comfortLevel).toBe(4);
  });

  it('applies a level the rider saved', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getPreferences.mockResolvedValue({ traffic_tolerance: 'low', comfort_level: 1, comfort_level_source: 'stored' });
    const { result } = renderHook(() => useRoadComfort());
    await waitFor(() => expect(result.current.comfortLevel).toBe(1));
    expect(result.current.roadComfort).toBe('low');
  });

  it("does not apply the API's new-rider default (keeps today's routing)", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getPreferences.mockResolvedValue({ traffic_tolerance: 'medium', comfort_level: 2, comfort_level_source: 'default' });
    const { result } = renderHook(() => useRoadComfort());
    await waitFor(() => expect(getPreferences).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.roadComfort).toBe('medium');
    expect(result.current.comfortLevel).toBe(3);
  });

  it('setComfortLevel moves the tolerance and saves comfort_level', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getPreferences.mockResolvedValue(null);
    updatePreferences.mockResolvedValue({ comfort_level: 5 });
    const { result } = renderHook(() => useRoadComfort());
    act(() => result.current.setComfortLevel(5));
    expect(result.current.comfortLevel).toBe(5);
    expect(result.current.roadComfort).toBe('high');
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ comfort_level: 5 }, 'tok'));
  });

  it('the three-choice control keeps a level that already maps to it', () => {
    const { result } = renderHook(() => useRoadComfort());
    act(() => result.current.setComfortLevel(1));
    act(() => result.current.setRoadComfort('low'));
    expect(result.current.comfortLevel).toBe(1);
    act(() => result.current.setRoadComfort('medium'));
    expect(result.current.comfortLevel).toBe(3);
  });
});
