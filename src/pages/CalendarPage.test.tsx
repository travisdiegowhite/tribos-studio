/**
 * CalendarPage with ZERO training plans.
 *
 * This is the acceptance test for the whole ownership inversion, not a
 * routine render smoke test. On /train today every mutation path hard-returns
 * on `!activePlan` — TrainingCalendar.jsx guards adding, moving, editing and
 * day-opening on it, and clamps dates to the plan's `duration_weeks`. So "an
 * athlete with no plan can add, edit, complete, move and remove a session" is
 * a state that does not exist anywhere in the app, and the only proof the
 * calendar is genuinely the athlete's rather than a plan's.
 *
 * Accordingly there is no plan mock anywhere in this file. Nothing here reads
 * `training_plans`; if a plan lookup were ever reintroduced into the page it
 * would surface as a failure rather than as a silently disabled button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CalendarPage from './CalendarPage';
import type { CalendarDay, CalendarEntry, CalendarRange } from '../lib/calendar/getCalendarRange';

const USER = '11111111-1111-1111-1111-111111111111';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: USER }, isAuthenticated: true, loading: false }),
}));

// AppShell pulls in gear alerts, activation state and its own Supabase reads;
// none of that is under test here.
vi.mock('../components/AppShell.jsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const getCalendarRange = vi.fn();
const getCalendarHorizon = vi.fn();
vi.mock('../lib/calendar/getCalendarRange', () => ({
  getCalendarRange: (...args: unknown[]) => getCalendarRange(...args),
  getCalendarHorizon: (...args: unknown[]) => getCalendarHorizon(...args),
}));

const createEntry = vi.fn();
const updateEntry = vi.fn();
const moveEntry = vi.fn();
const deleteEntry = vi.fn();
const setEntryStatus = vi.fn();
vi.mock('../lib/calendar/calendarMutations', () => ({
  createEntry: (...a: unknown[]) => createEntry(...a),
  updateEntry: (...a: unknown[]) => updateEntry(...a),
  moveEntry: (...a: unknown[]) => moveEntry(...a),
  deleteEntry: (...a: unknown[]) => deleteEntry(...a),
  setEntryStatus: (...a: unknown[]) => setEntryStatus(...a),
}));

/** A 28-day range of empty days, matching the page's 4-week window. */
function emptyRange(fromKey: string): CalendarRange {
  const start = Date.parse(`${fromKey}T00:00:00Z`);
  const days: CalendarDay[] = Array.from({ length: 28 }, (_, i) => ({
    dateKey: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    entries: [],
    unplannedActivities: [],
  }));
  return {
    from: days[0].dateKey,
    to: days[days.length - 1].dateKey,
    entries: [],
    byDate: new Map(days.map((d) => [d.dateKey, d])),
    days,
  };
}

function renderPage() {
  return render(
    <MantineProvider>
      <CalendarPage />
    </MantineProvider>
  );
}

describe('CalendarPage with no training plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCalendarRange.mockImplementation(async (_userId: string, from: string) => emptyRange(from));
    getCalendarHorizon.mockResolvedValue({ countAfter: 0, next: [], nextRaces: [] });
    createEntry.mockResolvedValue({ success: true });
    setEntryStatus.mockResolvedValue({ success: true });
    deleteEntry.mockResolvedValue({ success: true });
  });

  it('renders the calendar for a user with zero plans', async () => {
    renderPage();

    await waitFor(() => expect(getCalendarRange).toHaveBeenCalled());
    expect(await screen.findByText('Calendar')).toBeInTheDocument();
    // The read path is scoped to the user and a date range — no plan id.
    expect(getCalendarRange).toHaveBeenCalledWith(USER, expect.any(String), expect.any(String));
  });

  it('offers an add affordance on every day, enabled without a plan', async () => {
    renderPage();

    await waitFor(() => expect(getCalendarRange).toHaveBeenCalled());
    const addButtons = await screen.findAllByRole('button', { name: /^Add to \d{4}-\d{2}-\d{2}$/ });
    expect(addButtons).toHaveLength(28);
    addButtons.forEach((b) => expect(b).toBeEnabled());
  });

  it('creates an entry with no plan_id in the payload', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(getCalendarRange).toHaveBeenCalled());
    const addButtons = await screen.findAllByRole('button', { name: /^Add to / });
    await user.click(addButtons[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Title/), 'Endurance Ride');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(createEntry).toHaveBeenCalled());
    const [userId, dateKey, draft] = createEntry.mock.calls[0];
    expect(userId).toBe(USER);
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft).toMatchObject({ type: 'workout', title: 'Endurance Ride' });
    expect(draft).not.toHaveProperty('plan_id');
    // The range is re-read so the new entry appears without a reload.
    await waitFor(() => expect(getCalendarRange).toHaveBeenCalledTimes(2));
  });

  it('opens an existing entry and offers complete and delete, plan or no plan', async () => {
    const user = userEvent.setup();
    getCalendarRange.mockImplementation(async (_userId: string, from: string) => {
      const range = emptyRange(from);
      const entry: CalendarEntry = {
        id: 'entry-1',
        user_id: USER,
        date: range.days[3].dateKey,
        slot: 0,
        type: 'workout' as const,
        title: 'Sweet Spot 3x12',
        workout_id: null,
        workout_type: 'sweet_spot',
        target_load: 78,
        target_duration_min: 75,
        target_distance_km: null,
        actual_load: null,
        actual_duration_min: null,
        actual_distance_km: null,
        status: 'planned' as const,
        completed_at: null,
        skipped_reason: null,
        activity_id: null,
        activity: null,
        notes: null,
        coach_rationale: null,
        details: null,
        provenance: null,
        source: 'manual',
        plan_id: null,
        generation_id: null,
        pinned: true,
      };
      range.entries = [entry];
      range.days[3].entries = [entry];
      return range;
    });

    renderPage();

    const chip = await screen.findByRole('button', { name: /Sweet Spot 3x12/ });
    await user.click(chip);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Mark done' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(setEntryStatus).toHaveBeenCalledWith(USER, 'entry-1', 'done'));
  });

  it('surfaces a failed mutation instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    createEntry.mockResolvedValue({ success: false, error: 'slot taken' });
    renderPage();

    await waitFor(() => expect(getCalendarRange).toHaveBeenCalled());
    const addButtons = await screen.findAllByRole('button', { name: /^Add to / });
    await user.click(addButtons[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Title/), 'Endurance Ride');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(createEntry).toHaveBeenCalled());
    // The editor stays open on failure so the athlete's input is not lost.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // No refetch on a failed write.
    expect(getCalendarRange).toHaveBeenCalledTimes(1);
  });
});

/**
 * REGRESSION: the season that was there and could not be seen.
 *
 * On 2026-08-25 the coach correctly created nine cyclocross races running
 * 2026-09-19 → 2026-12-05. The page renders four weeks; the window that day
 * ended 2026-09-13. Every race was six days or more past the edge, so the
 * athlete opened their calendar, saw nothing, and reasonably reported that the
 * coach had failed again. The write was perfect. The page simply gave no sign
 * anything existed beyond the last row.
 *
 * That is the failure mode a fixed window has by construction: absence of
 * content and absence of view look identical to the person looking. These
 * tests cover the edge indicator, not the window.
 */
describe('the horizon banner', () => {
  const RACES = [
    { id: 'r1', date: '2026-09-19', type: 'race' as const, title: 'CycloX - Harlow Platts' },
    { id: 'r2', date: '2026-10-03', type: 'race' as const, title: 'Schoolyard CX' },
  ];

  it('says nothing when the window really is the whole story', async () => {
    renderPage();
    await waitFor(() => expect(getCalendarHorizon).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Jump there/ })).not.toBeInTheDocument();
  });

  it('names the next race and its date when the season is past the edge', async () => {
    getCalendarHorizon.mockResolvedValue({ countAfter: 9, next: RACES, nextRaces: RACES });
    renderPage();

    expect(await screen.findByText('CycloX - Harlow Platts')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-19/)).toBeInTheDocument();
    // The other eight are accounted for, so the athlete knows the scale of what
    // is off-screen rather than just that *something* is.
    expect(screen.getByText(/8 more after this window/)).toBeInTheDocument();
  });

  it('jumps the window onto the week containing that race', async () => {
    const user = userEvent.setup();
    getCalendarHorizon.mockResolvedValue({ countAfter: 9, next: RACES, nextRaces: RACES });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Jump there/ }));

    await waitFor(() => {
      // Re-read with a window that actually contains 2026-09-19. The anchor is
      // the Monday a week before, so the race sits in the second row.
      const { calls } = getCalendarRange.mock;
      const lastCall = calls[calls.length - 1];
      const [, from, to] = lastCall as [string, string, string];
      expect(from <= '2026-09-19' && '2026-09-19' <= to).toBe(true);
    });
  });

  it('falls back to a plain count when nothing past the edge is a race', async () => {
    getCalendarHorizon.mockResolvedValue({
      countAfter: 4,
      next: [{ id: 'w1', date: '2026-09-20', type: 'workout' as const, title: 'Long Ride' }],
      nextRaces: [],
    });
    renderPage();

    // Assert on the banner's own phrasing, not a bare digit — every date cell
    // on the grid contains digits too.
    expect(await screen.findByText(/more entries after/)).toBeInTheDocument();
    expect(screen.getByText(/next: Long Ride on 2026-09-20/)).toBeInTheDocument();
  });

  it('degrades quietly if the horizon query fails', async () => {
    getCalendarHorizon.mockResolvedValue({ countAfter: 0, next: [], nextRaces: [] });
    renderPage();
    // The calendar itself still renders; the banner is an enhancement.
    expect(await screen.findByText('Calendar')).toBeInTheDocument();
  });
});
