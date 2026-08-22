import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WorkoutPickerPanel } from '../WorkoutPickerPanel';
import type { WorkoutDefinition } from '../../../../types/training';
import type { UpcomingPlannedWorkout } from '../../../../hooks/useUpcomingPlannedWorkouts';

const plannedWorkout = {
  id: 'recovery_spin',
  name: 'Recovery Spin',
  category: 'recovery',
  duration: 30,
  targetTSS: 20,
} as unknown as WorkoutDefinition;

const planned: UpcomingPlannedWorkout[] = [
  {
    id: 'p1',
    scheduledDate: '2026-06-10',
    name: 'Recovery Spin',
    workout: plannedWorkout,
    inferred: false,
    targetDurationMinutes: 45,
    targetDistanceKm: 25,
  },
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof WorkoutPickerPanel>> = {}) {
  const props: React.ComponentProps<typeof WorkoutPickerPanel> = {
    plannedWorkouts: [],
    selectedWorkoutId: null,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  const result = render(
    <MantineProvider>
      <WorkoutPickerPanel {...props} />
    </MantineProvider>,
  );
  return { ...result, props };
}

describe('WorkoutPickerPanel', () => {
  it('defaults to the Bike tab (no planned), grouped by category, and fires onSelect', () => {
    const { container, props } = renderPicker();
    // Category headers prove the list is grouped/browsable.
    expect(screen.getByTestId('rb2-workout-cat-endurance')).toBeInTheDocument();
    const rows = container.querySelectorAll('[data-testid^="rb2-workout-library-"]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0] as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect((props.onSelect as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty('id');
  });

  it('shows running workouts on the Run tab and selects one with sportType running', () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getByText('Run'));
    const runRow = screen.getByTestId('rb2-workout-library-run_recovery_jog');
    fireEvent.click(runRow);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect((props.onSelect as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty(
      'sportType',
      'running',
    );
  });

  it('filters the active library tab by search', () => {
    const { container } = renderPicker();
    fireEvent.change(screen.getByPlaceholderText(/Search cycling workouts/), {
      target: { value: 'zzzznotathing' },
    });
    expect(container.querySelectorAll('[data-testid^="rb2-workout-library-"]').length).toBe(0);
    expect(screen.getByText(/No workouts match/)).toBeInTheDocument();
  });

  it('labels an inferred planned row with the calendar name and its stand-in shape', () => {
    const inferredRow: UpcomingPlannedWorkout = {
      id: 'p2',
      scheduledDate: '2026-06-11',
      // What the arc plan calls the session...
      name: 'VO2 Max Intervals',
      // ...and the library workout its shape was borrowed from.
      workout: {
        id: 'four_by_eight_vo2',
        name: '4x8min VO2 Max',
        category: 'vo2max',
        duration: 75,
        targetTSS: 105,
      } as unknown as WorkoutDefinition,
      inferred: true,
      targetDurationMinutes: 75,
      targetDistanceKm: null,
    };
    renderPicker({ plannedWorkouts: [inferredRow] });
    const row = screen.getByTestId('rb2-workout-planned-four_by_eight_vo2');
    expect(row).toHaveTextContent('VO2 Max Intervals');
    expect(row).toHaveTextContent('shaped as 4x8min VO2 Max');
  });

  it('shows planned workouts (default tab) and passes the planned override on select', () => {
    const { props } = renderPicker({ plannedWorkouts: planned });
    const row = screen.getByTestId('rb2-workout-planned-recovery_spin');
    expect(row).toHaveTextContent('Recovery Spin');
    fireEvent.click(row);
    expect(props.onSelect).toHaveBeenCalledWith(plannedWorkout, {
      targetDurationMinutes: 45,
      targetDistanceKm: 25,
    });
  });

  it('shows a Remove button when a workout is selected', () => {
    const { props } = renderPicker({ selectedWorkoutId: 'recovery_spin' });
    fireEvent.click(screen.getByTestId('rb2-workout-picker-clear'));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('hides the Remove button when nothing is selected', () => {
    renderPicker();
    expect(screen.queryByTestId('rb2-workout-picker-clear')).toBeNull();
  });
});
