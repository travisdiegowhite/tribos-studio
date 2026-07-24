import { describe, it, expect } from 'vitest';
import { getISOWeek, getISOWeekYear } from './isoWeek';

describe('getISOWeek / getISOWeekYear', () => {
  it('assigns a late-December Monday to week 1 of the next ISO week-year', () => {
    // Mon 2025-12-29 → ISO week 1 of 2026 (Thursday is Jan 1, 2026).
    expect(getISOWeek('2025-12-29')).toBe(1);
    expect(getISOWeekYear('2025-12-29')).toBe(2026);
  });

  it('handles a January 1st Monday as week 1 of its own year', () => {
    // Mon 2024-01-01 → ISO week 1 of 2024.
    expect(getISOWeek('2024-01-01')).toBe(1);
    expect(getISOWeekYear('2024-01-01')).toBe(2024);
  });

  it('handles 53-week ISO years', () => {
    // Mon 2020-12-28 → ISO week 53 of 2020.
    expect(getISOWeek('2020-12-28')).toBe(53);
    expect(getISOWeekYear('2020-12-28')).toBe(2020);
  });

  it('assigns early-January dates of a short week to the previous ISO year', () => {
    // Fri 2021-01-01 falls in ISO week 53 of 2020.
    expect(getISOWeek('2021-01-01')).toBe(53);
    expect(getISOWeekYear('2021-01-01')).toBe(2020);
  });

  it('numbers mid-year weeks conventionally', () => {
    // Mon 2026-07-20 → ISO week 30 of 2026.
    expect(getISOWeek('2026-07-20')).toBe(30);
    expect(getISOWeekYear('2026-07-20')).toBe(2026);
  });

  it('agrees for every day within one ISO week', () => {
    // Mon 2026-07-20 through Sun 2026-07-26 are all week 30 / 2026.
    for (const day of ['2026-07-20', '2026-07-22', '2026-07-26']) {
      expect(getISOWeek(day)).toBe(30);
      expect(getISOWeekYear(day)).toBe(2026);
    }
  });
});
