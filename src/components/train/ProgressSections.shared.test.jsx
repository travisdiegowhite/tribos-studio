import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../hooks/useRunThresholds', () => ({ useRunThresholds: () => ({ lthr: null, maxHr: null, thresholdPaceSec: null }) }));
vi.mock('../../hooks/useSegmentLibrary', () => ({ useSegmentLibrary: () => ({ segments: [], loading: false, fetchSegments: vi.fn() }) }));

import { supabase } from '../../lib/supabase';
import { useProgressSectionsData } from './ProgressSections.jsx';

const ride = (id) => ({ id, type: 'Ride', sport_type: 'cycling', start_date: new Date().toISOString(), moving_time: 3600, average_watts: 200, distance: 30000 });

describe('useProgressSectionsData with the dashboard\'s data', () => {
  it('uses what it is handed and fetches no activities of its own', () => {
    supabase.from.mockClear();
    const shared = {
      activities: [ride('a'), ride('b')],
      ftp: 250,
      isImperial: false,
      taus: { tfi: 42, afi: 7 },
      serverLoadHistory: [],
      sportLoadHistory: [{ date: '2026-11-21', tfi_cycling: 40, tfi_running: 12 }],
      loading: false,
    };
    const { result } = renderHook(() => useProgressSectionsData('all', shared));
    expect(supabase.from).not.toHaveBeenCalledWith('activities');
    expect(supabase.from).not.toHaveBeenCalledWith('user_profiles');
    expect(result.current.activities).toHaveLength(2);
    expect(result.current.loadSplit).toMatchObject({ tfi_cycling: 40, tfi_running: 12 });
    expect(result.current.loading).toBe(false);
  });

  it('still loads its own when used standalone', () => {
    supabase.from.mockClear();
    renderHook(() => useProgressSectionsData('all'));
    expect(supabase.from).toHaveBeenCalledWith('user_profiles');
  });
});
