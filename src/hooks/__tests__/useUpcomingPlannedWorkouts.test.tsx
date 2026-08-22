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

  it('keeps cycling and running rows, drops rows with nothing to paint', async () => {
    limitMock.mockResolvedValue({
      data: [
        { id: 'p1', scheduled_date: '2026-06-10', name: 'Tempo Day', workout_id: 'cyc_id', target_duration: 60, target_distance_km: 30, completed: false },
        { id: 'p2', scheduled_date: '2026-06-11', name: 'Run Day', workout_id: 'run_id', completed: false },
        { id: 'p3', scheduled_date: '2026-06-12', name: 'Ghost', workout_id: 'bad_id', completed: false },
        { id: 'p4', scheduled_date: '2026-06-13', name: 'No ID', workout_id: null, completed: false },
        { id: 'p5', scheduled_date: '2026-06-14', name: 'Rest Day', workout_id: null, workout_type: 'rest', completed: false },
      ],
      error: null,
    });

    const { result } = renderHook(() => useUpcomingPlannedWorkouts('user-1'));
    await waitFor(() => expect(result.current.workouts.length).toBe(2));
    expect(result.current.workouts.map((w) => w.workout.id)).toEqual(['cyc_id', 'run_id']);
    const cyc = result.current.workouts[0];
    expect(cyc.targetDurationMinutes).toBe(60);
    expect(cyc.targetDistanceKm).toBe(30);
    expect(cyc.inferred).toBe(false);
  });

  it('keeps an arc row that names no library workout, shaped by type + length', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          id: 'p1',
          scheduled_date: '2026-06-10',
          name: 'VO2 Max Intervals',
          workout_id: null,
          workout_type: 'vo2max',
          target_duration: 75,
          duration_minutes: 75,
          completed: false,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useUpcomingPlannedWorkouts('user-1'));
    await waitFor(() => expect(result.current.workouts.length).toBe(1));
    const [row] = result.current.workouts;
    // The calendar's own wording survives; the shape comes from the library.
    expect(row.name).toBe('VO2 Max Intervals');
    expect(row.workout.id).toBe('four_by_eight_vo2');
    expect(row.inferred).toBe(true);
    expect(row.targetDurationMinutes).toBe(75);
  });
});
