import { describe, it, expect } from 'vitest';
import { weekStartKey, weekRangeKeys, toDateKey } from './dateUtils';

describe('weekStartKey', () => {
  it('returns the Monday for a mid-week date', () => {
    // 2026-08-20 is a Thursday
    expect(weekStartKey('2026-08-20')).toBe('2026-08-17');
  });

  it('returns the same day when given a Monday', () => {
    expect(weekStartKey('2026-08-17')).toBe('2026-08-17');
  });

  it('treats Sunday as the END of the week, not the start', () => {
    // 2026-08-23 is a Sunday — it belongs to the week starting Aug 17.
    expect(weekStartKey('2026-08-23')).toBe('2026-08-17');
  });

  it('crosses a month boundary', () => {
    // 2026-09-01 is a Tuesday
    expect(weekStartKey('2026-09-01')).toBe('2026-08-31');
  });

  it('returns null for junk', () => {
    expect(weekStartKey(null)).toBeNull();
    expect(weekStartKey('')).toBeNull();
    expect(weekStartKey('not-a-date')).toBeNull();
  });
});

describe('weekRangeKeys', () => {
  it('gives Mon..Sun inclusive and next Mon exclusive', () => {
    expect(weekRangeKeys('2026-08-20')).toEqual({
      startKey: '2026-08-17',
      endKeyInclusive: '2026-08-23',
      endKeyExclusive: '2026-08-24',
    });
  });

  it('EXCLUDES the following Monday — the 8-day-week regression', () => {
    // The training header used to compare `new Date('2026-08-24')` (UTC
    // midnight) against a locally-built Sunday 23:59, which in any negative
    // UTC offset put Aug 24 *inside* the week and counted 8 days.
    const { startKey, endKeyInclusive } = weekRangeKeys('2026-08-22');
    const inWeek = (key) => key >= startKey && key <= endKeyInclusive;

    expect(inWeek('2026-08-17')).toBe(true);
    expect(inWeek('2026-08-23')).toBe(true);
    expect(inWeek('2026-08-24')).toBe(false);
    expect(inWeek('2026-08-16')).toBe(false);
  });

  it('spans exactly 7 days', () => {
    const { startKey, endKeyInclusive } = weekRangeKeys('2026-08-20');
    const days =
      (Date.parse(endKeyInclusive + 'T00:00:00Z') -
        Date.parse(startKey + 'T00:00:00Z')) /
      86_400_000;
    expect(days).toBe(6);
  });

  it('is stable across the US DST fall-back weekend', () => {
    // DST ends 2026-11-01 in the US. A naive +7*86400000ms week lands an hour
    // short and can roll the key back a day.
    expect(weekRangeKeys('2026-11-01')).toEqual({
      startKey: '2026-10-26',
      endKeyInclusive: '2026-11-01',
      endKeyExclusive: '2026-11-02',
    });
    expect(weekRangeKeys('2026-11-02').startKey).toBe('2026-11-02');
  });

  it('is stable across the US DST spring-forward weekend', () => {
    // DST starts 2026-03-08 in the US.
    expect(weekRangeKeys('2026-03-08')).toEqual({
      startKey: '2026-03-02',
      endKeyInclusive: '2026-03-08',
      endKeyExclusive: '2026-03-09',
    });
  });

  it('returns null for junk', () => {
    expect(weekRangeKeys(null)).toBeNull();
  });
});

describe('toDateKey', () => {
  it('passes a bare date string through without reparsing it', () => {
    expect(toDateKey('2026-08-24')).toBe('2026-08-24');
  });

  it('truncates an ISO timestamp by string, not by Date math', () => {
    expect(toDateKey('2026-08-24T00:00:00+00:00')).toBe('2026-08-24');
  });

  it('formats a Date in local time', () => {
    expect(toDateKey(new Date(2026, 7, 24))).toBe('2026-08-24');
  });

  it('returns null for junk', () => {
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey(undefined)).toBeNull();
  });
});
