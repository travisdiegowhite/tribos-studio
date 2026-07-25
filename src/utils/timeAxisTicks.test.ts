import { describe, it, expect } from 'vitest';
import { selectTimeTicks } from './timeAxisTicks';

/** Ascending weekly Monday keys from `start`, `count` weeks. */
function weeklyKeys(start: string, count: number): string[] {
  const keys: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return keys;
}

describe('selectTimeTicks', () => {
  it('uses yearly ticks for a multi-year span', () => {
    // ~13 years of weekly Mondays starting Feb 2013.
    const keys = weeklyKeys('2013-02-04', 680);
    const { ticks, format } = selectTimeTicks(keys);

    // One tick per calendar year present (2013–2026 = 14).
    expect(ticks).toHaveLength(14);
    expect(format(ticks[0])).toBe('2013');
    expect(format(ticks[13])).toBe('2026');
    // Each tick is the FIRST data point of its year and a real data value.
    expect(ticks.every((t) => keys.includes(t))).toBe(true);
    expect(format(ticks[1])).toBe('2014');
    expect(ticks[1] < '2014-01-15').toBe(true);
  });

  it('uses quarterly ticks for a 1–3 year span', () => {
    const keys = weeklyKeys('2024-06-03', 105); // ~2 years
    const { ticks, format } = selectTimeTicks(keys);

    // First partial quarter + subsequent quarter starts, all real data values.
    expect(ticks.length).toBeGreaterThanOrEqual(8);
    expect(ticks.length).toBeLessThanOrEqual(10);
    expect(format(ticks[0])).toBe("Jun '24");
    expect(ticks.every((t) => keys.includes(t))).toBe(true);
    // A quarter-start tick gets its month + year label.
    const janTick = ticks.find((t) => t.startsWith('2025-01'));
    expect(janTick).toBeDefined();
    expect(format(janTick!)).toBe("Jan '25");
  });

  it('uses monthly ticks within a year, labeling January with the year', () => {
    const keys = weeklyKeys('2025-10-06', 40); // ~9 months crossing New Year
    const { ticks, format } = selectTimeTicks(keys);

    expect(format(ticks[0])).toBe('Oct');
    const janTick = ticks.find((t) => t.startsWith('2026-01'));
    expect(format(janTick!)).toBe("Jan '26");
    const febTick = ticks.find((t) => t.startsWith('2026-02'));
    expect(format(febTick!)).toBe('Feb');
  });

  it('returns non-tick keys as empty labels', () => {
    const keys = weeklyKeys('2013-02-04', 680);
    const { ticks, format } = selectTimeTicks(keys);
    const nonTick = keys.find((k) => !ticks.includes(k));
    expect(format(nonTick!)).toBe('');
  });

  it('handles a single point', () => {
    const { ticks, format } = selectTimeTicks(['2026-07-20']);
    expect(ticks).toEqual(['2026-07-20']);
    expect(format('2026-07-20')).toBe('Jul');
  });

  it('handles empty input', () => {
    const { ticks, format } = selectTimeTicks([]);
    expect(ticks).toEqual([]);
    expect(format('2026-07-20')).toBe('');
  });
});
