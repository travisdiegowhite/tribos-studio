import { describe, it, expect } from 'vitest';
import {
  computeTrainingLoadRows,
  recomputeTrainingLoadForUser,
  localDateKey,
} from './trainingLoadRecompute.js';

// Fixed "now": 2026-07-10 15:00 UTC = 2026-07-10 09:00 in America/Denver.
const NOW = new Date('2026-07-10T15:00:00Z');
const TZ = 'America/Denver';

/**
 * Table-aware supabase mock. Each from(table) chain records filters and
 * resolves with the provided rows; upserts are captured for assertions.
 */
function mockSupabase({ profile = {}, activities = [] } = {}) {
  const upserts = [];
  const client = {
    upserts,
    from(table) {
      const builder = {
        _table: table,
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        is: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: { timezone: TZ, ftp: 250, tfi_tau: 42, afi_tau: 7, ...profile } }),
        upsert: (rows, opts) => {
          upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
        then: (resolve) =>
          Promise.resolve({ data: table === 'activities' ? activities : [], error: null }).then(resolve),
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

describe('localDateKey', () => {
  it('converts UTC instants to the local calendar date', () => {
    expect(localDateKey('2026-07-02T03:00:00Z', 'America/Denver')).toBe('2026-07-01');
    expect(localDateKey('2026-07-02T03:00:00Z', 'UTC')).toBe('2026-07-02');
  });
});
