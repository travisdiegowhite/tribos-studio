import { describe, it, expect, vi } from 'vitest';
import {
  computeTrainingLoadRows,
  recomputeTrainingLoadForUser,
  fetchSeedState,
  localDateKey,
  apportionSeed,
  isMissingSplitColumnError,
  resetSplitColumnsFallback,
  SPLIT_COLUMNS,
} from './trainingLoadRecompute.js';

// Fixed "now": 2026-07-10 15:00 UTC = 2026-07-10 09:00 in America/Denver.
const NOW = new Date('2026-07-10T15:00:00Z');
const TZ = 'America/Denver';

/**
 * Table-aware supabase mock. Each from(table) chain records filters and
 * resolves with the provided rows; upserts are captured for assertions.
 * `priorRow` is what the training_load_daily seed lookup returns (null =
 * true cold start). The activities `then` respects `.range()` pagination.
 */
function mockSupabase({ profile = {}, activities = [], priorRow = null } = {}) {
  const upserts = [];
  const client = {
    upserts,
    from(table) {
      const builder = {
        _table: table,
        _range: null,
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        is: () => builder,
        lt: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        range: (from, to) => {
          builder._range = [from, to];
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve(
            table === 'training_load_daily'
              ? { data: priorRow, error: null }
              : { data: { timezone: TZ, ftp: 250, tfi_tau: 42, afi_tau: 7, ...profile } },
          ),
        upsert: (rows, opts) => {
          upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
        then: (resolve) => {
          let data = table === 'activities' ? activities : [];
          if (table === 'activities' && builder._range) {
            data = data.slice(builder._range[0], builder._range[1] + 1);
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return client;
}

function ride(dateIso, rss, extra = {}) {
  return {
    start_date: dateIso,
    type: 'Ride',
    sport_type: 'Ride',
    moving_time: 3600,
    distance: 30000,
    total_elevation_gain: 100,
    rss, // Tier 1 (device) — deterministic, no terrain multiplier
    ...extra,
  };
}

describe('computeTrainingLoadRows', () => {
  it('writes through yesterday (user-local), never today', async () => {
    const supabase = mockSupabase();
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 10, now: NOW });
    expect(rows).toHaveLength(10);
    expect(rows[rows.length - 1].date).toBe('2026-07-09'); // yesterday in Denver
    expect(rows.some((r) => r.date === '2026-07-10')).toBe(false);
  });

  it('runs the EWA with the athlete adaptive tau and stored device RSS', async () => {
    // One 84-RSS ride on 2026-07-08 (Denver local). tau 46/8.
    const supabase = mockSupabase({
      profile: { tfi_tau: 46, afi_tau: 8 },
      activities: [ride('2026-07-08T16:00:00Z', 84)],
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    // Window: Jul 6, 7, 8, 9. Cold start 0.
    expect(rows.map((r) => r.date)).toEqual(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']);
    const tfiAfterRide = 0 + (84 - 0) / 46; // day 3
    expect(rows[2].tfi).toBeCloseTo(tfiAfterRide, 2);
    expect(rows[2].afi).toBeCloseTo(84 / 8, 2);
    expect(rows[2].rss_source).toBe('device');
    // Day 4 decays from day 3.
    expect(rows[3].tfi).toBeCloseTo(tfiAfterRide + (0 - tfiAfterRide) / 46, 2);
    expect(rows[3].tfi_tau).toBe(46);
    expect(rows[3].afi_tau).toBe(8);
  });

  it('form_score uses yesterday state (spec §3.6); first row falls back to same-day', async () => {
    const supabase = mockSupabase({ activities: [ride('2026-07-08T16:00:00Z', 84)] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    // Ride day: yesterday was all-zero → FS 0, not the post-ride negative.
    expect(rows[2].form_score).toBe(0);
    // Day after the ride: FS = ride-day tfi − afi.
    expect(rows[3].form_score).toBeCloseTo(rows[2].tfi - rows[2].afi, 2);
    // First row of the window: same-day fallback (0 − 0 here).
    expect(rows[0].form_score).toBe(0);
  });

  it('buckets by the user local calendar day, not UTC', async () => {
    // 03:00 UTC Jul 2 = 21:00 Jul 1 in Denver.
    const supabase = mockSupabase({
      activities: [ride('2026-07-02T03:00:00Z', 50)],
      profile: {},
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 12, now: NOW });
    const jul1 = rows.find((r) => r.date === '2026-07-01');
    const jul2 = rows.find((r) => r.date === '2026-07-02');
    expect(jul1.rss).toBe(50);
    expect(jul2.rss).toBe(0);
  });

  it('caps each activity at 500 RSS and sums multi-activity days', async () => {
    const supabase = mockSupabase({
      activities: [
        ride('2026-07-08T14:00:00Z', 900), // capped to 500
        ride('2026-07-08T20:00:00Z', 60),
      ],
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    expect(rows[2].rss).toBe(560);
    expect(rows[2].rss_source).toBe('device'); // dominant activity's tier
  });

  it('rest days carry confidence 1.0 so fs_confidence is not penalized', async () => {
    const supabase = mockSupabase({ activities: [ride('2026-07-08T16:00:00Z', 84)] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 10, now: NOW });
    const rideRow = rows.find((r) => r.date === '2026-07-08');
    const lastRow = rows[rows.length - 1];
    expect(rows[0].confidence).toBe(1);
    // Device tier confidence 0.95 on the ride day.
    expect(rideRow.confidence).toBeCloseTo(0.95, 2);
    // With a full 7-day trail, fs_confidence stays high (mix of 1.0 rest
    // days and one 0.95 device day) — a 3-ride/week athlete never gets the
    // muted "~" treatment just for resting.
    expect(lastRow.fs_confidence).toBeGreaterThan(0.9);
    expect(rideRow.rss_source).toBe('device');
    expect(rows[0].rss_source).toBeNull();
  });

  it('fs_confidence reflects zero-padding for the first days of the window (short history = low confidence)', async () => {
    const supabase = mockSupabase({ activities: [] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 10, now: NOW });
    // Day 1 has a 1-deep trail (six zero-padded slots) → low; day 7+ full → 1.0.
    expect(rows[0].fs_confidence).toBeLessThan(0.5);
    expect(rows[7].fs_confidence).toBe(1);
  });

  it('seeds tfi/afi from the stored row immediately before the window', async () => {
    // Window: Jul 6–9. Prior row Jul 5 (startKey−1) — no gap to decay.
    const supabase = mockSupabase({
      priorRow: { date: '2026-07-05', tfi: 100, afi: 60 },
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    // Day 1 (rest day) decays from the seed, not from 0.
    expect(rows[0].tfi).toBeCloseTo(100 + (0 - 100) / 42, 2);
    expect(rows[0].afi).toBeCloseTo(60 + (0 - 60) / 7, 2);
    // Day-1 form_score uses the seeded "yesterday" state, not same-day.
    expect(rows[0].form_score).toBeCloseTo(100 - 60, 2);
  });

  it('decays the seed across a multi-day gap before the window', async () => {
    // Prior row Jul 1; window starts Jul 6 → 4 gap days (Jul 2–5) of
    // zero-RSS decay before the walk begins.
    const supabase = mockSupabase({
      priorRow: { date: '2026-07-01', tfi: 100, afi: 60 },
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    let tfi = 100;
    let afi = 60;
    for (let i = 0; i < 4; i++) {
      tfi += (0 - tfi) / 42;
      afi += (0 - afi) / 7;
    }
    // rows[0] = one more decay day (Jul 6 itself).
    expect(rows[0].tfi).toBeCloseTo(tfi + (0 - tfi) / 42, 2);
    expect(rows[0].afi).toBeCloseTo(afi + (0 - afi) / 7, 2);
    expect(rows[0].form_score).toBeCloseTo(tfi - afi, 2);
  });

  it('cold-starts from 0 with same-day form_score when no prior row exists', async () => {
    const supabase = mockSupabase({ priorRow: null, activities: [ride('2026-07-06T16:00:00Z', 84)] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    expect(rows[0].tfi).toBeCloseTo(84 / 42, 2);
    // Same-day fallback: first row's form_score = tfi − afi of that day.
    expect(rows[0].form_score).toBeCloseTo(84 / 42 - 84 / 7, 2);
  });

  it('includeToday extends the window through today and picks up a today-dated ride', async () => {
    // 16:00 UTC Jul 10 = 10:00 Jul 10 in Denver — today at the fixed NOW.
    const supabase = mockSupabase({ activities: [ride('2026-07-10T16:00:00Z', 77)] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', {
      days: 4,
      now: NOW,
      includeToday: true,
    });
    expect(rows).toHaveLength(5); // Jul 6..10 inclusive
    expect(rows[rows.length - 1].date).toBe('2026-07-10');
    expect(rows[rows.length - 1].rss).toBe(77);
    expect(rows[rows.length - 1].afi).toBeCloseTo(77 / 7, 2);
  });

  it('default opts still end at yesterday even when a today ride exists', async () => {
    const supabase = mockSupabase({ activities: [ride('2026-07-10T16:00:00Z', 77)] });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    expect(rows[rows.length - 1].date).toBe('2026-07-09');
    expect(rows.every((r) => r.rss === 0)).toBe(true);
  });

  it('paginates the activities fetch beyond 1000 rows', async () => {
    // 1004 activities, all on 2026-07-08, 1 RSS each. An un-paginated fetch
    // (silent 1000-row cap) would sum 1000; pagination sees all 1004 —
    // spread across the day, no per-activity cap in play.
    const many = Array.from({ length: 1004 }, () => ride('2026-07-08T16:00:00Z', 1));
    const supabase = mockSupabase({ activities: many });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 4, now: NOW });
    expect(rows[2].rss).toBe(1004);
  });
});

describe('recomputeTrainingLoadForUser', () => {
  it('bulk-upserts the computed rows with the user_id,date conflict key', async () => {
    const supabase = mockSupabase({ activities: [ride('2026-07-08T16:00:00Z', 84)] });
    const result = await recomputeTrainingLoadForUser(supabase, 'u1', { days: 4, now: NOW });
    expect(result.rowsWritten).toBe(4);
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0].table).toBe('training_load_daily');
    expect(supabase.upserts[0].opts).toEqual({ onConflict: 'user_id,date' });
    expect(supabase.upserts[0].rows[0].user_id).toBe('u1');
  });

  it('dryRun computes but writes nothing', async () => {
    const supabase = mockSupabase({ activities: [ride('2026-07-08T16:00:00Z', 84)] });
    const result = await recomputeTrainingLoadForUser(supabase, 'u1', { days: 4, now: NOW, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.rowsWritten).toBe(0);
    expect(result.lastDay.date).toBe('2026-07-09');
    expect(supabase.upserts).toHaveLength(0);
  });
});

describe('fetchSeedState', () => {
  it('decays the prior row across the gap to the day before startKey', async () => {
    // Prior row Jul 1, startKey Jul 6 → 4 gap days (Jul 2–5) of zero-RSS decay.
    const supabase = mockSupabase({ priorRow: { date: '2026-07-01', tfi: 100, afi: 60 } });
    const seed = await fetchSeedState(supabase, 'u1', '2026-07-06', 42, 7);
    let tfi = 100;
    let afi = 60;
    for (let i = 0; i < 4; i++) {
      tfi += (0 - tfi) / 42;
      afi += (0 - afi) / 7;
    }
    expect(seed.tfi).toBeCloseTo(tfi, 6);
    expect(seed.afi).toBeCloseTo(afi, 6);
  });

  it('returns null when no prior row exists (true cold start)', async () => {
    const supabase = mockSupabase({ priorRow: null });
    const seed = await fetchSeedState(supabase, 'u1', '2026-07-06', 42, 7);
    expect(seed).toBeNull();
  });
});

describe('localDateKey', () => {
  it('converts UTC instants to the local calendar date', () => {
    expect(localDateKey('2026-07-02T03:00:00Z', 'America/Denver')).toBe('2026-07-01');
    expect(localDateKey('2026-07-02T03:00:00Z', 'UTC')).toBe('2026-07-02');
  });
});

describe('per-sport split (migration 133)', () => {
  const runAct = (dateIso, extra = {}) => ({
    start_date: dateIso,
    type: 'Run',
    sport_type: 'RUNNING',
    moving_time: 3600,
    distance: 12000,
    total_elevation_gain: 0,
    average_heartrate: 150,
    ...extra,
  });
  const swim = (dateIso) => ({
    start_date: dateIso,
    type: 'Swim',
    sport_type: 'LAP_SWIMMING',
    moving_time: 2400,
    distance: 2000,
    total_elevation_gain: 0,
    average_heartrate: 130,
  });

  it('splits each day by sport and the sports add up to the combined row', async () => {
    const activities = [];
    for (let d = 1; d <= 9; d++) {
      const day = `2026-07-0${d}T16:00:00Z`;
      if (d % 3 === 0) activities.push(runAct(day));
      else if (d % 3 === 1) activities.push(ride(day, 70));
      else activities.push(swim(day), ride(day, 40));
    }
    const supabase = mockSupabase({
      profile: { threshold_pace_sec: 300, lthr: 168, max_hr: 189, resting_hr: 60 },
      activities,
      priorRow: { date: '2026-06-29', tfi: 30, afi: 25 },
    });
    const { rows, runProfile } = await computeTrainingLoadRows(supabase, 'u1', { days: 10, now: NOW });
    expect(runProfile).toMatchObject({ thresholdPaceSec: 300, paceFrom: 'profile' });

    for (const r of rows) {
      for (const k of ['rss', 'tfi', 'afi']) {
        const sum = r[`${k}_cycling`] + r[`${k}_running`] + r[`${k}_other`];
        expect(Math.abs(sum - r[k]), `${r.date} ${k}`).toBeLessThanOrEqual(0.05);
      }
    }
    const runDay = rows.find((r) => r.date === '2026-07-03');
    // An hour at threshold pace, scored with the athlete's entered pace.
    expect(runDay).toMatchObject({ rss_running: 100, rss_cycling: 0, rss_source: 'power' });
    const swimDay = rows.find((r) => r.date === '2026-07-02');
    expect(swimDay.rss_other).toBeGreaterThan(0);
    expect(swimDay.rss_cycling).toBe(40);
  });

  it('apportions a seed written before the split by the window share', () => {
    expect(apportionSeed({ tfi: 40, afi: 20 }, { cycling: 300, running: 100, other: 0 })).toEqual({
      cycling: { tfi: 30, afi: 15 },
      running: { tfi: 10, afi: 5 },
      other: { tfi: 0, afi: 0 },
    });
    expect(apportionSeed({ tfi: 40, afi: 20 }, { cycling: 0, running: 0, other: 0 }).cycling).toEqual({ tfi: 40, afi: 20 });
  });

  it('reads the stored split as the seed when the prior row has it', async () => {
    const priorRow = {
      date: '2026-06-29', tfi: 30, afi: 20,
      tfi_cycling: 20, afi_cycling: 12, tfi_running: 10, afi_running: 8, tfi_other: 0, afi_other: 0,
    };
    const seed = await fetchSeedState(mockSupabase({ priorRow }), 'u1', '2026-06-30', 42, 7);
    expect(seed.sports).toEqual({
      cycling: { tfi: 20, afi: 12 },
      running: { tfi: 10, afi: 8 },
      other: { tfi: 0, afi: 0 },
    });
  });

  it('labels a run with no thresholds and no HR as inferred, never hr', async () => {
    const supabase = mockSupabase({
      activities: [runAct('2026-07-08T16:00:00Z', { average_heartrate: null })],
    });
    const { rows } = await computeTrainingLoadRows(supabase, 'u1', { days: 5, now: NOW });
    expect(rows.find((r) => r.date === '2026-07-08').rss_source).toBe('inferred');
  });

  it('writes the combined load without the split when migration 133 is missing', async () => {
    resetSplitColumnsFallback();
    const supabase = mockSupabase({ activities: [ride('2026-07-08T16:00:00Z', 84)] });
    const missing = { message: "Could not find the 'rss_cycling' column of 'training_load_daily' in the schema cache" };
    expect(isMissingSplitColumnError(missing)).toBe(true);
    let calls = 0;
    const realFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
      const b = realFrom(table);
      const realUpsert = b.upsert;
      b.upsert = (rows, opts) => {
        calls++;
        if (rows.some((r) => 'rss_cycling' in r)) return Promise.resolve({ error: missing });
        return realUpsert(rows, opts);
      };
      return b;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await recomputeTrainingLoadForUser(supabase, 'u1', { days: 5, now: NOW });
    expect(result.rowsWritten).toBe(5);
    expect(calls).toBe(2);
    const written = supabase.upserts[0].rows;
    expect(written[0]).toHaveProperty('tfi');
    for (const c of SPLIT_COLUMNS) expect(written[0]).not.toHaveProperty(c);
    resetSplitColumnsFallback();
  });

  it('still fails loudly on an unrelated upsert error', () => {
    expect(isMissingSplitColumnError({ message: 'permission denied for table training_load_daily' })).toBe(false);
  });
});
