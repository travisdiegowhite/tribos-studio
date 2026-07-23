import { describe, it, expect } from 'vitest';
import { buildCacheKey, formatDateInTz } from './assembleFitnessContext.js';

function makeContext(overrides = {}) {
  return {
    snapshot: { ctl: 70, atl: 45, tsb: 32, last_ride_tss: null },
    trends: { ctl_delta_pct: -3.2, ctl_direction: 'recovering' },
    data_quality: { missed_rides_flag: false, rides_completed_this_week: 2 },
    coach_context: { upcoming_key_workout: null },
    week_schedule: null,
    ...overrides,
  };
}

describe('buildCacheKey', () => {
  it('distinguishes trend swings within the same direction bucket', () => {
    // −3% and −24% both bucket to "recovering" — the key must still differ,
    // or a big dip serves the old frozen summary for up to the TTL.
    const mild = buildCacheKey(makeContext({ trends: { ctl_delta_pct: -3.2, ctl_direction: 'recovering' } }), '2026-07-22');
    const steep = buildCacheKey(makeContext({ trends: { ctl_delta_pct: -24.1, ctl_direction: 'recovering' } }), '2026-07-22');
    expect(mild).not.toBe(steep);
  });

  it('rounds the percent so sub-point jitter does not thrash the cache', () => {
    const a = buildCacheKey(makeContext({ trends: { ctl_delta_pct: -3.2, ctl_direction: 'recovering' } }), '2026-07-22');
    const b = buildCacheKey(makeContext({ trends: { ctl_delta_pct: -3.4, ctl_direction: 'recovering' } }), '2026-07-22');
    expect(a).toBe(b);
  });

  it('changes with the athlete-local date (hard staleness bound at midnight)', () => {
    const today = buildCacheKey(makeContext(), '2026-07-22');
    const tomorrow = buildCacheKey(makeContext(), '2026-07-23');
    expect(today).not.toBe(tomorrow);
  });

  it("encodes a missing/non-finite delta as 'na' and a missing date as 'nodate'", () => {
    const key = buildCacheKey(makeContext({ trends: { ctl_delta_pct: null, ctl_direction: 'holding' } }));
    expect(key.startsWith('nodate:')).toBe(true);
    expect(key).toContain(':na:');
  });
});

describe('formatDateInTz', () => {
  it('formats YYYY-MM-DD in the requested timezone', () => {
    // 01:00 UTC on Jul 23 is still Jul 22 in Denver.
    const d = new Date('2026-07-23T01:00:00Z');
    expect(formatDateInTz(d, 'America/Denver')).toBe('2026-07-22');
    expect(formatDateInTz(d, 'UTC')).toBe('2026-07-23');
  });

  it('falls back to the UTC date on an invalid timezone', () => {
    const d = new Date('2026-07-23T01:00:00Z');
    expect(formatDateInTz(d, 'Not/AZone')).toBe('2026-07-23');
  });
});
