import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  raceDistanceKey,
  isRace,
  raceTimeSeconds,
  planPrUpserts,
  formatRaceTime,
  scanRunRacePrs,
  resetRacePrColumnFallback,
  FIRST_SCAN_DAYS,
  DEFAULT_SCAN_DAYS,
} from './runRacePrs.js';

const run = (o = {}) => ({
  id: 'r1',
  name: 'Morning Run',
  type: 'Run',
  sport_type: 'Run',
  start_date: '2026-05-02T14:00:00Z',
  distance: 5020,
  moving_time: 1290,
  elapsed_time: 1300,
  workout_type: 1,
  ...o,
});

describe('raceDistanceKey', () => {
  it('maps watch distances into bands', () => {
    expect(raceDistanceKey(5000)).toBe('5k');
    expect(raceDistanceKey(5350)).toBe('5k');
    expect(raceDistanceKey(10200)).toBe('10k');
    expect(raceDistanceKey(21300)).toBe('half_marathon');
    expect(raceDistanceKey(42400)).toBe('marathon');
    expect(raceDistanceKey(8000)).toBeNull();
    expect(raceDistanceKey(null)).toBeNull();
  });
});

describe('isRace', () => {
  it('trusts the Strava race flag, raw or selected', () => {
    expect(isRace(run(), new Set())).toBe(true);
    expect(isRace(run({ workout_type: undefined, raw_data: { workout_type: 1 } }), new Set())).toBe(true);
    expect(isRace(run({ workout_type: 0 }), new Set())).toBe(false);
  });

  it('counts a run on a season race day in the athlete timezone', () => {
    // 2026-05-03T02:00Z is still May 2 in Denver.
    const a = run({ workout_type: null, start_date: '2026-05-03T02:00:00Z' });
    expect(isRace(a, new Set(['2026-05-02']), 'America/Denver')).toBe(true);
    expect(isRace(a, new Set(['2026-05-02']), 'UTC')).toBe(false);
  });
});

describe('raceTimeSeconds', () => {
  it('prefers clock time', () => {
    expect(raceTimeSeconds(run())).toBe(1300);
    expect(raceTimeSeconds(run({ elapsed_time: null }))).toBe(1290);
    expect(raceTimeSeconds(run({ elapsed_time: null, moving_time: 0 }))).toBeNull();
  });
});

describe('planPrUpserts', () => {
  it('writes the fastest race per distance', () => {
    const rows = planPrUpserts([run(), run({ id: 'r2', elapsed_time: 1280 }), run({ id: 'r3', workout_type: 0, elapsed_time: 1100 })], new Set());
    expect(rows).toEqual([
      { distance: '5k', time_seconds: 1280, race_date: '2026-05-02', race_name: 'Morning Run', activity_id: 'r2' },
    ]);
  });

  it('keeps a faster stored PR, manual or not', () => {
    expect(planPrUpserts([run()], new Set(), [{ distance: '5k', time_seconds: 1250 }])).toEqual([]);
    expect(planPrUpserts([run()], new Set(), [{ distance: '5k', time_seconds: 1400 }])).toHaveLength(1);
  });

  it('names a season race from its goal and drops implausible times', () => {
    const rows = planPrUpserts(
      [run({ workout_type: null }), run({ id: 'w', distance: 10100, elapsed_time: 9000 })],
      new Set(['2026-05-02']),
      [],
      { raceNames: new Map([['2026-05-02', 'City 5K']]) },
    );
    expect(rows).toEqual([expect.objectContaining({ distance: '5k', race_name: 'City 5K' })]);
  });
});

describe('formatRaceTime', () => {
  it('formats minutes and hours', () => {
    expect(formatRaceTime(1300)).toBe('21:40');
    expect(formatRaceTime(6070)).toBe('1:41:10');
    expect(formatRaceTime(0)).toBe('--');
  });
});

function fakeSupabase({ prs = [], runs = [], goals = [], upsertError = null } = {}) {
  const calls = { upserts: [], activitySince: null };
  const from = (table) => {
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      is: () => q,
      in: () => q,
      lte: () => q,
      limit: () => q,
      gte: (col, v) => {
        if (table === 'activities' && col === 'start_date') calls.activitySince = v;
        return q;
      },
      upsert: async (payload) => {
        calls.upserts.push(payload);
        return { error: upsertError };
      },
      then: (resolve) =>
        resolve({
          data: table === 'running_race_prs' ? prs : table === 'activities' ? runs : goals,
          error: null,
        }),
    };
    return q;
  };
  return { client: { from }, calls };
}

describe('scanRunRacePrs', () => {
  beforeEach(() => resetRacePrColumnFallback());
  const NOW = new Date('2026-05-10T12:00:00Z');

  it('looks back further on the first scan and writes auto PRs', async () => {
    const { client, calls } = fakeSupabase({ runs: [run(), { ...run({ id: 'b' }), type: 'Ride', sport_type: 'Ride' }] });
    const result = await scanRunRacePrs(client, 'u1', { now: NOW });
    expect(result).toEqual({ written: 1, scannedDays: FIRST_SCAN_DAYS });
    expect(calls.upserts[0]).toEqual([
      expect.objectContaining({ user_id: 'u1', distance: '5k', time_seconds: 1300, source: 'auto', activity_id: 'r1' }),
    ]);
  });

  it('uses the short window once PRs exist and writes nothing when not faster', async () => {
    const { client, calls } = fakeSupabase({ prs: [{ distance: '5k', time_seconds: 1200 }], runs: [run()] });
    const result = await scanRunRacePrs(client, 'u1', { now: NOW });
    expect(result).toEqual({ written: 0, scannedDays: DEFAULT_SCAN_DAYS });
    expect(calls.upserts).toEqual([]);
    expect(calls.activitySince).toBe(new Date(NOW.getTime() - DEFAULT_SCAN_DAYS * 86400000).toISOString());
  });

  it('retries without source when migration 136 is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let first = true;
    const { client, calls } = fakeSupabase({ runs: [run()] });
    const base = client.from;
    client.from = (t) => {
      const q = base(t);
      if (t !== 'running_race_prs') return q;
      const upsert = q.upsert;
      q.upsert = async (p) => {
        await upsert(p);
        if (first) {
          first = false;
          return { error: { message: "Could not find the 'source' column of 'running_race_prs' in the schema cache" } };
        }
        return { error: null };
      };
      return q;
    };
    const result = await scanRunRacePrs(client, 'u1', { now: NOW });
    expect(result.written).toBe(1);
    expect(calls.upserts).toHaveLength(2);
    expect(calls.upserts[1][0]).not.toHaveProperty('source');
  });
});
