import { describe, it, expect } from 'vitest';
import { assembleSpine, plannedRowRSS, type AssembleInput, type PlannedRow } from './getTodaySpine';
import type { ServerLoadRow } from '../today/athleteMetrics';

const NOW = new Date(2026, 5, 30, 9, 0, 0); // Tue 30 Jun 2026, local

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(base: Date, n: number): Date {
  const c = new Date(base);
  c.setDate(c.getDate() + n);
  return c;
}

/** 43 days of server load rising 44 → 62, ending today. */
function serverLoad(): ServerLoadRow[] {
  const rows: ServerLoadRow[] = [];
  for (let i = 0; i <= 42; i++) {
    const tfi = 44 + (i / 42) * 18;
    rows.push({ date: fmt(addDays(NOW, i - 42)), tfi, afi: tfi - 4, form_score: 4 });
  }
  return rows;
}

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    now: NOW,
    serverLoad: serverLoad(),
    activities: [],
    ftp: 250,
    planned: [],
    todaysWorkout: null,
    event: null,
    persona: { id: 'pragmatist', name: 'The Pragmatist' },
    recentRides: [],
    weekRollup: { distanceKm: 0, distanceMi: 0, elevationM: 0, elevationFt: 0, rideCount: 0 },
    ...overrides,
  };
}

describe('assembleSpine', () => {
  it('produces 43 past + 21 future days with today at index 42', () => {
    const data = assembleSpine(baseInput());
    expect(data.days).toHaveLength(64);
    expect(data.todayIndex).toBe(42);
    expect(data.days[42].isFuture).toBe(false);
    expect(data.days[43].isFuture).toBe(true);
    expect(data.days[42].date).toBe(fmt(NOW));
  });

  it('reads server TFI/AFI for the observed days', () => {
    const data = assembleSpine(baseInput());
    // Today should reflect the last server row (tfi 62).
    expect(data.days[42].tfi).toBe(62);
    expect(data.days[42].afi).toBe(58);
  });

  it('prefers the stored form_score for today', () => {
    const data = assembleSpine(baseInput());
    expect(data.days[42].fs).toBe(4); // from form_score, not tfi-afi (=4 here anyway)
  });

  it('derives readiness from form score, clamped 28..96', () => {
    const data = assembleSpine(baseInput());
    for (const d of data.days) {
      expect(d.readiness).toBeGreaterThanOrEqual(28);
      expect(d.readiness).toBeLessThanOrEqual(96);
    }
    // fs=4 → round(52 + 4*1.86)=59
    expect(data.days[42].readiness).toBe(59);
  });

  it('projects a peak when a hard block is planned, then seeds the summary', () => {
    const planned: PlannedRow[] = [];
    for (let k = 1; k <= 11; k++) {
      planned.push({ scheduled_date: fmt(addDays(NOW, k)), name: 'Threshold', workout_type: 'threshold', target_rss: 95 });
    }
    const data = assembleSpine(
      baseInput({ planned, event: { name: 'Gran Fondo', date: fmt(addDays(NOW, 12)), daysToRace: 12, priority: 'A' } }),
    );
    const future = data.days.slice(43);
    const peak = future.reduce((a, b) => (b.tfi > a.tfi ? b : a), future[0]);
    expect(peak.tfi).toBeGreaterThan(data.days[42].tfi); // fitness climbs under load
    expect(data.summaryLine).toContain('Gran Fondo');
  });

  it('extends the projection window to reach a far-out event', () => {
    const event = { name: 'The Rad', date: fmt(addDays(NOW, 64)), daysToRace: 64, priority: 'A' };
    const data = assembleSpine(baseInput({ event }));
    expect(data.days).toHaveLength(43 + 64); // 43 past + 64 projected
    expect(data.days[data.days.length - 1].isFuture).toBe(true);
  });

  it('caps the projection window at 16 weeks for very distant events', () => {
    const event = { name: 'Nationals', date: fmt(addDays(NOW, 300)), daysToRace: 300, priority: 'A' };
    const data = assembleSpine(baseInput({ event }));
    expect(data.days).toHaveLength(43 + 112);
  });

  it('writes a pluralized, article-free event summary (no "the The Rad", no "1 days")', () => {
    const far = { name: 'The Rad', date: fmt(addDays(NOW, 64)), daysToRace: 64, priority: 'A' };
    const farData = assembleSpine(baseInput({ event: far }));
    expect(farData.summaryLine).toContain('64 days to The Rad');
    expect(farData.summaryLine).not.toContain('the The Rad');

    const soon = { name: 'Crit', date: fmt(addDays(NOW, 1)), daysToRace: 1, priority: 'A' };
    const soonData = assembleSpine(baseInput({ event: soon }));
    expect(soonData.summaryLine).toContain('1 day to Crit');
  });

  it('does not claim a peak when the projection is flat/declining', () => {
    const data = assembleSpine(baseInput()); // no event, no activities → decays
    expect(data.summaryLine).not.toContain('Peak');
  });

  it('projects rest-day plan rows as zero load (no phantom maintenance fill)', () => {
    const restDate = fmt(addDays(NOW, 2));
    const planned: PlannedRow[] = [
      { scheduled_date: fmt(addDays(NOW, 1)), name: 'Endurance', workout_type: 'endurance', target_rss: 60 },
      { scheduled_date: restDate, name: 'Rest Day', workout_type: 'rest', target_rss: null },
    ];
    const data = assembleSpine(baseInput({ planned }));
    const restNode = data.days.find((d) => d.date === restDate)!;
    expect(restNode.rss).toBe(0);
    expect(restNode.planned).toBe(false);
    expect(restNode.activity.tag).toBe('REST');
  });

  it('treats empty days inside a plan as rest, but keeps maintenance fill with no plan', () => {
    const planned: PlannedRow[] = [
      { scheduled_date: fmt(addDays(NOW, 1)), name: 'Tempo', workout_type: 'tempo', target_rss: 70 },
    ];
    // Recent activity so maintenanceRSS would be non-zero if used.
    const activities = [{ start_date: `${fmt(addDays(NOW, -1))}T10:00:00Z`, rss: 80, moving_time: 5400 }];
    const withPlan = assembleSpine(baseInput({ planned, activities }));
    const gapDay = withPlan.days.find((d) => d.isFuture && d.date === fmt(addDays(NOW, 3)))!;
    expect(gapDay.rss).toBe(0); // plan exists → empty day is rest
    expect(gapDay.planned).toBe(false);

    const noPlan = assembleSpine(baseInput({ activities }));
    const fillDay = noPlan.days.find((d) => d.isFuture && d.date === fmt(addDays(NOW, 3)))!;
    expect(fillDay.rss).toBeGreaterThan(0); // no plan → maintenance rhythm fill
    expect(fillDay.planned).toBe(false); // …but never drawn as a planned session
  });

  it('estimates RSS from workout type × duration when a coach plan row has null load', () => {
    // threshold mid = 85/h → 1.5h ≈ 128.
    expect(
      plannedRowRSS({ scheduled_date: '2026-07-02', workout_type: 'threshold', target_rss: null, duration_minutes: 90 }),
    ).toBe(128);
    // Unknown type falls back to endurance mid (48/h), default 60 min.
    expect(plannedRowRSS({ scheduled_date: '2026-07-02', workout_type: 'mystery', target_rss: null })).toBe(48);
    // Rest rows are always zero.
    expect(plannedRowRSS({ scheduled_date: '2026-07-02', workout_type: 'rest', target_rss: null })).toBe(0);
  });

  it('follows a build-then-taper plan: projection rises through the build and eases into the event', () => {
    const event = { name: 'The Rad', date: fmt(addDays(NOW, 28)), daysToRace: 28, priority: 'A' };
    const planned: PlannedRow[] = [];
    for (let k = 1; k <= 28; k++) {
      const dow = k % 7;
      if (dow === 1 || dow === 4) continue; // rest days
      const build = k <= 21;
      planned.push({
        scheduled_date: fmt(addDays(NOW, k)),
        name: build ? 'Build' : 'Taper',
        workout_type: build ? 'threshold' : 'recovery',
        target_rss: build ? 95 : 25,
      });
    }
    const data = assembleSpine(baseInput({ planned, event }));
    const future = data.days.slice(43);
    const endOfBuild = future[20]; // day 21
    const preRace = future[future.length - 1];
    expect(endOfBuild.tfi).toBeGreaterThan(data.days[42].tfi); // fitness climbs under the block
    expect(preRace.tfi).toBeLessThanOrEqual(endOfBuild.tfi); // taper eases off
    expect(preRace.fs).toBeGreaterThan(endOfBuild.fs); // freshness recovers into the event
  });

  it('labels a rest day and a today PLAN chip', () => {
    const data = assembleSpine(
      baseInput({ todaysWorkout: { name: 'Hygiene Loop', type: 'endurance', durationMin: 90 } }),
    );
    expect(data.days[42].activity.tag).toBe('PLAN');
    expect(data.days[42].activity.name).toBe('Hygiene Loop');
    // A day with no activity + no load is REST.
    const restDay = data.days.find((d) => !d.isFuture && d.rss === 0 && d.index !== 42);
    expect(restDay?.activity.tag).toBe('REST');
  });

  it('uses a real completed-activity name and zone for a past ride', () => {
    const rideDate = fmt(addDays(NOW, -3));
    const data = assembleSpine(
      baseInput({
        activities: [{ start_date: `${rideDate}T14:00:00Z`, name: 'Sunday Big Loop', rss: 82, moving_time: 7200 }],
      }),
    );
    const node = data.days.find((d) => d.date === rideDate)!;
    expect(node.activity.name).toBe('Sunday Big Loop');
    expect(node.activity.tag).toBe('Z3'); // 82 RSS → tempo band
  });

  it('flags thin history and still returns a full spine', () => {
    const data = assembleSpine(baseInput({ serverLoad: [], activities: [] }));
    expect(data.hasHistory).toBe(false);
    expect(data.days).toHaveLength(64);
  });

  it('carries persona and week rollup through', () => {
    const data = assembleSpine(
      baseInput({
        persona: { id: 'hammer', name: 'The Hammer' },
        weekRollup: { distanceKm: 182, distanceMi: 113, elevationM: 2140, elevationFt: 7021, rideCount: 4 },
      }),
    );
    expect(data.coach.personaName).toBe('The Hammer');
    expect(data.weekRollup.rideCount).toBe(4);
  });
});
