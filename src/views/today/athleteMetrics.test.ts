import { describe, it, expect } from 'vitest';
import { buildAthleteMetrics, fmtDate, type ServerLoadRow } from './athleteMetrics';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

describe('buildAthleteMetrics server-row guards', () => {
  it('uses server tfi/afi when present', () => {
    const server: ServerLoadRow[] = [
      { date: fmtDate(daysAgo(0)), tfi: 55, afi: 48, form_score: 7 },
    ];
    const m = buildAthleteMetrics([], 250, server);
    expect(m.tfiCurrent).toBe(55);
    expect(m.afiCurrent).toBe(48);
    expect(m.formScore).toBe(7);
  });

  it('falls back to the activity EWA when server rows carry null tfi/afi', () => {
    // Rows exist for every day but with null values — Number(null) === 0 must
    // NOT be trusted as a real reading.
    const server: ServerLoadRow[] = [];
    for (let i = 90; i >= 0; i--) {
      server.push({ date: fmtDate(daysAgo(i)), tfi: null, afi: null, form_score: null });
    }
    const activities = [];
    for (let i = 1; i <= 40; i++) {
      activities.push({ start_date: `${fmtDate(daysAgo(i))}T14:00:00Z`, rss: 80, moving_time: 5400 });
    }
    const m = buildAthleteMetrics(activities, 250, server);
    expect(m.tfiCurrent).toBeGreaterThan(10);
    expect(m.afiCurrent).toBeGreaterThan(10);
  });
});

describe('adaptive tau', () => {
  it('client-filled days step with the provided tau, defaulting to 42/7', () => {
    // Server rows through yesterday, flat at 30/30; today client-filled from
    // a 200-RSS ride.
    const server: ServerLoadRow[] = [];
    for (let i = 90; i >= 1; i--) {
      server.push({ date: fmtDate(daysAgo(i)), tfi: 30, afi: 30, form_score: 0 });
    }
    const activities = [{ start_date: `${fmtDate(daysAgo(0))}T08:00:00`, rss: 200, moving_time: 7200 }];

    const adaptive = buildAthleteMetrics(activities, 250, server, { tfi: 49, afi: 8 });
    expect(adaptive.tfiCurrent).toBe(Math.round(30 + (200 - 30) / 49)); // 33
    expect(adaptive.afiCurrent).toBe(Math.round(30 + (200 - 30) / 8)); // 51

    const fixed = buildAthleteMetrics(activities, 250, server);
    expect(fixed.tfiCurrent).toBe(Math.round(30 + (200 - 30) / 42)); // 34
    expect(fixed.afiCurrent).toBe(Math.round(30 + (200 - 30) / 7)); // 54
  });
});

describe('today-floor guard', () => {
  it('steps past a stale today row that undercounts client-visible RSS', () => {
    const server: ServerLoadRow[] = [];
    for (let i = 90; i >= 1; i--) {
      server.push({ date: fmtDate(daysAgo(i)), tfi: 30, afi: 30, form_score: 0 });
    }
    server.push({ date: fmtDate(daysAgo(0)), tfi: 31, afi: 29, form_score: 0, rss: 20 });
    const activities = [{ start_date: `${fmtDate(daysAgo(0))}T08:00:00`, rss: 80, moving_time: 5400 }];
    const m = buildAthleteMetrics(activities, 250, server);
    expect(m.afiCurrent).toBe(Math.round(30 + (80 - 30) / 7)); // 37, not the stale 29
  });

  it('adopts a fresh today row and leaves callers without rss unaffected', () => {
    const server: ServerLoadRow[] = [];
    for (let i = 90; i >= 1; i--) {
      server.push({ date: fmtDate(daysAgo(i)), tfi: 30, afi: 30, form_score: 0 });
    }
    // Row covers the ride; guard must not fire.
    const covered = [...server, { date: fmtDate(daysAgo(0)), tfi: 31, afi: 37, form_score: 0, rss: 80 }];
    const activities = [{ start_date: `${fmtDate(daysAgo(0))}T08:00:00`, rss: 80, moving_time: 5400 }];
    expect(buildAthleteMetrics(activities, 250, covered).afiCurrent).toBe(37);

    // No rss selected (legacy caller) — guard inert, row adopted as before.
    const noRss = [...server, { date: fmtDate(daysAgo(0)), tfi: 31, afi: 29, form_score: 0 }];
    expect(buildAthleteMetrics(activities, 250, noRss).afiCurrent).toBe(29);
  });
});
