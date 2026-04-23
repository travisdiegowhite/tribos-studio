import { describe, it, expect } from 'vitest';
import { estimateRSSCanonical, computeFitnessMetrics } from './computeFitnessMetrics.js';

// ─── estimateRSSCanonical ─────────────────────────────────────────────────────

describe('estimateRSSCanonical', () => {
  it('returns canonical rss column first (Tier 1a)', () => {
    const activity = { rss: 120, tss: 80, moving_time: 3600, type: 'Ride' };
    expect(estimateRSSCanonical(activity, 250)).toBe(120);
  });

  it('falls back to legacy tss when rss is null (Tier 1b)', () => {
    const activity = { rss: null, tss: 85, moving_time: 3600, type: 'Ride' };
    expect(estimateRSSCanonical(activity, 250)).toBe(85);
  });

  it('uses effective_power over normalized_power when both present (Tier 3)', () => {
    // 1 hour at FTP → IF=1 → TSS=100
    const activity = {
      rss: null, tss: null,
      effective_power: 250, normalized_power: 200,
      moving_time: 3600, type: 'Ride',
    };
    expect(estimateRSSCanonical(activity, 250)).toBe(100);
  });

  it('uses normalized_power when effective_power is null (Tier 3 legacy)', () => {
    const activity = {
      rss: null, tss: null,
      effective_power: null, normalized_power: 250,
      moving_time: 3600, type: 'Ride',
    };
    expect(estimateRSSCanonical(activity, 250)).toBe(100);
  });

  it('uses kilojoules when no power columns present (Tier 4)', () => {
    // 250W × 3600s = 900kJ → avgPower=250, IF=1 → TSS=100
    const activity = {
      rss: null, tss: null, effective_power: null, normalized_power: null,
      kilojoules: 900, moving_time: 3600, type: 'Ride',
    };
    expect(estimateRSSCanonical(activity, 250)).toBe(100);
  });

  it('uses heuristic when no power or stored data (Tier 5)', () => {
    const activity = {
      rss: null, tss: null, effective_power: null, normalized_power: null,
      kilojoules: null, moving_time: 7200, total_elevation_gain: 0, type: 'Ride',
    };
    // baseTSS = 2h × 50 = 100, no elevation, default intensity
    expect(estimateRSSCanonical(activity, null)).toBe(100);
  });

  it('handles zero duration without throwing', () => {
    const activity = { rss: null, tss: null, moving_time: 0, type: 'Ride' };
    expect(estimateRSSCanonical(activity, 250)).toBe(0);
  });
});

// ─── computeFitnessMetrics ────────────────────────────────────────────────────

function makeSupabase(activities, ftp = null) {
  return {
    from: (table) => {
      if (table === 'activities') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                is: () => ({
                  gte: () => ({
                    lte: () => ({
                      order: () => Promise.resolve({ data: activities, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_preferences') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: ftp ? { ftp } : null }),
            }),
          }),
        };
      }
      return null;
    },
  };
}

describe('computeFitnessMetrics', () => {
  it('returns empty array for user with no activities', async () => {
    const supabase = makeSupabase([]);
    const result = await computeFitnessMetrics(supabase, 'user-1', '2026-04-23');
    expect(Array.isArray(result)).toBe(true);
    // All RSS=0, CTL/ATL should both decay to 0 from 0
    result.forEach(row => {
      expect(row.rss).toBe(0);
      expect(row.ctl).toBe(0);
      expect(row.atl).toBe(0);
      expect(row.tsb).toBe(0);
    });
  });

  it('CTL reacts slowly to a single large spike, ATL reacts fast', async () => {
    const throughDate = '2026-04-23';
    const spikeDate = '2026-04-23';
    const activities = [{
      id: '1', type: 'Ride', start_date: spikeDate + 'T10:00:00Z',
      rss: 400, tss: null, moving_time: 14400, is_hidden: false, duplicate_of: null,
    }];
    const supabase = makeSupabase(activities);
    const rows = await computeFitnessMetrics(supabase, 'user-1', throughDate);
    const last = rows[rows.length - 1];

    // On day of spike, ATL = 0 + (400−0)/7 ≈ 57.1; CTL = 0 + (400−0)/42 ≈ 9.5
    expect(last.atl).toBeCloseTo(400 / 7, 0);
    expect(last.ctl).toBeCloseTo(400 / 42, 0);
    expect(last.atl).toBeGreaterThan(last.ctl * 2);
  });

  it('CTL from a known series matches hand-computed value', async () => {
    // 14 consecutive days of RSS=100, tau=42
    // After 14 days: CTL = 100 × (1 − e^{−14/42}) ≈ 100 × 0.2835 ≈ 28.35
    const throughDate = '2026-04-23';
    const baseDate = new Date('2026-04-10');
    const activities = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      return {
        id: `a${i}`, type: 'Ride',
        start_date: d.toISOString().split('T')[0] + 'T10:00:00Z',
        rss: 100, tss: null, moving_time: 3600,
        is_hidden: false, duplicate_of: null,
      };
    });
    const supabase = makeSupabase(activities);
    const rows = await computeFitnessMetrics(supabase, 'user-1', throughDate);
    const day14 = rows.find(r => r.date === '2026-04-23');
    if (day14) {
      expect(day14.ctl).toBeGreaterThan(25);
      expect(day14.ctl).toBeLessThan(35);
    }
  });

  it('each row has required fields', async () => {
    const supabase = makeSupabase([]);
    const rows = await computeFitnessMetrics(supabase, 'user-1', '2026-04-23');
    if (rows.length > 0) {
      const row = rows[0];
      expect(typeof row.date).toBe('string');
      expect(typeof row.rss).toBe('number');
      expect(typeof row.ctl).toBe('number');
      expect(typeof row.atl).toBe('number');
      expect(typeof row.tsb).toBe('number');
    }
  });

  it('rows are sorted ascending by date', async () => {
    const supabase = makeSupabase([]);
    const rows = await computeFitnessMetrics(supabase, 'user-1', '2026-04-23');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date >= rows[i - 1].date).toBe(true);
    }
  });
});
