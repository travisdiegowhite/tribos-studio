import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

describe('WorkoutPickerPanel — describing a coach workout', () => {
  const base = {
    plannedWorkouts: [],
    selectedWorkoutId: null,
    onSelect: vi.fn(),
    onClear: vi.fn(),
  };

  function renderPanel(props: Record<string, unknown> = {}) {
    return render(
      <MantineProvider>
        <WorkoutPickerPanel {...base} {...props} />
      </MantineProvider>,
    );
  }

  it('offers the Coach tab only when the page can handle it', () => {
    renderPanel();
    expect(screen.queryByText('Coach')).not.toBeInTheDocument();
    cleanup();
    renderPanel({ onDescribeWorkout: vi.fn() });
    expect(screen.getByText('Coach')).toBeInTheDocument();
  });

  it('hands the description to the page and clears on success', async () => {
    const onDescribeWorkout = vi.fn().mockResolvedValue({ ok: true });
    renderPanel({ onDescribeWorkout });

    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByTestId('rb2-describe-name'), {
      target: { value: '4x8 Threshold' },
    });
    fireEvent.change(screen.getByTestId('rb2-describe-text'), {
      target: { value: '15min wu, 4x8min @ threshold, 5min easy, 10min cd' },
    });
    fireEvent.click(screen.getByTestId('rb2-describe-submit'));

    await waitFor(() =>
      expect(onDescribeWorkout).toHaveBeenCalledWith({
        description: '15min wu, 4x8min @ threshold, 5min easy, 10min cd',
        name: '4x8 Threshold',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('rb2-describe-text')).toHaveValue(''),
    );
  });

  it("shows the parser's own account of what was missing", async () => {
    // Worth showing verbatim: a generic failure leaves the rider guessing,
    // and guessing at the structure would build a route for a workout they
    // never described.
    const onDescribeWorkout = vi.fn().mockResolvedValue({
      ok: false,
      message: "That wasn't specific enough — no main set could be read.",
    });
    renderPanel({ onDescribeWorkout });

    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByTestId('rb2-describe-text'), {
      target: { value: 'ride hard' },
    });
    fireEvent.click(screen.getByTestId('rb2-describe-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('rb2-describe-error')).toHaveTextContent(
        'no main set could be read',
      ),
    );
    // The text stays put so they can add to it rather than retype.
    expect(screen.getByTestId('rb2-describe-text')).toHaveValue('ride hard');
  });

  it('will not submit an empty description', () => {
    const onDescribeWorkout = vi.fn();
    renderPanel({ onDescribeWorkout });
    fireEvent.click(screen.getByText('Coach'));
    expect(screen.getByTestId('rb2-describe-submit')).toBeDisabled();
  });

  it('points riders with an empty Planned tab at the Coach tab', () => {
    // With nothing planned the panel opens on Bike, so this is what they see
    // after going looking for their coach's session.
    renderPanel({ onDescribeWorkout: vi.fn() });
    fireEvent.click(screen.getByText('Planned'));
    expect(screen.getByText(/describe one you were given/i)).toBeInTheDocument();
  });
});
