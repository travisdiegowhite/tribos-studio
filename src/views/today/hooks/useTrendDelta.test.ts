import { describe, it, expect } from 'vitest';
import { computeTrendData, type DailyRow } from './useTrendDelta';

function row(date: string, tfi: number, afi: number, formScore: number | null = null): DailyRow {
  return {
    date,
    tfi,
    ctl: null,
    afi,
    atl: null,
    form_score: formScore,
    tsb: null,
  };
}

describe('computeTrendData', () => {
  it('returns the empty shape for no rows', () => {
    const out = computeTrendData([]);
    expect(out.tfi).toBeNull();
    expect(out.afi).toBeNull();
    expect(out.trendDeltaPct).toBeNull();
    expect(out.sparkline).toEqual([]);
  });

  it('computes 28d max and 4-week trend delta from desc-ordered rows', () => {
    // Newest first per supabase desc ordering. Oldest TFI=50, newest TFI=60.
    const descRows: DailyRow[] = [
      row('2026-05-02', 60, 30, 5),
      row('2026-04-30', 58, 30),
      row('2026-04-25', 56, 28),
      row('2026-04-20', 54, 27),
      row('2026-04-15', 52, 26),
      row('2026-04-10', 50, 25),
    ];
    const out = computeTrendData(descRows);
    expect(out.tfi).toBe(60);
    expect(out.afi).toBe(30);
    expect(out.formScore).toBe(5);
    expect(out.tfi28dMax).toBe(60);
    expect(out.afi28dMax).toBe(30);
    // (60 - 50) / 50 * 100 = 20%.
    expect(out.trendDeltaPct).toBeCloseTo(20, 5);
    expect(out.sparkline).toEqual([50, 52, 54, 56, 58, 60]);
  });

  it('falls back to legacy ctl / atl / tsb columns when canonical is null', () => {
    const descRows: DailyRow[] = [
      { date: '2026-05-02', tfi: null, ctl: 70, afi: null, atl: 35, form_score: null, tsb: 5 },
      { date: '2026-04-25', tfi: null, ctl: 60, afi: null, atl: 32, form_score: null, tsb: 0 },
    ];
    const out = computeTrendData(descRows);
    expect(out.tfi).toBe(70);
    expect(out.afi).toBe(35);
    expect(out.formScore).toBe(5);
  });

  it('returns null trend when oldest TFI is zero', () => {
    const descRows: DailyRow[] = [row('2026-05-02', 60, 30), row('2026-04-25', 0, 0)];
    const out = computeTrendData(descRows);
    expect(out.trendDeltaPct).toBeNull();
  });

  it('skips null TFI rows in the sparkline', () => {
    const descRows: DailyRow[] = [
      row('2026-05-02', 60, 30),
      { date: '2026-04-30', tfi: null, ctl: null, afi: 28, atl: null, form_score: null, tsb: null },
      row('2026-04-25', 50, 25),
    ];
    const out = computeTrendData(descRows);
    // Only 50 and 60 made it in; null row was filtered out.
    expect(out.sparkline).toEqual([50, 60]);
  });
});
