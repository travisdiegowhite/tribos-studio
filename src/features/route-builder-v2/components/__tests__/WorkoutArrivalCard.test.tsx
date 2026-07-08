import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WorkoutArrivalCard, type PastRideOption } from '../WorkoutArrivalCard';

const RIDES: PastRideOption[] = [
  { id: 'a1', name: 'Morning Loop', startDate: '2026-07-01T09:00:00Z', distanceKm: 42.3 },
  { id: 'a2', name: null, startDate: null, distanceKm: null },
];

function renderCard(overrides: Partial<React.ComponentProps<typeof WorkoutArrivalCard>> = {}) {
  const props = {
    workoutLabel: 'Sweet Spot 3x12',
    detailLabel: '75 min · ~40 km',
    onChooseNew: vi.fn(),
    onChooseSaved: vi.fn(),
    onLoadPastRides: vi.fn(),
    pastRides: RIDES,
    pastRidesLoading: false,
    onPickPastRide: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(
    <MantineProvider>
      <WorkoutArrivalCard {...props} />
    </MantineProvider>,
  );
  return props;
}

describe('WorkoutArrivalCard', () => {
  it('renders the workout context and the three options', () => {
    renderCard();
    expect(screen.getByTestId('rb2-workout-arrival-title')).toHaveTextContent('Sweet Spot 3x12');
    expect(screen.getByText('75 min · ~40 km')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-workout-arrival-new')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-workout-arrival-saved')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-workout-arrival-past')).toBeInTheDocument();
  });

  it('passes the typed start-location preference to onChooseNew', () => {
    const props = renderCard();
    fireEvent.change(screen.getByTestId('rb2-workout-arrival-start'), {
      target: { value: '  Boulder, CO ' },
    });
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-new'));
    expect(props.onChooseNew).toHaveBeenCalledWith('Boulder, CO');
  });

  it('calls onChooseNew with an empty string when no preference is typed', () => {
    const props = renderCard();
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-new'));
    expect(props.onChooseNew).toHaveBeenCalledWith('');
  });

  it('forwards the saved-route and dismiss choices', () => {
    const props = renderCard();
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-saved'));
    expect(props.onChooseSaved).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-dismiss'));
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it('opens the past-ride step lazily and picks a ride', () => {
    const props = renderCard();
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-past'));
    expect(props.onLoadPastRides).toHaveBeenCalled();
    expect(screen.getByTestId('rb2-workout-arrival-ride-a1')).toHaveTextContent('Morning Loop');
    expect(screen.getByTestId('rb2-workout-arrival-ride-a2')).toHaveTextContent('Untitled ride');
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-ride-a1'));
    expect(props.onPickPastRide).toHaveBeenCalledWith('a1');
  });

  it('shows an empty message when there are no past rides, and can go back', () => {
    renderCard({ pastRides: [] });
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-past'));
    expect(screen.getByTestId('rb2-workout-arrival-past-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rb2-workout-arrival-back'));
    expect(screen.getByTestId('rb2-workout-arrival-new')).toBeInTheDocument();
  });
});
