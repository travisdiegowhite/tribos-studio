import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import WeekSummaryGrid from './WeekSummaryGrid';

// Sun Aug 23 2026 — the week the athlete reported. Mon Aug 17 – Sun Aug 23.
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 23, 9, 0, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

const formatTime = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

function renderGrid(props) {
  return render(
    <MantineProvider>
      <WeekSummaryGrid formatTime={formatTime} loading={false} {...props} />
    </MantineProvider>,
  );
}

// The athlete's real Aug 17–23, after the duplicate plan's rows are gone.
const WEEK = [
  { scheduled_date: '2026-08-18', workout_type: 'endurance', target_rss: 70, completed: false },
  { scheduled_date: '2026-08-19', workout_type: 'threshold', target_rss: 90, completed: true },
  { scheduled_date: '2026-08-20', workout_type: 'endurance', target_rss: 70, completed: false },
  { scheduled_date: '2026-08-21', workout_type: 'endurance', target_rss: 146, completed: true },
  { scheduled_date: '2026-08-22', workout_type: 'threshold', target_rss: 95, completed: true },
  { scheduled_date: '2026-08-23', workout_type: 'threshold', target_rss: 90, completed: false },
];

const ACTUAL = { totalTSS: 324, totalTime: 18250, activityCount: 3 };

describe('WeekSummaryGrid', () => {
  it('counts only the seven days Mon–Sun, excluding the following Monday', () => {
    // The regression: `new Date('2026-08-24')` parsed as UTC midnight sat
    // inside a locally-built Sunday-23:59 bound, so next Monday's session was
    // counted and the header read one more session and 165 more planned RSS
    // than the chart directly beneath it.
    renderGrid({
      plannedWorkouts: [
        ...WEEK,
        { scheduled_date: '2026-08-24', workout_type: 'vo2max', target_rss: 165, completed: false },
        { scheduled_date: '2026-08-16', workout_type: 'endurance', target_rss: 134, completed: true },
      ],
      actualWeeklyStats: ACTUAL,
    });

    expect(screen.getByText('3/6')).toBeTruthy();
    expect(screen.getByText('324/561')).toBeTruthy();
    expect(screen.getByText(/You're 3 of 6 sessions into the week's plan, with 3 still ahead\./)).toBeTruthy();
  });

  it('divides completed PLANNED sessions by planned sessions, never activities', () => {
    // Three unplanned rides against two planned sessions used to read 150%.
    renderGrid({
      plannedWorkouts: [
        { scheduled_date: '2026-08-19', workout_type: 'threshold', target_rss: 90, completed: true },
        { scheduled_date: '2026-08-20', workout_type: 'endurance', target_rss: 70, completed: false },
      ],
      actualWeeklyStats: { totalTSS: 300, totalTime: 10800, activityCount: 3 },
    });

    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('takes the RSS numerator from the week, not the 30-day timeRange window', () => {
    // "RSS 1931/871": 1931 was 30 days of actual load shown over one week of plan.
    renderGrid({ plannedWorkouts: WEEK, actualWeeklyStats: ACTUAL });
    expect(screen.getByText('324/561')).toBeTruthy();
    expect(screen.queryByText(/1931/)).toBeNull();
  });

  it('does not count rest days as sessions', () => {
    renderGrid({
      plannedWorkouts: [
        ...WEEK,
        { scheduled_date: '2026-08-17', workout_type: 'rest', target_rss: 0, completed: false },
      ],
      actualWeeklyStats: ACTUAL,
    });
    expect(screen.getByText('3/6')).toBeTruthy();
  });

  it('reports an unplanned week when nothing is scheduled', () => {
    renderGrid({ plannedWorkouts: [], actualWeeklyStats: ACTUAL });
    expect(screen.getByText(/An unplanned week so far/)).toBeTruthy();
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('banks the week when every planned session is done', () => {
    renderGrid({
      plannedWorkouts: WEEK.map((w) => ({ ...w, completed: true })),
      actualWeeklyStats: ACTUAL,
    });
    expect(screen.getByText(/All 6 planned sessions done/)).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
