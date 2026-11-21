import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import MobileCalendarAgenda from './MobileCalendarAgenda';
import { formatLocalDate } from '../../utils/dateUtils';

const start = new Date(2026, 10, 16); // Mon 16 Nov 2026, local
const days = Array.from({ length: 28 }, (_, i) => new Date(2026, 10, 16 + i));
const key = (d) => formatLocalDate(d);

const entries = {
  '2026-11-20': [
    {
      id: 'sst', scheduled_date: '2026-11-20', name: 'Sweet Spot Intervals', workout_type: 'sweet_spot', sport: 'cycling',
      target_duration: 60, target_rss: 55, actual_rss: 49, actual_duration: 50, activity_id: 'a1', status: 'done', completed: true,
      details: { prescription: { version: 1, source: 'designer', predicted_load: 55, warmup_min: 10, cooldown_min: 6, intervals: [{ repeats: 3, duration_min: 12, recovery_min: 4, target_pct_ftp_min: 88, target_pct_ftp_max: 92 }] } },
    },
    { id: 'mob', scheduled_date: '2026-11-20', name: 'Hip Mobility & Flexibility', workout_type: 'strength', sport: 'other', target_duration: 20, status: 'planned' },
  ],
  '2026-11-22': [
    { id: 'lr', scheduled_date: '2026-11-22', name: 'Long Run', workout_id: 'run_long_run', workout_type: 'endurance', sport: 'running', target_duration: 90, target_rss: 83, status: 'planned' },
  ],
};
const rides = {
  '2026-11-18': [{ id: 'r9', name: 'Lunch Ride', type: 'Ride', sport_type: 'cycling', distance: 23000, rss: 36 }],
};

function renderAgenda(over = {}) {
  const props = {
    days,
    getWorkoutsForDate: (d) => entries[key(d)] ?? [],
    getRidesForDate: (d) => rides[key(d)] ?? [],
    getRaceGoalForDate: () => null,
    weatherForecast: {},
    getWeatherIcon: () => null,
    formatDistance: (km) => `${km.toFixed(1)} km`,
    formatTemperature: (t) => `${t}°F`,
    isImperial: true,
    todayKey: '2026-11-21',
    thresholdPaceSec: 347,
    heldEntryId: null,
    placing: false,
    onOpenSession: vi.fn(),
    onDayTap: vi.fn(),
    onToggleDone: vi.fn(),
    onLift: vi.fn(),
    onOpenRace: vi.fn(),
    ...over,
  };
  render(
    <MantineProvider>
      <MobileCalendarAgenda {...props} />
    </MantineProvider>,
  );
  return props;
}

describe('MobileCalendarAgenda', () => {
  it('draws one row per day across four weeks', () => {
    renderAgenda();
    expect(screen.getAllByTestId('agenda-day')).toHaveLength(28);
    expect(screen.getByText(/NOV 16 – 22/)).toBeTruthy();
    expect(start.getDay()).toBe(1);
  });

  it('shows whole session titles with actual and planned stress', () => {
    renderAgenda();
    expect(screen.getByText('Sweet Spot Intervals')).toBeTruthy();
    expect(screen.getByText('49/55 RSS')).toBeTruthy();
    expect(screen.getByText('Long Run')).toBeTruthy();
  });

  it('marks a done session with its compliance strip', () => {
    renderAgenda();
    const card = screen.getByText('Sweet Spot Intervals').closest('[data-testid="agenda-session"]');
    expect(within(card).getByTestId('compliance-strip').getAttribute('data-band')).toBe('on_target');
  });

  it('opens a session on tap, and does not treat it as a day tap', () => {
    const props = renderAgenda();
    fireEvent.click(screen.getByText('Long Run'));
    expect(props.onOpenSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'lr' }), expect.any(Date));
    expect(props.onDayTap).not.toHaveBeenCalled();
  });

  it('lifts a session from its move button', () => {
    const props = renderAgenda();
    const card = screen.getByText('Long Run').closest('[data-testid="agenda-session"]');
    fireEvent.click(within(card).getByLabelText('Move this session'));
    expect(props.onLift).toHaveBeenCalledWith('lr');
    expect(props.onOpenSession).not.toHaveBeenCalled();
  });

  it('hands an empty day to the calendar to add or place', () => {
    const props = renderAgenda();
    const tue = screen.getAllByTestId('agenda-day')[8]; // Tue 24 Nov
    fireEvent.click(tue);
    expect(key(props.onDayTap.mock.calls[0][0])).toBe('2026-11-24');
  });

  it('lists an activity that completed no session as its own line', () => {
    renderAgenda();
    expect(screen.getByText('Lunch Ride')).toBeTruthy();
    expect(screen.getByText('23.0 km · 36 RSS')).toBeTruthy();
  });
});
