import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('../../lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.limit = limitMock;
  return { supabase: { from: vi.fn(() => builder) } };
});

vi.mock('../../utils/dateUtils', () => ({ getTodayString: () => '2026-06-01' }));

vi.mock('../../data/workoutLookup', () => ({
  getAnyWorkoutById: (id: string) => {
    if (id === 'cyc_id') return { id: 'cyc_id', name: 'Tempo', category: 'tempo', duration: 60 };
    if (id === 'run_id') return { id: 'run_id', name: 'Run', sportType: 'running', duration: 40 };
    return null; // bad_id → unresolved
  },
}));

import { useUpcomingPlannedWorkouts } from '../useUpcomingPlannedWorkouts';

beforeEach(() => limitMock.mockReset());

describe('useUpcomingPlannedWorkouts', () => {
  it('returns [] and does not query when there is no user', async () => {
    const { result } = renderHook(() => useUpcomingPlannedWorkouts(null));
    expect(result.current.workouts).toEqual([]);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('keeps cycling and running rows, drops unresolved/missing-id rows', async () => {
    limitMock.mockResolvedValue({
      data: [
        { id: 'p1', scheduled_date: '2026-06-10', name: 'Tempo Day', workout_id: 'cyc_id', target_duration: 60, target_distance_km: 30, completed: false },
        { id: 'p2', scheduled_date: '2026-06-11', name: 'Run Day', workout_id: 'run_id', completed: false },
        { id: 'p3', scheduled_date: '2026-06-12', name: 'Ghost', workout_id: 'bad_id', completed: false },
        { id: 'p4', scheduled_date: '2026-06-13', name: 'No ID', workout_id: null, completed: false },
      ],
      error: null,
    });

    const { result } = renderHook(() => useUpcomingPlannedWorkouts('user-1'));
    await waitFor(() => expect(result.current.workouts.length).toBe(2));
    expect(result.current.workouts.map((w) => w.workout.id)).toEqual(['cyc_id', 'run_id']);
    const cyc = result.current.workouts[0];
    expect(cyc.targetDurationMinutes).toBe(60);
    expect(cyc.targetDistanceKm).toBe(30);
  });
});
