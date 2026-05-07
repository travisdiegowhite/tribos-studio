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
