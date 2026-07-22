import { describe, it, expect, vi } from 'vitest';
import { fetchCoachEnrichmentData, buildCoachEnrichmentBlock } from './coachContextEnrichment.js';

// Wednesday 2026-07-22 18:00 UTC = Wed Jul 22 12:00 in America/Denver.
// The local Mon–Sun week is Jul 20 – Jul 26.
const NOW = new Date('2026-07-22T18:00:00Z');
const TZ = 'America/Denver';

const PROFILE = { ftp: 285, weight_kg: 78 };

function ride(overrides = {}) {
  return {
    id: 'a1',
    name: 'Lunch Ride',
    type: 'Ride',
    sport_type: 'Ride',
    start_date: '2026-07-21T18:00:00Z',
    distance: 42100,
    moving_time: 5700,
    average_watts: 218,
    rss: 78,
    tss: null,
    ...overrides,
  };
}

function workout(overrides = {}) {
  return {
    id: 'w1',
    scheduled_date: '2026-07-20',
    name: 'Endurance Z2',
    workout_type: 'endurance',
    target_rss: 65,
    target_tss: null,
    actual_rss: null,
    actual_tss: null,
    target_duration: 90,
    completed: false,
    skipped_reason: null,
    activity_id: null,
    ...overrides,
  };
}

describe('buildCoachEnrichmentBlock', () => {
  it('returns null when there is no data and no FTP', () => {
    expect(buildCoachEnrichmentBlock(null, { profile: null, timezone: TZ, now: NOW })).toBeNull();
    expect(buildCoachEnrichmentBlock(null, { profile: { ftp: null }, timezone: TZ, now: NOW })).toBeNull();
  });

  it('always includes the header and precedence note when it renders', () => {
    const block = buildCoachEnrichmentBlock(null, { profile: PROFILE, timezone: TZ, now: NOW });
    expect(block).toContain('=== SERVER TRAINING SNAPSHOT (DB-VERIFIED) ===');
    expect(block).toContain('PRECEDENCE');
    expect(block).toContain('authoritative for CURRENT fitness');
  });

  it('renders FTP with W/kg when weight is present, without it otherwise', () => {
    const withWeight = buildCoachEnrichmentBlock(null, { profile: PROFILE, timezone: TZ, now: NOW });
    expect(withWeight).toContain('FTP: 285W | Weight: 78kg (3.7 W/kg)');

    const noWeight = buildCoachEnrichmentBlock(null, { profile: { ftp: 285 }, timezone: TZ, now: NOW });
    expect(noWeight).toContain('FTP: 285W');
    expect(noWeight).not.toContain('W/kg');
  });

  it('renders the server FITNESS line with an as-of date and confidence label', () => {
    const data = {
      recentActivities: [],
      latestLoad: { date: '2026-07-21', tfi: 62.4, afi: 70.8, form_score: -8.6, rss: 0, fs_confidence: 0.93 },
      weekPlanned: [],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: PROFILE, timezone: TZ, now: NOW });
    expect(block).toContain('FITNESS (server-computed, as of 2026-07-21): TFI 62, AFI 71, FS -9 (confidence: high)');
  });

  it('omits the FITNESS line when there is no load row, but still renders the block', () => {
    const data = { recentActivities: [ride()], latestLoad: null, weekPlanned: [] };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    expect(block).not.toContain('FITNESS (server-computed');
    expect(block).toContain('RECENT ACTIVITIES');
  });

  it('buckets activities into the athlete-local Mon–Sun week (tz-aware)', () => {
    const data = {
      recentActivities: [
        // 2026-07-20T02:00Z is Sunday Jul 19 evening in Denver → PREVIOUS week.
        ride({ id: 'prev', name: 'Sunday Night', start_date: '2026-07-20T02:00:00Z', rss: 50 }),
        // Tuesday Jul 21 local → this week.
        ride({ id: 'cur', name: 'Tuesday Ride', start_date: '2026-07-21T18:00:00Z', rss: 78 }),
      ],
      latestLoad: null,
      weekPlanned: [],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    expect(block).toContain("THIS WEEK (Mon Jul 20 – Sun Jul 26, athlete's timezone):");
    // Only the Tuesday ride counts toward this week's totals.
    expect(block).toContain('Completed: 1 session — 42 km');
    expect(block).toContain('78 RSS total');
    // The Sunday-evening ride still appears in RECENT ACTIVITIES (last 14 days).
    expect(block).toContain('Sunday Night');
  });

  it('falls back to legacy tss when canonical rss is absent', () => {
    const data = {
      recentActivities: [ride({ rss: null, tss: 91 })],
      latestLoad: null,
      weekPlanned: [workout({ target_rss: null, target_tss: 70 })],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    expect(block).toContain('91 RSS total');
    expect(block).toContain('~70 RSS');
  });

  it('computes workout statuses and past-due-only weekly compliance', () => {
    const data = {
      recentActivities: [],
      latestLoad: null,
      weekPlanned: [
        workout({ id: 'w1', scheduled_date: '2026-07-20', completed: true, actual_rss: 71 }),
        workout({ id: 'w2', scheduled_date: '2026-07-21', name: 'Tempo', completed: false }),
        workout({ id: 'w3', scheduled_date: '2026-07-22', name: 'Sweet Spot 3x12', target_rss: 85 }),
        workout({ id: 'w4', scheduled_date: '2026-07-24', name: 'Long Ride', target_rss: 120 }),
        workout({ id: 'w5', scheduled_date: '2026-07-25', name: 'Skipped One', skipped_reason: 'sick' }),
        // Rest day past due — must not count against compliance.
        workout({ id: 'w6', scheduled_date: '2026-07-20', name: 'Rest', workout_type: 'rest', target_rss: null }),
      ],
      weekPlannedExtra: null,
    };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    // 2 past-due non-rest (w1 done, w2 missed) → 50%.
    expect(block).toContain('Plan status: 1/2 past-due workouts done (weekly compliance 50%)');
    expect(block).toContain('[DONE] Endurance Z2');
    expect(block).toContain('-> actual 71 RSS (109%)');
    expect(block).toContain('[MISSED] Tempo');
    expect(block).toContain('[TODAY] Sweet Spot 3x12');
    expect(block).toContain('[UPCOMING] Long Ride');
    expect(block).toContain('[SKIPPED] Skipped One');
    // Upcoming: w3 (85) + w4 (120) = 205. w5 is skipped, excluded.
    expect(block).toContain('2 upcoming (~205 RSS remaining)');
  });

  it('reports 100% compliance when nothing is past due', () => {
    const data = {
      recentActivities: [],
      latestLoad: null,
      weekPlanned: [workout({ scheduled_date: '2026-07-24' })],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    expect(block).toContain('weekly compliance 100%');
  });

  it('trims planned workouts outside the local week', () => {
    const data = {
      recentActivities: [],
      latestLoad: null,
      weekPlanned: [
        workout({ id: 'last-week', scheduled_date: '2026-07-19', name: 'Last Sunday' }),
        workout({ id: 'next-week', scheduled_date: '2026-07-27', name: 'Next Monday' }),
      ],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: PROFILE, timezone: TZ, now: NOW });
    expect(block).not.toContain('Last Sunday');
    expect(block).not.toContain('Next Monday');
  });

  it('caps recent activities at 10 lines, newest first', () => {
    const recentActivities = Array.from({ length: 14 }, (_, i) =>
      ride({
        id: `a${i}`,
        name: `Ride ${i}`,
        start_date: new Date(Date.UTC(2026, 6, 22 - i, 18)).toISOString(),
      })
    );
    const block = buildCoachEnrichmentBlock(
      { recentActivities, latestLoad: null, weekPlanned: [] },
      { profile: null, timezone: TZ, now: NOW }
    );
    expect(block).toContain('Ride 0');
    expect(block).toContain('Ride 9');
    expect(block).not.toContain('Ride 10');
  });

  it('splits weekly volume per sport via getSportType', () => {
    const data = {
      recentActivities: [
        ride({ id: 'r1', start_date: '2026-07-21T18:00:00Z' }),
        ride({ id: 'r2', name: 'Trail Run', type: 'TrailRun', sport_type: 'TrailRun', distance: 12000, moving_time: 4200, average_watts: null, rss: 40, start_date: '2026-07-20T18:00:00Z' }),
      ],
      latestLoad: null,
      weekPlanned: [],
    };
    const block = buildCoachEnrichmentBlock(data, { profile: null, timezone: TZ, now: NOW });
    expect(block).toContain('cycling: 1, 42 km');
    expect(block).toContain('218W avg');
    expect(block).toContain('running: 1, 12 km');
  });

  it('renders race goal details only for goals with detail fields', () => {
    const raceGoals = [
      { id: 'g1', name: 'Steamboat Gravel', priority: 'A', race_date: '2026-08-16', distance_km: 230, elevation_gain_m: 2900, goal_time_minutes: 510, goal_power_watts: null },
      { id: 'g2', name: 'Bare Goal', priority: 'B', race_date: '2026-09-01', distance_km: null, elevation_gain_m: null, goal_time_minutes: null, goal_power_watts: null },
    ];
    const block = buildCoachEnrichmentBlock(
      { recentActivities: [], latestLoad: null, weekPlanned: [] },
      { profile: PROFILE, raceGoals, timezone: TZ, now: NOW }
    );
    expect(block).toContain('RACE GOAL DETAILS (dates and countdowns are in the TEMPORAL ANCHOR — do not recompute):');
    expect(block).toContain('Steamboat Gravel [A]: 230 km, 2900 m gain, goal time 8h30m');
    expect(block).not.toContain('Bare Goal');
  });
});

describe('fetchCoachEnrichmentData', () => {
  function makeStub(tableResults = {}) {
    const queried = [];
    const stub = {
      from(table) {
        queried.push(table);
        const chain = {};
        for (const m of ['select', 'eq', 'is', 'or', 'gte', 'lte', 'order', 'limit']) {
          chain[m] = () => chain;
        }
        chain.maybeSingle = () =>
          Promise.resolve(tableResults[table] ?? { data: null, error: null });
        chain.then = (resolve) =>
          Promise.resolve(tableResults[table] ?? { data: [], error: null }).then(resolve);
        return chain;
      },
    };
    return { stub, queried };
  }

  it('queries activities, training_load_daily, and planned_workouts', async () => {
    const { stub, queried } = makeStub({
      activities: { data: [ride()], error: null },
      training_load_daily: { data: { date: '2026-07-21', tfi: 62 }, error: null },
      planned_workouts: { data: [workout()], error: null },
    });
    const result = await fetchCoachEnrichmentData(stub, 'user-1');
    expect(queried).toEqual(expect.arrayContaining(['activities', 'training_load_daily', 'planned_workouts']));
    expect(result.recentActivities).toHaveLength(1);
    expect(result.latestLoad.tfi).toBe(62);
    expect(result.weekPlanned).toHaveLength(1);
  });

  it('returns null (non-blocking) when the fetch throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stub = { from: () => { throw new Error('boom'); } };
    const result = await fetchCoachEnrichmentData(stub, 'user-1');
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
