/**
 * Timezone regression for the shared daily-load walk: an evening ride whose
 * UTC timestamp crosses midnight must be bucketed on its LOCAL day. TZ is
 * pinned to America/Denver — in a UTC runner the bug would be invisible.
 */
process.env.TZ = 'America/Denver';

import { describe, it, expect, afterAll } from 'vitest';
import { buildDailyLoadSeries, fmtDate } from './athleteMetrics';

afterAll(() => {
  delete process.env.TZ;
});

describe('buildDailyLoadSeries — local-day bucketing', () => {
  it("counts tonight's ride on today's local date (UTC date is tomorrow)", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const localDay = fmtDate(today);
    // 19:00 at UTC-6 = 01:00 UTC the next day; local Denver day stays `localDay`
    // in both MDT (-6) and MST (-7).
    const startUtc = new Date(`${localDay}T19:00:00-06:00`).toISOString();
    expect(startUtc.split('T')[0]).not.toBe(localDay); // precondition: crosses UTC midnight

    const series = buildDailyLoadSeries(
      [{ start_date: startUtc, rss: 100, moving_time: 5400 }],
      250,
      [],
    );
    const todayPoint = series[series.length - 1];
    expect(todayPoint.date).toBe(localDay);
    expect(todayPoint.rss).toBe(100);
  });
});
