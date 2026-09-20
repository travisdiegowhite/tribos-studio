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
  useRouteBuilderStore.setState({ trafficTolerance: 'medium' });
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
