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
import type { CalendarRange } from '../lib/calendar/getCalendarRange';

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
vi.mock('../lib/calendar/getCalendarRange', () => ({
  getCalendarRange: (...args: unknown[]) => getCalendarRange(...args),
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
  return {
    entries: [],
    activities: [],
    days: Array.from({ length: 28 }, (_, i) => ({
      dateKey: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      entries: [],
      unplannedActivities: [],
    })),
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
      const entry = {
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
        actual_load: null,
        actual_duration_min: null,
        status: 'planned' as const,
        completed_at: null,
        activity_id: null,
        notes: null,
        coach_rationale: null,
        details: null,
        provenance: null,
        source: 'manual',
        plan_id: null,
        generation_id: null,
        pinned: true,
        created_at: '2026-08-25T00:00:00Z',
        updated_at: '2026-08-25T00:00:00Z',
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
