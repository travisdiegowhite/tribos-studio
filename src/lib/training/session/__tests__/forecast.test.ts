import { describe, it, expect } from 'vitest';
import { forecastFitness } from '../forecast';

describe('forecastFitness', () => {
  const from = { date: '2026-11-21', ctl: 40, atl: 50 };

  it('decays toward zero with nothing planned, and form rises', () => {
    const f = forecastFitness({ from, planned: [], days: 14 });
    expect(f).toHaveLength(14);
    expect(f[0].date).toBe('2026-11-22');
    expect(f[13].ctl).toBeLessThan(40);
    expect(f[13].atl).toBeLessThan(f[0].atl);
    expect(f[13].tsb).toBeGreaterThan(f[0].tsb);
  });

  it('steps each day with that day\'s planned load (sessions on one day add up)', () => {
    const f = forecastFitness({
      from,
      planned: [
        { scheduled_date: '2026-11-22', target_rss: 60 },
        { scheduled_date: '2026-11-22', target_rss: 30 },
      ],
      days: 1,
      taus: { tfi: 42, afi: 7 },
    });
    expect(f[0].load).toBe(90);
    expect(f[0].ctl).toBeCloseTo(40 + (90 - 40) / 42, 5);
    expect(f[0].atl).toBeCloseTo(50 + (90 - 50) / 7, 5);
    expect(f[0].tsb).toBe(-10); // yesterday's fitness − fatigue
  });

  it('ignores today and the past, and skipped sessions', () => {
    const f = forecastFitness({
      from,
      planned: [
        { scheduled_date: '2026-11-21', target_rss: 100 },
        { scheduled_date: '2026-11-22', target_rss: 100, status: 'skipped' },
      ],
      days: 1,
    });
    expect(f[0].load).toBe(0);
  });

  it('uses the athlete\'s own taus', () => {
    const slow = forecastFitness({ from, planned: [], days: 7, taus: { tfi: 60, afi: 10 } });
    const fast = forecastFitness({ from, planned: [], days: 7, taus: { tfi: 30, afi: 5 } });
    expect(slow[6].ctl).toBeGreaterThan(fast[6].ctl);
  });
});
