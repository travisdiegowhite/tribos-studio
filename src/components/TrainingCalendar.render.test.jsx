/**
 * A render smoke test for the desktop calendar: real entries through the real
 * adapter, the grid, the day cells and the legend. It guards the file split
 * (src/components/calendar/*) — a moved block that lost a variable renders
 * nothing here, or throws.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { formatLocalDate, addDays } from '../utils/dateUtils';

const today = new Date();
today.setHours(0, 0, 0, 0);
const day = (n) => formatLocalDate(addDays(today, n));

const entries = [
  {
    id: 'e1', user_id: 'u1', date: day(1), slot: 0, type: 'workout', title: 'Sweet Spot Intervals', workout_id: null, workout_type: 'sweet_spot',
    target_load: 55, target_duration_min: 60, status: 'planned', sport: 'cycling', pinned: false, plan_id: null,
    details: { prescription: { version: 1, source: 'designer', predicted_load: 55, warmup_min: 10, cooldown_min: 6, intervals: [{ repeats: 3, duration_min: 12, recovery_min: 4, target_pct_ftp_min: 82, target_pct_ftp_max: 86 }] } },
  },
  { id: 'e2', user_id: 'u1', date: day(2), slot: 0, type: 'workout', title: 'Easy Aerobic Run', workout_id: 'run_easy_aerobic', workout_type: 'endurance', target_load: 40, target_duration_min: 40, status: 'planned', sport: 'running', pinned: false, plan_id: null, details: null },
  { id: 'e3', user_id: 'u1', date: day(3), slot: 0, type: 'rest', title: 'Rest', workout_id: null, workout_type: 'rest', target_load: 0, target_duration_min: 0, status: 'planned', sport: null, pinned: false, plan_id: null, details: null },
];

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/calendar/getCalendarRange', () => ({ getCalendarRange: vi.fn(async () => ({ entries })) }));
vi.mock('../lib/calendar/calendarProposals', async (orig) => ({ ...(await orig()), listPendingProposals: vi.fn(async () => []) }));
vi.mock('../hooks/useWeatherForecast', () => ({ useWeatherForecast: () => ({ forecast: {} }) }));
vi.mock('../hooks/useActivityAutoLink', () => ({ useActivityAutoLink: () => {} }));
vi.mock('../hooks/useUserAvailability', () => ({ useUserAvailability: () => ({ weeklyAvailability: [], dateOverrides: [], preferences: null }) }));
vi.mock('../hooks/useTrainingPlan', () => ({ useTrainingPlan: () => ({ reshufflePlan: vi.fn() }) }));
vi.mock('../hooks/useWorkoutAdaptations', () => ({
  useWorkoutAdaptations: () => ({ adaptations: [], insights: [], loading: false, fetchAdaptations: vi.fn(), getWeekSummary: vi.fn(async () => null), updateAdaptationFeedback: vi.fn(), dismissInsight: vi.fn(), applyInsight: vi.fn() }),
}));
vi.mock('../hooks/useCrossTraining', async (orig) => ({ ...(await orig()), useCrossTraining: () => ({ fetchActivities: vi.fn(async () => []), activities: [], activityTypes: [], fetchActivityTypes: vi.fn(), createActivity: vi.fn(), updateActivity: vi.fn(), deleteActivity: vi.fn(), loading: false }) }));
vi.mock('../hooks/useRunThresholds', () => ({ useRunThresholds: () => ({ lthr: null, maxHr: null, thresholdPaceSec: 300 }) }));
vi.mock('./coach', () => ({ useCoachCommandBar: () => ({ open: vi.fn() }) }));
// race_goals: an empty chainable query (the global supabase mock has no .gte).
vi.mock('../lib/supabase', () => {
  const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, lt: () => q, order: () => q, in: () => q, is: () => q, neq: () => q, limit: () => q, then: (r) => Promise.resolve({ data: [], error: null }).then(r) };
  return { supabase: { from: () => q, auth: { getSession: async () => ({ data: { session: null } }) } } };
});
vi.mock('./planner/WorkoutLibrarySidebar', () => ({ WorkoutLibrarySidebar: () => null }));

import TrainingCalendar from './TrainingCalendar';

const ride = { id: 'r1', name: 'Lunch Loop', type: 'Ride', sport_type: 'cycling', start_date: `${day(0)}T06:00:00`, start_date_local: `${day(0)}T06:00:00`, distance: 30000, moving_time: 3600, rss: 52 };

function renderCalendar() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <TrainingCalendar activePlan={null} rides={[ride]} ftp={250} formatDistance={(km) => `${km.toFixed(1)} km`} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('TrainingCalendar (desktop grid)', () => {
  it('draws planned sessions, a ride, a rest day and the legend', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByText('Sweet Spot Intervals')).toBeTruthy());
    expect(screen.getByText('Easy Aerobic Run')).toBeTruthy();
    // The ride's day carries its load (the shared estimator: its stored rss).
    expect(screen.getByText('52 RSS')).toBeTruthy();
    expect(screen.getAllByTestId('session-profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/rest/i).length).toBeGreaterThan(0);
  });

  it('shows the four-week header with navigation', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByText('Sweet Spot Intervals')).toBeTruthy());
    expect(screen.getAllByRole('button').length).toBeGreaterThan(5);
  });

  it('lifts a session on the first tap and opens it on a second tap of its day', async () => {
    renderCalendar();
    await waitFor(() => expect(screen.getByText('Sweet Spot Intervals')).toBeTruthy());
    fireEvent.click(screen.getByText('Sweet Spot Intervals'));
    // The held bar says it is picked up.
    await waitFor(() => expect(screen.getByText(/tap any day to place it/)).toBeTruthy());
    // The held bar repeats the name; tap the one in the grid.
    fireEvent.click(screen.getAllByText('Sweet Spot Intervals').at(-1));
    await waitFor(() => expect(screen.getByText('Workout profile')).toBeTruthy());
  });
});
