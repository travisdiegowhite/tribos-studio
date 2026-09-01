import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * tryAutoMatchWorkout's LOCAL-date basis, and its load scoring.
 *
 * The candidate query moved to calendarRead, which binds the service-role
 * singleton rather than the client this function is handed — so the read is
 * mocked and the DATE WINDOW is asserted on its arguments. That window is the
 * whole point of these tests: on a UTC basis a Thursday-evening Denver ride
 * looks like Friday, scores 30 against a 40-point threshold, and silently
 * fails to match the session it obviously was.
 *
 * The active-plan lookup that used to gate this is gone. calendar_entries is
 * keyed on the athlete, so an athlete with no plan can now auto-match — which
 * is the correct behaviour and was impossible before.
 */
const sessionsMock = vi.hoisted(() => vi.fn());
vi.mock('./calendarRead.js', () => ({
  fetchPlannedSessions: (...a) => sessionsMock(...a),
  fetchEntryById: vi.fn(),
  fetchEntryByActivityId: vi.fn(),
}));

const { tryAutoMatchWorkout } = await import('./metricsComputation.js');

/** The query the candidate read was given. */
const window = () => sessionsMock.mock.calls[0][1];

beforeEach(() => {
  sessionsMock.mockReset();
  sessionsMock.mockResolvedValue([]);
});

describe('tryAutoMatchWorkout — local-date basis', () => {
  // Thu 19:30 Denver ride: UTC start_date is Friday. Target 55, actual 90 RSS
  // (63% off → 0 TSS pts), no target_duration (+10). UTC basis: 20 date pts
  // + 0 + 10 = 30 → below the 40 threshold → no match (the reported bug).
  // Local basis: 40 + 0 + 10 = 50 → matched.
  const workout = {
    id: 'w1',
    scheduled_date: '2026-07-23',
    target_rss: 55,
    target_tss: 55,
    target_duration: null,
    workout_type: 'endurance',
    activity_id: null,
  };

  it('matches an evening ride to its LOCAL day workout (UTC basis would fail)', async () => {
    sessionsMock.mockResolvedValue([workout]);
    const activity = {
      start_date: '2026-07-24T01:30:00Z',
      start_date_local: '2026-07-23T19:30:00Z', // Strava fake-UTC local string
      rss: 90,
      moving_time: 4440,
    };

    expect(await tryAutoMatchWorkout(null, 'u1', activity)).toBe('w1');

    // Candidate window derived from the LOCAL date, ±1 day.
    expect(sessionsMock).toHaveBeenCalledWith('u1', expect.anything());
    expect(sessionsMock.mock.calls[0][0]).toBe('u1');
    expect(window()).toMatchObject({ from: '2026-07-22', to: '2026-07-24' });
    // Rest days and races are not candidates for a ride to have fulfilled.
    expect(window().types).toEqual(['workout']);
  });

  it('reads the calendar load for the score', async () => {
    // target 75 vs actual 75 → exact match (30 pts), so it clears the
    // threshold on a day that is otherwise only worth 40 + 10.
    sessionsMock.mockResolvedValue([{ ...workout, target_rss: 75, target_tss: 75 }]);
    const activity = { start_date_local: '2026-07-23T19:30:00Z', rss: 75, moving_time: 4440 };
    expect(await tryAutoMatchWorkout(null, 'u1', activity)).toBe('w1');
  });

  it('falls back to the UTC date when start_date_local is absent (Wahoo)', async () => {
    const activity = { start_date: '2026-07-24T01:30:00Z', rss: 90, moving_time: 4440 };
    await tryAutoMatchWorkout(null, 'u1', activity);
    expect(window()).toMatchObject({ from: '2026-07-23', to: '2026-07-25' });
  });

  it('never matches an entry that already has a ride on it', async () => {
    sessionsMock.mockResolvedValue([{ ...workout, activity_id: 'someone-elses-ride' }]);
    const activity = { start_date_local: '2026-07-23T19:30:00Z', rss: 55, moving_time: 4440 };
    expect(await tryAutoMatchWorkout(null, 'u1', activity)).toBeNull();
  });

  it('returns null when there are no candidates', async () => {
    expect(
      await tryAutoMatchWorkout(null, 'u1', { start_date_local: '2026-07-23T10:00:00Z', rss: 80 }),
    ).toBeNull();
  });
});
