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

    expect(screen.getByText('Workout profile')).toBeTruthy();
    expect(screen.getByText('Interval details')).toBeTruthy();
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
    expect(screen.queryByText('Workout profile')).toBeNull();
    expect(screen.queryByTestId('workout-export')).toBeNull();
  });
});

describe('WorkoutModal duration edits', () => {
  it('re-derives the planned load when the length changes', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { WORKOUT_LIBRARY } = await import('../../data/workoutLibrary');
    const { structureLoad, fitStructureToDuration } = await import('../../lib/training/plannedWorkoutShape');
    const workout = WORKOUT_LIBRARY.foundation_miles;
    const planned: PlannerWorkout = {
      ...plannedFrom(ARC_ROW),
      workoutId: workout.id,
      workoutType: 'endurance',
      targetTSS: workout.targetTSS,
      targetDuration: workout.duration,
    };
    render(
      <MantineProvider>
        <WorkoutModal workout={workout} plannedWorkout={planned} opened onClose={() => {}} />
      </MantineProvider>,
    );
    const duration = screen.getByLabelText('Duration (min)') as HTMLInputElement;
    fireEvent.change(duration, { target: { value: '120' } });
    const load = screen.getByLabelText('Planned stress') as HTMLInputElement;
    // The extra hour is endurance riding, scored with the actual-load formula.
    expect(Number(load.value)).toBeGreaterThan(workout.targetTSS);
    expect(Number(load.value)).toBeCloseTo(structureLoad(fitStructureToDuration(workout.structure, 120)), -1);
  });
});

describe('WorkoutModal draws the session from the shared core', () => {
  const runRow = {
    id: 'run-1',
    scheduled_date: '2026-11-25',
    entry_type: 'workout',
    name: 'Threshold Run',
    workout_id: null,
    workout_type: 'threshold',
    sport: 'running',
    target_duration: 50,
    target_rss: 67,
    status: 'planned',
    details: {
      prescription: {
        version: 1,
        source: 'coach',
        basis: 'pace',
        intervals: [{ repeats: 4, duration_min: 5, recovery_min: 2, target_pct_threshold_pace_min: 98, target_pct_threshold_pace_max: 102 }],
      },
    },
  };

  it('shows a run in paces, with no bike export or ride words', () => {
    render(
      <MantineProvider>
        <WorkoutModal
          workout={null}
          entry={runRow}
          anchors={{ ftp: 250, thresholdPaceSec: 300 }}
          plannedWorkout={{ ...plannedFrom(ARC_ROW), id: 'run-1', workoutType: 'threshold', targetTSS: 67, targetDuration: 50 }}
          opened
          onClose={() => {}}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('step-list').textContent).toMatch(/4:54–5:06\/km/);
    expect(screen.getByTestId('step-list').textContent).not.toMatch(/FTP/);
    // A run exports as a FIT run workout, never a bike/Zwift file.
    expect(screen.getByTestId('workout-export').textContent).toMatch(/FIT run workout/);
    expect(screen.queryByText('ZWO (Zwift)')).toBeNull();
    expect(screen.queryByText(/ride stress/i)).toBeNull();
  });

  it('gives VO2 bars a real zone colour', () => {
    render(
      <MantineProvider>
        <WorkoutModal workout={null} entry={{ ...ARC_ROW, sport: 'cycling', entry_type: 'workout', workout_id: 'four_by_eight_vo2' }} plannedWorkout={plannedFrom(ARC_ROW)} opened onClose={() => {}} />
      </MantineProvider>,
    );
    const bars = screen.getByTestId('session-profile').querySelectorAll('[data-zone="5"]');
    expect(bars.length).toBeGreaterThan(0);
    expect((bars[0] as HTMLElement).style.background).toBe('var(--zone-5)');
  });

  it('compares a done session with its plan', () => {
    render(
      <MantineProvider>
        <WorkoutModal
          workout={null}
          entry={{ ...ARC_ROW, sport: 'cycling', entry_type: 'workout', status: 'done', activity_id: 'a1', target_rss: 55, actual_rss: 49, actual_duration: 50, target_duration: 60 }}
          plannedWorkout={{ ...plannedFrom(ARC_ROW), targetTSS: 55, targetDuration: 60, completed: true }}
          opened
          onClose={() => {}}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('planned-vs-actual')).toBeTruthy();
    expect(screen.getByTestId('compliance-badge').getAttribute('data-band')).toBe('on_target');
    expect(screen.queryByLabelText('Planned stress')).toBeNull();
    expect(screen.getByText('Edit plan')).toBeTruthy();
  });
});
