/**
 * Timezone-sensitive regression tests for the weekly snapshot engine.
 * TZ is pinned to America/Denver so UTC-vs-local bucketing bugs are visible
 * (in a UTC test runner, local == UTC and the regressions would be vacuous).
 */
process.env.TZ = 'America/Denver';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  computeWeeklySnapshots,
  overlayServerLoadOnWeeklySnapshots,
  type WeeklySnapshot,
  type ServerLoadDailyRow,
} from '../computeFitnessSnapshots';

// Wed Jul 22 2026, 12:00 in Denver (18:00 UTC). Current week: Mon Jul 20 – Sun Jul 26.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-22T18:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
  delete process.env.TZ;
});

function snap(overrides: Partial<WeeklySnapshot> & { snapshot_week: string }): WeeklySnapshot {
  return {
    ctl: 40,
    atl: 50,
    tsb: -8,
    weekly_hours: 5,
    weekly_tss: 250,
    weekly_ride_count: 3,
    weekly_run_count: 0,
    weekly_distance_km: 120,
    weekly_elevation_m: 900,
    ...overrides,
  };
}

describe('computeWeeklySnapshots — local-day bucketing', () => {
  it('keeps a Sunday-evening local ride in its local week (not the next UTC week)', () => {
    // Sun Jul 12, 19:00 Denver = Mon Jul 13 01:00 UTC.
    const activities = [
      { start_date: '2026-07-13T01:00:00Z', rss: 100, moving_time: 3600, distance: 30000, type: 'Ride' },
    ];
    const snapshots = computeWeeklySnapshots(activities, 250);
    const weekOfRide = snapshots.find((s) => s.snapshot_week === '2026-07-06');
    const weekAfter = snapshots.find((s) => s.snapshot_week === '2026-07-13');
    expect(weekOfRide?.weekly_ride_count).toBe(1);
    expect(weekOfRide?.weekly_tss).toBe(100);
    expect(weekAfter?.weekly_ride_count).toBe(0);
    expect(weekAfter?.weekly_tss).toBe(0);
  });

  it('snapshots the in-progress week as of TODAY, not projected to Sunday', () => {
    // Mon Jul 20, 10:00 Denver. Walk should cover Mon(84), Tue(0), Wed(0) only.
    const activities = [
      { start_date: '2026-07-20T16:00:00Z', rss: 84, moving_time: 3600, type: 'Ride' },
    ];
    const snapshots = computeWeeklySnapshots(activities, 250);
    const current = snapshots[0];
    expect(current.snapshot_week).toBe('2026-07-20');

    let ctl = 0;
    let atl = 0;
    let ctlYesterday = 0;
    let atlYesterday = 0;
    for (const tss of [84, 0, 0]) {
      ctlYesterday = ctl;
      atlYesterday = atl;
      ctl = ctl + (tss - ctl) / 42;
      atl = atl + (tss - atl) / 7;
    }
    expect(current.ctl).toBe(Math.round(ctl));
    expect(current.atl).toBe(Math.round(atl));
    expect(current.tsb).toBe(Math.round(ctlYesterday - atlYesterday));
  });
});

describe('overlayServerLoadOnWeeklySnapshots', () => {
  const weekly = [
    snap({ snapshot_week: '2026-07-20' }),
    snap({ snapshot_week: '2026-07-13', ctl: 38, atl: 45, tsb: -5 }),
    snap({ snapshot_week: '2026-07-06', ctl: 36, atl: 40, tsb: -2 }),
  ];

  it("overrides ctl/atl/tsb with each week's latest server row, leaving volume untouched", () => {
    const rows: ServerLoadDailyRow[] = [
      { date: '2026-07-13', tfi: 50, afi: 52, form_score: -2 }, // Monday of week 07-13
      { date: '2026-07-19', tfi: 60.4, afi: 55.2, form_score: -4.4 }, // Sunday — must win
      { date: '2026-07-22', tfi: 70, afi: 45, form_score: 32 }, // in-progress week, today
    ];
    const out = overlayServerLoadOnWeeklySnapshots(weekly, rows);

    const w13 = out.find((s) => s.snapshot_week === '2026-07-13')!;
    expect(w13.ctl).toBe(60);
    expect(w13.atl).toBe(55);
    expect(w13.tsb).toBe(-4);

    const w20 = out.find((s) => s.snapshot_week === '2026-07-20')!;
    expect(w20.ctl).toBe(70);
    expect(w20.atl).toBe(45);
    expect(w20.tsb).toBe(32);

    // Volume fields are client-only and must be unchanged.
    expect(w20.weekly_tss).toBe(250);
    expect(w20.weekly_distance_km).toBe(120);

    // Uncovered week keeps client-engine values.
    const w06 = out.find((s) => s.snapshot_week === '2026-07-06')!;
    expect(w06.ctl).toBe(36);
    expect(w06.tsb).toBe(-2);
  });

  it('skips rows with null tfi/afi and keeps client tsb when form_score is null', () => {
    const rows: ServerLoadDailyRow[] = [
      { date: '2026-07-08', tfi: null, afi: null, form_score: null }, // unusable — week 07-06 unchanged
      { date: '2026-07-21', tfi: 70, afi: 45, form_score: null }, // ctl/atl override, tsb kept
    ];
    const out = overlayServerLoadOnWeeklySnapshots(weekly, rows);

    const w06 = out.find((s) => s.snapshot_week === '2026-07-06')!;
    expect(w06.ctl).toBe(36);

    const w20 = out.find((s) => s.snapshot_week === '2026-07-20')!;
    expect(w20.ctl).toBe(70);
    expect(w20.atl).toBe(45);
    expect(w20.tsb).toBe(-8); // client value retained
  });

  it('passes through unchanged when there are no server rows', () => {
    expect(overlayServerLoadOnWeeklySnapshots(weekly, [])).toEqual(weekly);
    expect(overlayServerLoadOnWeeklySnapshots(weekly, null)).toEqual(weekly);
  });
});
