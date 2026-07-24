import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import CheckInWeekBar, { computeWeekTotals, type DayData } from './CheckInWeekBar';

// Thu Jul 23 2026 — current week Mon Jul 20 – Sun Jul 26.
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 23, 12, 0, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

function day(overrides: Partial<DayData> & { label: string }): DayData {
  return {
    dateKey: '2026-07-20',
    planned: 0,
    actual: 0,
    diff: 0,
    isToday: false,
    isPast: false,
    ...overrides,
  };
}

describe('computeWeekTotals', () => {
  it('measures the delta against plan TO DATE, not the full week', () => {
    // The reported Thursday: full-week plan 410 vs actual 202 read as
    // "-208 TSS (49%)" — but only Mon–Thu were due (175 planned, 202 done).
    const days: DayData[] = [
      day({ label: 'Mon', planned: 55, actual: 43, isPast: true }),
      day({ label: 'Tue', planned: 65, actual: 84, isPast: true }),
      day({ label: 'Wed', planned: 0, actual: 0, isPast: true }),
      day({ label: 'Thu', planned: 55, actual: 75, isToday: true }),
      day({ label: 'Fri', planned: 110, actual: 0 }),
      day({ label: 'Sat', planned: 55, actual: 0 }),
      day({ label: 'Sun', planned: 70, actual: 0 }),
    ];
    const t = computeWeekTotals(days);
    expect(t.totalPlanned).toBe(410);
    expect(t.totalActual).toBe(202);
    expect(t.plannedToDate).toBe(175);
    expect(t.actualToDate).toBe(202);
    expect(t.diffToDate).toBe(27); // ahead of plan, not -208 behind
    expect(t.pctToDate).toBe(115);
  });

  it('returns a null percent when no planned work is due yet', () => {
    const days: DayData[] = [
      day({ label: 'Mon', planned: 0, actual: 30, isToday: true }),
      day({ label: 'Tue', planned: 60 }),
    ];
    const t = computeWeekTotals(days);
    expect(t.plannedToDate).toBe(0);
    expect(t.pctToDate).toBeNull();
    expect(t.actualToDate).toBe(30);
  });
});

describe('CheckInWeekBar rendering', () => {
  it("keys an evening ride by its LOCAL date and shows the to-date delta", () => {
    // Thu 19:30 local ride whose UTC start_date is Friday — must land on the
    // Thursday cell (55/75), and the footer must read vs plan to date.
    render(
      <MantineProvider>
        <CheckInWeekBar
          plannedWorkouts={[
            { scheduled_date: '2026-07-20', target_rss: 55 },
            { scheduled_date: '2026-07-23', target_rss: 55 },
            { scheduled_date: '2026-07-24', target_rss: 110 },
          ]}
          activities={[
            { start_date: '2026-07-21T02:30:00Z', start_date_local: '2026-07-20T19:30:00Z', tss: 43 },
            { start_date: '2026-07-24T01:30:00Z', start_date_local: '2026-07-23T19:30:00Z', tss: 75 },
          ]}
          ftp={250}
        />
      </MantineProvider>,
    );

    expect(screen.getByText('55/75')).toBeTruthy(); // Thursday: plan 55, actual 75
    expect(screen.getByText('55/43')).toBeTruthy(); // Monday
    expect(screen.getByText(/vs plan to date/)).toBeTruthy();
    // To-date: planned 110 (Mon+Thu), actual 118 → +8, teal, not a -110 deficit.
    expect(screen.getByText(/\+8 TSS vs plan to date/)).toBeTruthy();
  });
});
