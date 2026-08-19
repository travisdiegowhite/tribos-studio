import { describe, it, expect, vi } from 'vitest';
import {
  assembleSpine,
  plannedRowRSS,
  raceTimeout,
  withLoadWatchdog,
  looksLikeAnonEmpty,
  type AssembleInput,
  type PlannedRow,
  type RideStat,
} from './getTodaySpine';
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

describe('assembleSpine — planned recovery week', () => {
  const recoveryRows = (): PlannedRow[] =>
    [1, 2, 3].map((k) => ({
      scheduled_date: fmt(addDays(NOW, k)), // Wed–Fri of the same ISO week
      name: 'Recovery spin',
      workout_type: 'recovery',
      duration_minutes: 40,
      target_rss: 20,
    }));

  it('flags the week and flips the neutral-band copy to recovery-week words', () => {
    const data = assembleSpine(baseInput({ planned: recoveryRows() }));
    expect(data.recoveryWeek).toBe(true);
    // form_score 4 → grey band → recovery-week phrase instead of "coasting".
    expect(data.summaryLine).toMatch(/recovery week/);
    expect(data.summaryLine).not.toMatch(/coasting/);
  });

  it('accepts the template phase signal even with mixed planned rows', () => {
    const mixed = [...recoveryRows(), {
      scheduled_date: fmt(addDays(NOW, 4)),
      name: 'Openers',
      workout_type: 'threshold',
      duration_minutes: 45,
      target_rss: 60,
    }];
    expect(assembleSpine(baseInput({ planned: mixed })).recoveryWeek).toBe(false);
    expect(assembleSpine(baseInput({ planned: mixed, planRecoveryPhase: true })).recoveryWeek).toBe(true);
  });

  it('stays off with no plan at all', () => {
    const data = assembleSpine(baseInput());
    expect(data.recoveryWeek).toBe(false);
    expect(data.summaryLine).toMatch(/coasting/);
  });
});

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
      baseInput({ todaysWorkout: { name: 'Hygiene Loop', type: 'endurance', durationMin: 90, targetRss: 72 } }),
    );
    expect(data.days[42].activity.tag).toBe('PLAN');
    expect(data.days[42].activity.name).toBe('Hygiene Loop');
    // A day with no activity + no load is REST.
    const restDay = data.days.find((d) => !d.isFuture && d.rss === 0 && d.index !== 42);
    expect(restDay?.activity.tag).toBe('REST');
  });

  it("today's PLAN card shows the plan's own target, never the day's actual RSS", () => {
    const data = assembleSpine(
      baseInput({ todaysWorkout: { name: 'Hygiene Loop', type: 'endurance', durationMin: 90, targetRss: 72 } }),
    );
    expect(data.days[42].activity.meta).toBe('1h30 · ~72 RSS');
  });

  it("a plan with no target renders 'planned', not a phantom number", () => {
    const data = assembleSpine(
      baseInput({ todaysWorkout: { name: 'Openers', type: 'endurance', durationMin: 0, targetRss: 0 } }),
    );
    expect(data.days[42].activity.tag).toBe('PLAN');
    expect(data.days[42].activity.meta).toBe('planned');
  });

  it('a ride on a planned rest day renders as the actual ride, not a PLAN/actual mash-up', () => {
    // The observed bug: "PLAN · Rest Day · 77 RSS" — the plan's name with the
    // real ride's load fused on.
    const data = assembleSpine(
      baseInput({
        todaysWorkout: { name: 'Rest Day', type: 'rest', durationMin: 0, targetRss: 0 },
        activities: [
          { start_date: `${fmt(NOW)}T08:00:00`, name: 'Erie Road Cycling', rss: 77, moving_time: 4514 },
        ],
      }),
    );
    const today = data.days[42].activity;
    expect(today.tag).toBe('BRISK'); // 77 RSS → tempo band
    expect(today.name).toBe('Erie Road Cycling');
    expect(today.meta).toContain('77 RSS');
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
    expect(node.activity.tag).toBe('BRISK'); // 82 RSS → tempo band
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

describe('loader guards', () => {
  it('raceTimeout resolves the value when the promise settles in time', async () => {
    await expect(raceTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('raceTimeout resolves the timeout sentinel when the promise hangs', async () => {
    vi.useFakeTimers();
    try {
      const hang = new Promise<string>(() => {});
      const raced = raceTimeout(hang, 4000);
      await vi.advanceTimersByTimeAsync(4001);
      await expect(raced).resolves.toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('raceTimeout propagates rejection', async () => {
    await expect(raceTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('withLoadWatchdog rejects with a legible error when the load hangs', async () => {
    vi.useFakeTimers();
    try {
      const hang = new Promise<never>(() => {});
      const guarded = withLoadWatchdog(hang, 15000);
      const assertion = expect(guarded).rejects.toThrow(/took too long to load/);
      await vi.advanceTimersByTimeAsync(15001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('withLoadWatchdog passes through a timely result', async () => {
    await expect(withLoadWatchdog(Promise.resolve(42), 15000)).resolves.toBe(42);
  });

  it('looksLikeAnonEmpty trips only when every list is empty AND the profile row is missing', () => {
    const empty = { data: [], error: null };
    const nullData = { data: null, error: null };
    const rows = { data: [{ id: 1 }], error: null };
    const failed = { data: null, error: { message: 'boom' } };
    const noProfile = { data: null, error: null };
    const profile = { data: { ftp: 250 }, error: null };

    // The anon-race signature: all empty, no errors, no profile row.
    expect(looksLikeAnonEmpty([empty, empty, nullData], noProfile)).toBe(true);
    // A signed-in user always has a profile row → a genuinely-empty new
    // account does not trip the gate.
    expect(looksLikeAnonEmpty([empty, empty, empty], profile)).toBe(false);
    // Any rows anywhere → not the race.
    expect(looksLikeAnonEmpty([empty, rows, empty], noProfile)).toBe(false);
    // Any error anywhere → a different failure, handled by the error path.
    expect(looksLikeAnonEmpty([empty, failed, empty], noProfile)).toBe(false);
    expect(looksLikeAnonEmpty([empty, empty, empty], failed)).toBe(false);
  });
});

describe('null-valued server load rows', () => {
  it('falls back to the client EWA when server rows carry null tfi/afi', () => {
    // 90 days of server rows that exist but have no values — must not zero
    // fitness (Number(null) === 0 is finite); the ride-derived EWA should win.
    const nullRows: ServerLoadRow[] = [];
    for (let i = 0; i <= 42; i++) {
      nullRows.push({ date: fmt(addDays(NOW, i - 42)), tfi: null, afi: null, form_score: null });
    }
    const rides = [];
    for (let i = 1; i <= 40; i++) {
      rides.push({ start_date: `${fmt(addDays(NOW, -i))}T14:00:00Z`, rss: 80, moving_time: 5400 });
    }
    const data = assembleSpine(baseInput({ serverLoad: nullRows, activities: rides }));
    const today = data.days[data.todayIndex];
    expect(today.tfi).toBeGreaterThan(10); // EWA over 40 × 80-RSS days
    expect(today.afi).toBeGreaterThan(10);
  });

  it('ignores a null form_score on today and derives fs from tfi − afi', () => {
    const rows = serverLoad();
    rows[rows.length - 1] = { ...rows[rows.length - 1], form_score: null };
    const data = assembleSpine(baseInput({ serverLoad: rows }));
    const today = data.days[data.todayIndex];
    expect(today.fs).toBe(today.tfi - today.afi);
  });
});

describe('first-run (no history)', () => {
  it('suppresses the summary line and form-claiming coach copy when history is thin', () => {
    const data = assembleSpine(baseInput({ serverLoad: [], activities: [] }));
    expect(data.hasHistory).toBe(false);
    expect(data.summaryLine).toBeNull();
    expect(data.coach.recBody).not.toMatch(/grey zone|fresh|fatigued|loading/);
  });
});

describe('future-day weekly volume', () => {
  it("computes a future day's volHours as the trailing-7-day blend of actuals and plan", () => {
    // 90 min ridden yesterday + a 60-min planned workout tomorrow.
    const activities = [
      { start_date: `${fmt(addDays(NOW, -1))}T10:00:00Z`, rss: 80, moving_time: 5400 },
    ];
    const planned: PlannedRow[] = [
      { scheduled_date: fmt(addDays(NOW, 1)), name: 'Endurance', workout_type: 'endurance', target_rss: 60, duration_minutes: 60 },
    ];
    const data = assembleSpine(baseInput({ activities, planned }));
    const tomorrow = data.days[data.todayIndex + 1];
    // Window covers both: 1.5h actual + 1h planned = 2.5h — not the old
    // single-day 1.0h mislabeled as a week.
    expect(tomorrow.volHours).toBeCloseTo(2.5, 5);
    // 8 days out the ridden 90 min has left the window; only the plan remains.
    const dayEight = data.days[data.todayIndex + 8];
    expect(dayEight.volHours).toBeCloseTo(0, 5);
  });
});

describe('adaptive tau parity', () => {
  it('client-filled tail days step with the athlete tau, not hard-coded 42/7', () => {
    // Server rows through yesterday only, flat at tfi/afi 30; today is
    // client-filled from a 200-RSS ride.
    const rows: ServerLoadRow[] = [];
    for (let i = 0; i < 42; i++) {
      rows.push({ date: fmt(addDays(NOW, i - 42)), tfi: 30, afi: 30, form_score: 0 });
    }
    const activities = [{ start_date: `${fmt(NOW)}T08:00:00`, rss: 200, moving_time: 7200 }];
    const data = assembleSpine(
      baseInput({ serverLoad: rows, activities, tfiTau: 49, afiTau: 8 }),
    );
    const today = data.days[42];
    expect(today.tfi).toBe(Math.round(30 + (200 - 30) / 49)); // 33, not 34 (τ=42)
    expect(today.afi).toBe(Math.round(30 + (200 - 30) / 8)); // 51, not 54 (τ=7)
  });
});

describe('today-floor guard', () => {
  it('steps past a stale today server row that undercounts client-visible RSS', () => {
    // Yesterday's server state 30/30; today's server row froze at rss 20 but
    // the client can see an 80-RSS ride — the row is stale, so today's values
    // must come from stepping yesterday's state, not from the stale row.
    const rows: ServerLoadRow[] = [];
    for (let i = 0; i < 42; i++) {
      rows.push({ date: fmt(addDays(NOW, i - 42)), tfi: 30, afi: 30, form_score: 0 });
    }
    rows.push({ date: fmt(NOW), tfi: 31, afi: 29, form_score: 0, rss: 20 });
    const activities = [{ start_date: `${fmt(NOW)}T08:00:00`, rss: 80, moving_time: 5400 }];
    const data = assembleSpine(baseInput({ serverLoad: rows, activities }));
    const today = data.days[42];
    expect(today.afi).toBe(Math.round(30 + (80 - 30) / 7)); // 37, not the stale 29
    expect(today.tfi).toBe(Math.round(30 + (80 - 30) / 42));
  });

  it('adopts a today server row whose rss covers the client-visible RSS', () => {
    const rows: ServerLoadRow[] = [];
    for (let i = 0; i < 42; i++) {
      rows.push({ date: fmt(addDays(NOW, i - 42)), tfi: 30, afi: 30, form_score: 0 });
    }
    rows.push({ date: fmt(NOW), tfi: 31, afi: 37, form_score: 0, rss: 80 });
    const activities = [{ start_date: `${fmt(NOW)}T08:00:00`, rss: 80, moving_time: 5400 }];
    const data = assembleSpine(baseInput({ serverLoad: rows, activities }));
    expect(data.days[42].afi).toBe(37); // the fresh server row wins as usual
  });
});

describe('form score timing (spec §3.6 — readiness going INTO the day)', () => {
  it("client-computed today uses yesterday's TFI/AFI: a hard ride today does not tank today's form", () => {
    const data = assembleSpine(
      baseInput({
        serverLoad: [],
        activities: [{ start_date: `${fmt(NOW)}T08:00:00`, rss: 200, moving_time: 7200 }],
      }),
    );
    const today = data.days[42];
    expect(today.rss).toBe(200);
    // Going into today the EWA state was 0/0 → FS 0. The old same-day
    // computation returned round(200/42) − round(200/7) ≈ −24.
    expect(today.fs).toBe(0);
    // ...and the ride's fatigue shows up in TOMORROW's form instead.
    expect(data.days[43].fs).toBe(Math.round(200 / 42 - 200 / 7));
  });

  it("a server row's stored form_score is preferred for its own day", () => {
    const data = assembleSpine(baseInput());
    // Fixture rows carry form_score 4 on every day.
    expect(data.days[42].fs).toBe(4);
    expect(data.days[20].fs).toBe(4);
  });
});

describe('assembleSpine — beat inputs', () => {
  /** 09:00 local, `daysAgo` before NOW. */
  const at = (daysAgo: number) => {
    const d = addDays(NOW, -daysAgo);
    d.setHours(9, 0, 0, 0);
    return d;
  };
  const ride = (daysAgo: number, rss: number, minutes: number) =>
    ({
      start_date: at(daysAgo).toISOString(),
      name: 'Morning ride',
      rss,
      moving_time: minutes * 60,
    }) as unknown as AssembleInput['activities'][number];
  const stat = (daysAgo: number, over: Partial<RideStat> = {}): RideStat => ({
    date: fmt(at(daysAgo)),
    durationSec: 60 * 60,
    distanceKm: 30,
    elevationM: 150,
    polyline: 'geo',
    ...over,
  });

  it('carries the plan row id through so the route link can deep-link it', () => {
    const data = assembleSpine(
      baseInput({
        todaysWorkout: { name: 'Session', type: 'tempo', durationMin: 60, targetRss: 55, workoutId: 'plan-42' },
      }),
    );
    expect(data.todaysWorkout?.workoutId).toBe('plan-42');
  });

  it('defaults the workout id to null rather than undefined', () => {
    const data = assembleSpine(
      baseInput({ todaysWorkout: { name: 'Session', type: 'tempo', durationMin: 60, targetRss: 55 } }),
    );
    expect(data.todaysWorkout?.workoutId).toBeNull();
  });

  it('finds the most recent ride and how long ago it was', () => {
    const data = assembleSpine(
      baseInput({
        activities: [ride(9, 50, 60), ride(3, 82, 105)],
        rideStats: [stat(9), stat(3, { durationSec: 105 * 60, distanceKm: 52, polyline: 'recent-geo' })],
      }),
    );
    expect(data.lastRide).toMatchObject({
      daysAgo: 3,
      durationMin: 105,
      rss: 82,
      distanceKm: 52,
      polyline: 'recent-geo',
      rideCountOnDate: 1,
    });
  });

  it('keeps an indoor ride as the last ride instead of an older outdoor one', () => {
    // The classic mis-attribution: recentRides is polyline-filtered, so the
    // newest ride with geometry is not always the newest ride.
    const data = assembleSpine(
      baseInput({
        activities: [ride(4, 60, 90), ride(0, 45, 45)],
        rideStats: [stat(4), stat(0, { durationSec: 45 * 60, distanceKm: 20, polyline: null })],
      }),
    );
    expect(data.lastRide?.daysAgo).toBe(0);
    expect(data.lastRide?.polyline).toBeNull();
    expect(data.lastRide?.durationMin).toBe(45);
  });

  it('reports the largest ride of a multi-ride day and says how many there were', () => {
    const data = assembleSpine(
      baseInput({
        activities: [ride(0, 70, 140), ride(0, 15, 20)],
        rideStats: [
          stat(0, { durationSec: 140 * 60, distanceKm: 58, polyline: 'long' }),
          stat(0, { durationSec: 20 * 60, distanceKm: 7, polyline: 'short' }),
        ],
      }),
    );
    expect(data.lastRide?.polyline).toBe('long');
    expect(data.lastRide?.rideCountOnDate).toBe(2);
  });

  it('has no last ride when nothing has been ridden', () => {
    expect(assembleSpine(baseInput()).lastRide).toBeNull();
  });

  it('takes the typical ride length from the trailing four weeks', () => {
    const data = assembleSpine(
      baseInput({
        rideStats: [
          stat(2, { durationSec: 45 * 60 }),
          stat(6, { durationSec: 75 * 60 }),
          stat(30, { durationSec: 300 * 60 }), // outside the window
        ],
      }),
    );
    expect(data.typicalRideMin).toBe(60); // median of 45 and 75
  });

  it('passes the newest activity identity through for the felt-response deferral', () => {
    const data = assembleSpine(
      baseInput({ latestActivity: { id: 'act-1', startDate: '2026-06-30T09:00:00Z' } }),
    );
    expect(data.latestActivity).toEqual({ id: 'act-1', startDate: '2026-06-30T09:00:00Z' });
    expect(assembleSpine(baseInput()).latestActivity).toBeNull();
  });
});
