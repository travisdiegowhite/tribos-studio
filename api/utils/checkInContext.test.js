import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * resolvePlannedWorkoutForActivity's fallback chain, now reading the CALENDAR.
 *
 * The three steps are unchanged in spirit and this file still pins each one:
 *   1. Reverse pointer (activities.matched_planned_workout_id).
 *   2. Forward link (the entry's own activity_id).
 *   3. Same-LOCAL-day session, rest days and races excluded.
 *
 * What changed is where they read. calendarRead binds the service-role
 * singleton rather than the client this function is handed, so the reads are
 * mocked here — and mocking them is what makes the ARGUMENTS assertable, which
 * is the part that matters: step 3 getting the local date wrong is how a
 * check-in calls a ride "unplanned" that the calendar shows as matched.
 */
const byId = vi.hoisted(() => vi.fn());
const byActivity = vi.hoisted(() => vi.fn());
const sessions = vi.hoisted(() => vi.fn());
vi.mock('./calendarRead.js', () => ({
  fetchEntryById: (...a) => byId(...a),
  fetchEntryByActivityId: (...a) => byActivity(...a),
  fetchPlannedSessions: (...a) => sessions(...a),
}));

const { resolvePlannedWorkoutForActivity } = await import('./checkInContext.js');

const TZ = 'America/Denver';

beforeEach(() => {
  byId.mockReset().mockResolvedValue(null);
  byActivity.mockReset().mockResolvedValue(null);
  sessions.mockReset().mockResolvedValue([]);
});

describe('resolvePlannedWorkoutForActivity', () => {
  it('uses the reverse pointer when set, and looks no further', async () => {
    byId.mockResolvedValue({ id: 'w9', target_rss: 55, target_tss: 50 });
    const activity = { id: 'a1', matched_planned_workout_id: 'w9' };

    const workout = await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ);

    expect(workout?.id).toBe('w9');
    // Scoped to the athlete as well as the id — this runs on the service-role
    // client, where an unscoped id would happily return someone else's row.
    expect(byId).toHaveBeenCalledWith('u1', 'w9');
    expect(byActivity).not.toHaveBeenCalled();
    expect(sessions).not.toHaveBeenCalled();
  });

  it("falls back to the entry's forward link", async () => {
    byActivity.mockResolvedValue({ id: 'w2', target_tss: 55 });
    const activity = { id: 'a1', matched_planned_workout_id: null };

    const workout = await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ);

    expect(workout?.id).toBe('w2');
    expect(byActivity).toHaveBeenCalledWith('u1', 'a1');
  });

  it('recovers via the forward link when the reverse pointer is dangling', async () => {
    byId.mockResolvedValue(null); // the entry it names was deleted
    byActivity.mockResolvedValue({ id: 'w2' });
    const activity = { id: 'a1', matched_planned_workout_id: 'gone' };

    expect((await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ))?.id).toBe('w2');
  });

  it('falls back to the same-LOCAL-day session, rest days and races excluded', async () => {
    sessions.mockResolvedValue([
      { id: 'w3', workout_type: 'endurance', completed: false, activity_id: null, scheduled_date: '2026-07-23' },
    ]);
    // Strava fake-UTC local string: Thu 19:30 local, UTC start_date is Friday.
    const activity = {
      id: 'a1',
      matched_planned_workout_id: null,
      start_date: '2026-07-24T01:30:00Z',
      start_date_local: '2026-07-23T19:30:00Z',
    };

    const workout = await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ);

    expect(workout?.id).toBe('w3');
    expect(sessions).toHaveBeenCalledWith('u1', {
      from: '2026-07-23',
      to: '2026-07-23',
      types: ['workout'],
    });
  });

  it('prefers the entry linked to this activity, then a completed one', async () => {
    const rows = [
      { id: 'w-open', completed: false, activity_id: null },
      { id: 'w-done', completed: true, activity_id: null },
      { id: 'w-mine', completed: true, activity_id: 'a1' },
    ];
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date_local: '2026-07-23T19:30:00Z' };

    sessions.mockResolvedValue(rows);
    expect((await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ))?.id).toBe('w-mine');

    sessions.mockResolvedValue(rows.slice(0, 2));
    expect((await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ))?.id).toBe('w-done');
  });

  it('derives the local date from the user timezone when start_date_local is absent (Wahoo)', async () => {
    sessions.mockResolvedValue([{ id: 'w4' }]);
    // 01:30 UTC Jul 24 = Jul 23 evening in Denver.
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date: '2026-07-24T01:30:00Z' };

    expect((await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ))?.id).toBe('w4');
    expect(sessions.mock.calls[0][1]).toMatchObject({ from: '2026-07-23', to: '2026-07-23' });
  });

  it('returns null for a null activity or when nothing matches', async () => {
    expect(await resolvePlannedWorkoutForActivity(null, 'u1', null, TZ)).toBeNull();
    const activity = { id: 'a1', matched_planned_workout_id: null, start_date_local: '2026-07-23T10:00:00Z' };
    expect(await resolvePlannedWorkoutForActivity(null, 'u1', activity, TZ)).toBeNull();
  });
});
