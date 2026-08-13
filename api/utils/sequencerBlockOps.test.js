/**
 * Unit tests for the sequencer block ops JS runtime.
 * Focuses on pure functions (generators + gating + coefficient resolution).
 * Handler-level integration tests live alongside individual /api endpoints.
 */

import { describe, it, expect } from 'vitest';
import {
  generateMaintenanceSessions,
  generateRecoverySessions,
  generateReactivationSessions,
  generateAerobicBuildSessions,
  generateThresholdSessions,
  generateVo2Sessions,
  generateRaceSpecificSessions,
  generateTaperSessions,
  generateSessionsForBlock,
  evaluateGating,
  coefficientsForMode,
} from './sequencerBlockOps.js';

// ────────────────────────────────────────────────────────────────────────
// generateMaintenanceSessions
// ────────────────────────────────────────────────────────────────────────

describe('generateMaintenanceSessions', () => {
  it('produces one row per day inclusive', () => {
    const out = generateMaintenanceSessions('2026-05-05', '2026-05-11');
    expect(out).toHaveLength(7);
    expect(out[0].date).toBe('2026-05-05');
    expect(out[6].date).toBe('2026-05-11');
  });

  it('includes a rest day at index 0 (Monday convention)', () => {
    const out = generateMaintenanceSessions('2026-05-05', '2026-05-05');
    expect(out[0].session_type).toBe('rest');
  });

  it('produces a long ride on Saturday (index 5)', () => {
    const out = generateMaintenanceSessions('2026-05-05', '2026-05-11');
    expect(out[5].long_ride_flag).toBe(true);
  });

  it('intervals on quality days are well-formed', () => {
    const out = generateMaintenanceSessions('2026-05-05', '2026-05-11');
    const tuesday = out[1]; // threshold quality
    expect(tuesday.session_type).toBe('threshold');
    expect(tuesday.prescribed_intervals).toBeTruthy();
    expect(tuesday.prescribed_intervals[0].repeats).toBeGreaterThan(0);
    expect(tuesday.prescribed_intervals[0].duration_min).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// evaluateGating
// ────────────────────────────────────────────────────────────────────────

function ctx(overrides = {}) {
  return {
    today: '2026-05-05',
    coefficients: {
      recovery_block_days_added: 0,
      hit_spacing_hours: 36,
      afi_growth_ceiling_4d: 0.25,
      afi_tfi_gate: 1.10,
      fs_recovery_target: -5,
    },
    daily_stats: [
      { date: '2026-05-05', rss: 0, tfi: 80, afi: 75, form_score: 5 },
    ],
    subjective: [],
    ...overrides,
  };
}

const samplePrescription = {
  date: '2026-05-05',
  session_type: 'threshold',
  target_rss: 90,
  target_duration_min: 75,
  prescribed_intervals: [],
  long_ride_flag: false,
  notes: 'Test',
};

describe('evaluateGating', () => {
  it('lets a healthy quality session through', () => {
    const out = evaluateGating(ctx(), samplePrescription);
    expect(out.gated).toBe(false);
  });

  it('substitutes Z2 when FS ≤ -15 on a quality day', () => {
    const out = evaluateGating(
      ctx({
        daily_stats: [
          { date: '2026-05-05', rss: 0, tfi: 80, afi: 100, form_score: -20 },
        ],
      }),
      samplePrescription
    );
    expect(out.gated).toBe(true);
    expect(out.substitute.session_type).toBe('z2');
    expect(out.reason).toMatch(/FS/);
  });

  it('does NOT substitute Z2 when FS ≤ -15 but session is already easy', () => {
    const out = evaluateGating(
      ctx({
        daily_stats: [
          { date: '2026-05-05', rss: 0, tfi: 80, afi: 100, form_score: -20 },
        ],
      }),
      { ...samplePrescription, session_type: 'z1' }
    );
    expect(out.gated).toBe(false);
  });

  it('trims quality session 25% when AFI growth >ceiling', () => {
    // 4-day AFI growth: today 100 vs 4 days ago 70 ⇒ +43%
    const out = evaluateGating(
      ctx({
        daily_stats: [
          { date: '2026-05-05', rss: 0, tfi: 80, afi: 100, form_score: 0 },
          { date: '2026-05-04', rss: 0, tfi: 80, afi: 95, form_score: 0 },
          { date: '2026-05-03', rss: 0, tfi: 80, afi: 85, form_score: 0 },
          { date: '2026-05-02', rss: 0, tfi: 80, afi: 80, form_score: 0 },
          { date: '2026-05-01', rss: 0, tfi: 80, afi: 70, form_score: 0 },
        ],
      }),
      samplePrescription
    );
    expect(out.gated).toBe(true);
    expect(out.substitute.target_rss).toBe(Math.round(samplePrescription.target_rss * 0.75));
  });

  it('pushes quality when HRV >0.5 SD below baseline', () => {
    const out = evaluateGating(
      ctx({
        subjective: [
          { date: '2026-05-05', hrv_baseline_sd: -0.8 },
        ],
      }),
      samplePrescription
    );
    expect(out.gated).toBe(true);
    expect(out.substitute.session_type).toBe('z1');
  });

  it('forces full rest when wellness ≤ 4', () => {
    const out = evaluateGating(
      ctx({
        subjective: [
          { date: '2026-05-05', wellness_score: 3 },
        ],
      }),
      samplePrescription
    );
    expect(out.gated).toBe(true);
    expect(out.substitute.session_type).toBe('rest');
    expect(out.substitute.target_rss).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// coefficientsForMode
// ────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────
// Phase 2 generators
// ────────────────────────────────────────────────────────────────────────

const sampleCtx = {
  today: '2026-05-05',
  coefficients: {
    recovery_block_days_added: 0,
    hit_spacing_hours: 36,
    afi_growth_ceiling_4d: 0.25,
    afi_tfi_gate: 1.10,
    fs_recovery_target: -5,
  },
  daily_stats: [],
  subjective: [],
  upcoming_events: [
    { id: 'e1', date: '2026-05-15', name: 'Goal Race', tier: 'A', status: 'upcoming' },
  ],
};

describe('generateRecoverySessions', () => {
  it('starts with full rest then easy spin', () => {
    const out = generateRecoverySessions('2026-05-05', '2026-05-09');
    expect(out).toHaveLength(5);
    expect(out[0].session_type).toBe('rest');
    expect(out[0].target_rss).toBe(0);
    expect(out[1].session_type).toBe('z1');
  });
});

describe('generateReactivationSessions', () => {
  it('produces a flat array with rests every 3rd day', () => {
    const out = generateReactivationSessions('2026-05-05', '2026-05-11');
    expect(out).toHaveLength(7);
    expect(out[2].session_type).toBe('rest');
  });
});

describe('generateAerobicBuildSessions', () => {
  it('places long ride flag on Saturday', () => {
    const out = generateAerobicBuildSessions('2026-05-05', '2026-05-11');
    expect(out[5].long_ride_flag).toBe(true);
  });
});

describe('generateThresholdSessions', () => {
  it('places quality on Tuesday and Wednesday for 36h spacing', () => {
    const out = generateThresholdSessions('2026-05-05', '2026-05-11', sampleCtx);
    expect(out[1].session_type).toBe('threshold');
    expect(out[2].session_type).toBe('threshold');
  });

  it('shifts second-quality to Thursday for 48h spacing (conservative)', () => {
    const out = generateThresholdSessions('2026-05-05', '2026-05-11', {
      ...sampleCtx,
      coefficients: { ...sampleCtx.coefficients, hit_spacing_hours: 48 },
    });
    expect(out[1].session_type).toBe('threshold');
    expect(out[2].session_type).not.toBe('threshold');
    expect(out[3].session_type).toBe('threshold');
  });
});

describe('generateVo2Sessions', () => {
  it('emits dense HIT pattern in week 1', () => {
    const out = generateVo2Sessions('2026-05-05', '2026-05-18', sampleCtx);
    const week1 = out.slice(0, 7);
    const hitCount = week1.filter((s) => s.session_type === 'vo2').length;
    expect(hitCount).toBeGreaterThanOrEqual(3);
  });
});

describe('generateRaceSpecificSessions', () => {
  it('emits race_sim early and opener near the end', () => {
    const out = generateRaceSpecificSessions('2026-05-05', '2026-05-14', sampleCtx);
    expect(out[1].session_type).toBe('race_sim');
    expect(out[out.length - 2].session_type).toBe('opener');
  });

  it('switches simulation flavor for crit races', () => {
    const out = generateRaceSpecificSessions('2026-05-05', '2026-05-14', {
      ...sampleCtx,
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Tuesday Night Crit', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(out[1].session_type).toBe('race_sim');
    // Crit sims have 30–60s repeats — first interval duration_min < 1
    expect(out[1].prescribed_intervals[0].duration_min).toBeLessThan(1);
  });
});

describe('generateTaperSessions', () => {
  it('day-before-race is opener with low RSS', () => {
    const out = generateTaperSessions('2026-05-05', '2026-05-14', sampleCtx);
    const dayBefore = out[out.length - 1];
    expect(dayBefore.session_type).toBe('opener');
    expect(dayBefore.target_rss).toBeLessThan(30);
  });

  it('B-race volume factor is 0.6, less aggressive than A', () => {
    const aOut = generateTaperSessions('2026-05-05', '2026-05-12', sampleCtx);
    const bOut = generateTaperSessions('2026-05-05', '2026-05-12', {
      ...sampleCtx,
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'B Race', tier: 'B', status: 'upcoming' },
      ],
    });
    // For B-race, mid-block Z1 sessions use a fixed 0.6 factor → duration 45.
    const mid = Math.floor(bOut.length / 2);
    const bDuration = bOut[mid].target_duration_min;
    expect(bDuration).toBeGreaterThan(0);
    expect(aOut[mid]).toBeTruthy();
  });
});

describe('generateSessionsForBlock dispatch', () => {
  it('dispatches each block_type to its generator', () => {
    const types = [
      'maintenance', 'recovery', 'reactivation',
      'aerobic_build', 'threshold', 'vo2',
      'race_specific', 'taper',
    ];
    for (const t of types) {
      const out = generateSessionsForBlock(t, '2026-05-05', '2026-05-11', sampleCtx);
      expect(out.length).toBe(7);
      expect(out[0].date).toBe('2026-05-05');
    }
  });

  it('throws for unknown block type', () => {
    expect(() =>
      generateSessionsForBlock('not_a_block', '2026-05-05', '2026-05-05', sampleCtx)
    ).toThrow(/Unknown block_type/);
  });
});

describe('coefficientsForMode', () => {
  it('returns standard defaults when mode is unknown', () => {
    const c = coefficientsForMode('not-a-real-mode');
    expect(c.afi_growth_ceiling_4d).toBe(0.25);
    expect(c.fs_recovery_target).toBe(-5);
  });

  it('conservative bumps recovery_block_days_added and tightens fs target', () => {
    const c = coefficientsForMode('conservative');
    expect(c.recovery_block_days_added).toBe(1);
    expect(c.hit_spacing_hours).toBe(48);
    expect(c.fs_recovery_target).toBe(-7);
  });

  it('adaptive tightens AFI growth ceiling without adding rest days', () => {
    const c = coefficientsForMode('adaptive');
    expect(c.recovery_block_days_added).toBe(0);
    expect(c.afi_growth_ceiling_4d).toBe(0.20);
    expect(c.fs_recovery_target).toBe(-3);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Race-demand scaling (ctx.race_demand)
// ────────────────────────────────────────────────────────────────────────

import { buildRaceDemand } from './raceDemand.js';

// The production race the race-demand work was diagnosed against:
// The Rad — 177 km gravel, A-priority, goal 390 min, race 2026-09-26.
const RAD_DEMAND = buildRaceDemand({
  race_date: '2026-09-26',
  race_type: 'gravel',
  goal_time_minutes: 390,
  priority: 'A',
});
const RAD_CTX = {
  upcoming_events: [{ tier: 'A', date: '2026-09-26', name: 'The Rad', race_type: 'gravel' }],
  race_demand: RAD_DEMAND,
};

describe('race-demand fallback parity', () => {
  const BLOCKS = [
    ['maintenance', '2026-06-28', '2026-07-09'],
    ['aerobic_build', '2026-07-17', '2026-07-30'],
    ['threshold', '2026-07-31', '2026-08-20'],
    ['vo2', '2026-08-21', '2026-09-03'],
    ['race_specific', '2026-09-04', '2026-09-13'],
    ['taper', '2026-09-14', '2026-09-25'],
  ];

  it('race_demand: null → byte-identical to the pre-race-demand ctx output', () => {
    const events = [{ tier: 'A', date: '2026-09-26' }];
    for (const [type, start, end] of BLOCKS) {
      const before = generateSessionsForBlock(type, start, end, { upcoming_events: events });
      const withNull = generateSessionsForBlock(type, start, end, {
        upcoming_events: events,
        race_demand: null,
      });
      expect(withNull).toEqual(before);
    }
  });
});

describe('race-demand-aware generation (The Rad)', () => {
  it('threshold block long rides ramp toward the peak instead of holding 165', () => {
    const out = generateThresholdSessions('2026-07-31', '2026-08-20', RAD_CTX);
    const longRides = out.filter((s) => s.long_ride_flag);
    expect(longRides.length).toBeGreaterThan(0);
    for (const lr of longRides) {
      expect(lr.target_duration_min).toBeGreaterThan(165);
      expect(lr.target_duration_min).toBeLessThanOrEqual(280);
      expect(lr.target_rss).toBe(Math.round(lr.target_duration_min * 0.61));
    }
    // Later long rides are longer (the ramp).
    expect(longRides[longRides.length - 1].target_duration_min)
      .toBeGreaterThanOrEqual(longRides[0].target_duration_min);
  });

  it('vo2 block gets a long ride EVERY week for a 4h+ race (the mid-plan volume collapse fix)', () => {
    const out = generateVo2Sessions('2026-08-21', '2026-09-03', RAD_CTX);
    const week1 = out.slice(0, 7).filter((s) => s.long_ride_flag);
    const week2 = out.slice(7, 14).filter((s) => s.long_ride_flag);
    expect(week1.length).toBe(1);
    expect(week2.length).toBe(1);
    expect(week1[0].target_duration_min).toBeGreaterThanOrEqual(220);
    // Week-2 absorption long ride keeps the historical -15% discount.
    expect(week2[0].target_duration_min).toBeLessThan(week1[0].target_duration_min * 1.01);
  });

  it('vo2 long ride never lands on a HIT day', () => {
    const out = generateVo2Sessions('2026-08-21', '2026-09-03', {
      ...RAD_CTX,
      coefficients: { hit_spacing_hours: 36 },
    });
    for (const s of out) {
      if (s.long_ride_flag) expect(s.session_type).toBe('z2');
    }
    const week1 = out.slice(0, 7);
    expect(week1.filter((s) => s.session_type === 'vo2').length).toBeGreaterThan(0);
  });

  it('gravel race-sim fires from structured race_type (no name sniff needed) and scales duration', () => {
    const ctxNoName = {
      upcoming_events: [{ tier: 'A', date: '2026-09-26' }],
      race_demand: RAD_DEMAND,
    };
    const out = generateRaceSpecificSessions('2026-09-04', '2026-09-13', ctxNoName);
    const sim = out[1];
    expect(sim.session_type).toBe('race_sim');
    expect(sim.notes).toMatch(/gravel/i);
    // Sep 5, one week before the Sep 8 peak → 260 min (vs the hardcoded 165).
    expect(sim.target_duration_min).toBe(260);
    expect(sim.target_rss).toBe(Math.round(260 * 0.75));
  });

  it('race-specific block upgrades a filler day to a real endurance ride for long races', () => {
    const out = generateRaceSpecificSessions('2026-09-04', '2026-09-13', RAD_CTX);
    const endurance = out.filter((s) => s.long_ride_flag && s.session_type === 'z2');
    expect(endurance.length).toBe(1);
    // min(0.6*390 = 235 (round5), ramp) — a substantial ride, not a 45-min spin.
    expect(endurance[0].target_duration_min).toBeGreaterThanOrEqual(200);
    // The last 5 days before the race keep the historical taper-in spins.
    const lastFive = out.slice(-5).filter((s) => s.session_type === 'z1');
    for (const s of lastFive) expect(s.target_duration_min).toBe(45);
  });

  it('taper output is untouched by race demand', () => {
    const bare = generateTaperSessions('2026-09-14', '2026-09-25', {
      upcoming_events: [{ tier: 'A', date: '2026-09-26' }],
    });
    const withDemand = generateTaperSessions('2026-09-14', '2026-09-25', RAD_CTX);
    expect(withDemand).toEqual(bare);
  });

  it('short races do not trigger the vo2 weekly long ride or race-specific endurance day', () => {
    const critDemand = buildRaceDemand({
      race_date: '2026-09-26',
      race_type: 'criterium',
      goal_time_minutes: 60,
      priority: 'A',
    });
    const ctx = {
      upcoming_events: [{ tier: 'A', date: '2026-09-26', race_type: 'criterium' }],
      race_demand: critDemand,
    };
    const vo2 = generateVo2Sessions('2026-08-21', '2026-09-03', ctx);
    expect(vo2.slice(0, 7).some((s) => s.long_ride_flag)).toBe(false);
    const rs = generateRaceSpecificSessions('2026-09-04', '2026-09-13', ctx);
    expect(rs[1].session_type).toBe('race_sim');
    expect(rs[1].target_duration_min).toBe(75); // crit sim unchanged
    expect(rs.filter((s) => s.long_ride_flag)).toHaveLength(0);
  });
});
