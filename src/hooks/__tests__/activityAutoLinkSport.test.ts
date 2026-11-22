import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/calendar/calendarMutations', () => ({ linkEntryToActivity: vi.fn() }));
vi.mock('../../utils/adaptationTrigger', () => ({ triggerAdaptationDetection: vi.fn() }));

const { entryAcceptsActivity, getActivityTSS, pickLinks } = await import('../useActivityAutoLink');

describe('entryAcceptsActivity (multisport phase 3)', () => {
  it('links an activity only to a session of its own sport', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'running' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'cycling' }, 'running')).toBe(false);
  });

  it('infers the sport of an entry that does not store one', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', workout_id: 'run_easy' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout' }, 'cycling')).toBe(true);
  });

  it('never completes a rest day or a note', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'rest' }, 'cycling')).toBe(false);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'note' }, 'running')).toBe(false);
  });

  it('lets either sport complete a multisport race', () => {
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'race', workout_type: 'triathlon' }, 'running')).toBe(true);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'race', workout_type: 'triathlon' }, 'cycling')).toBe(true);
  });
});

describe('entryAcceptsActivity — strength and mobility', () => {
  it('never lets a ride complete gym or mobility work, even one stored as cycling', () => {
    // The 2026-11-20 "Hip Mobility & Flexibility" row: sport cycling, type strength.
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'cycling', workout_type: 'strength' }, 'cycling')).toBe(false);
    expect(entryAcceptsActivity({ id: 'a', entry_type: 'workout', sport: 'cycling', workout_type: 'yoga' }, 'cycling')).toBe(false);
  });
});

describe('getActivityTSS', () => {
  // The 2026-11-20 Zwift ride: 50 min, average 189 W, NP 206 W, FTP 270.
  const zwift = {
    id: 'r1', type: 'Ride', sport_type: 'cycling', moving_time: 3011,
    average_watts: 189, normalized_power: 206, effective_power: 206,
  };

  it('scores a ride on normalized power, not average power', () => {
    expect(getActivityTSS(zwift, 270)).toBe(49);
  });

  it('falls back to kilojoules (average power) when the ride has no NP, as the server does', () => {
    // 189 W × 3011 s = 569 kJ → IF 0.70 → 41.
    expect(getActivityTSS({ ...zwift, normalized_power: null, effective_power: null, kilojoules: 569.1 }, 270)).toBe(41);
  });

  it('scores a run with the run model, not its footpod watts', () => {
    const run = { id: 'run', type: 'Run', sport_type: 'running', moving_time: 2400, distance: 7000, average_watts: 300 };
    const rss = getActivityTSS(run, 270)!;
    expect(rss).toBeGreaterThan(0);
    expect(rss).not.toBe(getActivityTSS({ ...run, type: 'Ride', sport_type: 'cycling' }, 270));
  });

  it('has nothing to say about an activity with no time and no score', () => {
    expect(getActivityTSS({ id: 'x', type: 'Ride', sport_type: 'cycling' }, 270)).toBeNull();
  });

  it('prefers a device score, as the server does', () => {
    expect(getActivityTSS({ ...zwift, rss: 63 }, 270)).toBe(63);
    // ...but not an implausible one
    expect(getActivityTSS({ ...zwift, rss: 0 }, 270)).toBe(49);
    expect(getActivityTSS({ ...zwift, tss: 5000 }, 270)).toBe(49);
  });
});

describe('pickLinks', () => {
  const ride = { id: 'ride-1', type: 'Ride', sport_type: 'cycling', start_date_local: '2026-11-20T04:30:15' };
  const run = { id: 'run-1', type: 'Run', sport_type: 'RUNNING', start_date_local: '2026-11-20T12:31:32' };
  const day = '2026-11-20';

  it('gives the day\'s ride to the session with the most planned load', () => {
    const links = pickLinks([ride], [
      { id: 'easy', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'recovery', target_load: 20 },
      { id: 'sst', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'sweet_spot', target_rss: 55 },
    ]);
    expect(links.map((l) => l.workoutId)).toEqual(['sst']);
  });

  it('skips an activity already linked to any entry, so a ride is never counted twice', () => {
    const links = pickLinks([ride], [
      { id: 'mobility', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'endurance', activity_id: 'ride-1' },
      { id: 'sst', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'sweet_spot', target_load: 55 },
    ]);
    expect(links).toEqual([]);
  });

  it('links a ride and a run on the same day to their own sessions', () => {
    const links = pickLinks([ride, run], [
      { id: 'run-entry', scheduled_date: day, entry_type: 'workout', sport: 'running', target_load: 32 },
      { id: 'mobility', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'strength' },
      { id: 'sst', scheduled_date: day, entry_type: 'workout', sport: 'cycling', workout_type: 'sweet_spot', target_load: 55 },
    ]);
    expect(Object.fromEntries(links.map((l) => [l.activityId, l.workoutId]))).toEqual({
      'ride-1': 'sst',
      'run-1': 'run-entry',
    });
  });
});
