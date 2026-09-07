import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { WorkoutModal } from './WorkoutModal';
import { resolvePlannedWorkoutShape } from '../../lib/training/plannedWorkoutShape';
import type { PlannerWorkout } from '../../types/planner';

vi.mock('../../utils/workoutExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/workoutExport')>();
  return { ...actual, downloadWorkout: vi.fn() };
});

/** The production row: an arc VO2 day that names no library workout. */
const ARC_ROW = {
  id: 'entry-1',
  workout_id: null,
  workout_type: 'vo2max',
  name: 'VO2 Max Intervals',
  scheduled_date: '2026-09-07',
  target_duration: 75,
  target_rss: 71,
  notes: 'VO2 quality (week 1, dense block).',
};

function plannedFrom(row: typeof ARC_ROW): PlannerWorkout {
  return {
    id: row.id,
    planId: '',
    sportType: null,
    planPriority: 'primary',
    scheduledDate: row.scheduled_date,
    workoutId: row.workout_id,
    workoutType: 'vo2max',
    targetTSS: row.target_rss,
    targetDuration: row.target_duration,
    notes: row.notes,
    completed: false,
    completedAt: null,
    activityId: null,
    actualTSS: null,
    actualDuration: null,
  };
}

describe('WorkoutModal for a planned entry with no library workout', () => {
  it('draws a profile, says it is a stand-in, and offers device exports', () => {
    const shape = resolvePlannedWorkoutShape(ARC_ROW)!;
    render(
      <MantineProvider>
        <WorkoutModal
          workout={shape.workout}
          plannedWorkout={plannedFrom(ARC_ROW)}
          opened
          onClose={() => {}}
          scheduledDate={ARC_ROW.scheduled_date}
          structureNote={shape.note}
        />
      </MantineProvider>,
    );

    expect(screen.getByText('Workout Profile')).toBeTruthy();
    expect(screen.getByText('Interval Details')).toBeTruthy();
    expect(screen.getByTestId('structure-note').textContent).toMatch(/Stand-in/);
    expect(screen.getByTestId('workout-export')).toBeTruthy();
    expect(screen.getByText('FIT (Garmin/Wahoo)')).toBeTruthy();
    expect(screen.getByText('ZWO (Zwift)')).toBeTruthy();
    expect(screen.getByText('TCX')).toBeTruthy();
  });

  it('shows no profile or export for a rest day', () => {
    const row = { ...ARC_ROW, workout_type: 'rest', name: 'Rest', target_duration: 0, target_rss: 0, notes: '' };
    const shape = resolvePlannedWorkoutShape(row)!;
    render(
      <MantineProvider>
        <WorkoutModal
          workout={shape.workout}
          plannedWorkout={{ ...plannedFrom(row), workoutType: 'rest' }}
          opened
          onClose={() => {}}
          structureNote={shape.note}
        />
      </MantineProvider>,
    );
    expect(screen.queryByText('Workout Profile')).toBeNull();
    expect(screen.queryByTestId('workout-export')).toBeNull();
  });
});
