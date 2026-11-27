import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../utils/routePreferences', () => ({
  getSegmentStats: vi.fn(),
}));

import { getSegmentStats } from '../../../utils/routePreferences';
import { supabase } from '../../../lib/supabase';
import { useHasRideHistory } from '../useHasRideHistory';

describe('useHasRideHistory', () => {
  beforeEach(() => {
    vi.mocked(getSegmentStats).mockReset();
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    } as never);
  });

  it('is false for a guest and never calls the API', () => {
    const { result } = renderHook(() => useHasRideHistory(null));
    expect(result.current.hasHistory).toBe(false);
    expect(getSegmentStats).not.toHaveBeenCalled();
  });

  it('is true when the rider has ridden segments', async () => {
    vi.mocked(getSegmentStats).mockResolvedValue({ total_segments: 42 } as never);
    const { result } = renderHook(() => useHasRideHistory('user-1'));
    await waitFor(() => expect(result.current.hasHistory).toBe(true));
    expect(getSegmentStats).toHaveBeenCalledWith('tok');
  });

  it('is false when the rider has no segments or the stats call fails', async () => {
    vi.mocked(getSegmentStats).mockResolvedValue(null as never);
    const { result } = renderHook(() => useHasRideHistory('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasHistory).toBe(false);
  });
});
