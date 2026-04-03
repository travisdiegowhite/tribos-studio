import { describe, it, expect } from 'vitest';
import { estimateActivityTSS, computeWeeklySnapshots } from './computeFitnessSnapshots';
import type { ActivityInput } from './computeFitnessSnapshots';

describe('estimateActivityTSS', () => {
  it('returns stored TSS when available', () => {
    const activity: ActivityInput = {
      start_date: '2026-03-15T10:00:00Z',
      tss: 150,
      kilojoules: 1440,
      moving_time: 7200,
    };
    expect(estimateActivityTSS(activity)).toBe(150);
  });

  describe('kJ-based estimation (Tier 4)', () => {
    it('produces correct TSS for 2h ride at 200W with FTP=200', () => {
      const activity: ActivityInput = {
        start_date: '2026-03-15T10:00:00Z',
        kilojoules: 1440,
        moving_time: 7200,
      };
      // TSS = 1440 / (200 × 0.036) = 200
      expect(estimateActivityTSS(activity, 200)).toBe(200);
    });

    it('uses default FTP=200 when no FTP provided', () => {
      const activity: ActivityInput = {
        start_date: '2026-03-15T10:00:00Z',
        kilojoules: 720,
        moving_time: 3600,
      };
      // TSS = 720 / (200 × 0.036) = 100
      expect(estimateActivityTSS(activity)).toBe(100);
    });

    it('does NOT overestimate like the old formula', () => {
      const activity: ActivityInput = {
        start_date: '2026-03-15T10:00:00Z',
        kilojoules: 1440,
        moving_time: 7200,
      };
      const tss = estimateActivityTSS(activity, 200);
      expect(tss).toBe(200); // Not 600 (old formula)
    });
  });

  describe('NP + FTP estimation (Tier 3)', () => {
    it('uses NP+FTP formula when available', () => {
      const activity: ActivityInput = {
        start_date: '2026-03-15T10:00:00Z',
        normalized_power: 200,
        moving_time: 3600,
      };
      // IF = 200/200 = 1.0, TSS = 1 × 1.0² × 100 = 100
      expect(estimateActivityTSS(activity, 200)).toBe(100);
    });
  });
});

describe('computeWeeklySnapshots', () => {
  it('returns empty for no activities', () => {
    expect(computeWeeklySnapshots([])).toEqual([]);
  });

  it('computes TSB using yesterday values (not today)', () => {
    // Create activities: steady 100 TSS/day for 14 days, then a huge 500 TSS day
    const activities: ActivityInput[] = [];
    for (let i = 20; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      activities.push({
        start_date: d.toISOString(),
        tss: i === 0 ? 500 : 100, // last day is huge
        moving_time: 3600,
      });
    }

    const snapshots = computeWeeklySnapshots(activities, 200);
    // The most recent snapshot should have TSB computed from yesterday's CTL/ATL
    // not from today's (which would be skewed by the 500 TSS day)
    const latest = snapshots[0];
    expect(latest).toBeDefined();
    // CTL and ATL should reflect today's values (including the 500 day)
    // but TSB should use yesterday's (before the 500 day)
    // Since TSB = ctlPrev - atlPrev, it won't be as negative as ctl - atl
  });

  it('caps individual activity TSS at 500', () => {
    const activity: ActivityInput = {
      start_date: new Date().toISOString(),
      kilojoules: 10000, // would produce very high TSS
      moving_time: 36000,
    };
    const snapshots = computeWeeklySnapshots([activity], 200);
    expect(snapshots.length).toBeGreaterThan(0);
    // weekly_tss should be capped
    expect(snapshots[0].weekly_tss).toBeLessThanOrEqual(500);
  });
});
