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
