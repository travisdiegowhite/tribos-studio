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
  it('lists library workouts and fires onSelect on click', () => {
    const { container, props } = renderPicker();
    const rows = container.querySelectorAll('[data-testid^="rb2-workout-library-"]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0] as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect((props.onSelect as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty('id');
  });

  it('filters the library by search', () => {
    const { container } = renderPicker();
    fireEvent.change(screen.getByPlaceholderText('Search workouts'), {
      target: { value: 'zzzznotathing' },
    });
    expect(container.querySelectorAll('[data-testid^="rb2-workout-library-"]').length).toBe(0);
    expect(screen.getByText(/No workouts match/)).toBeInTheDocument();
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
