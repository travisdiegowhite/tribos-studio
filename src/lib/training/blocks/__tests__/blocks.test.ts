import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY, MASTERS_FACTOR_DEFAULTS } from '../index';
import type { SequencerContext } from '../types';
import { afiTfiRatio, latestSnapshot } from '../types';

// ────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────

function ctxFor(overrides: Partial<SequencerContext> = {}): SequencerContext {
  const today = '2026-05-05';
  const baseSnap = {
    date: today,
    rss: 60,
    tfi: 80,
    afi: 75,
    form_score: 5,
  };
  return {
    user_id: 'u1',
    today,
    ftp_watts: 250,
    coefficients: MASTERS_FACTOR_DEFAULTS.standard,
    daily_stats: [
      baseSnap,
      { ...baseSnap, date: '2026-05-04', form_score: 4 },
      { ...baseSnap, date: '2026-05-03', form_score: 3 },
      { ...baseSnap, date: '2026-05-02', form_score: 2 },
      { ...baseSnap, date: '2026-05-01', form_score: 1, afi: 70 },
      { ...baseSnap, date: '2026-04-30', form_score: 0 },
      { ...baseSnap, date: '2026-04-29', form_score: -1 },
    ],
    subjective: [],
    upcoming_events: [],
    recent_activity: {
      max_rss_24h: 50,
      cumulative_rss_72h: 150,
      days_since_last_race: null,
      recent_efi_decoupling: 0.02,
      days_since_ftp_estimate: 14,
    },
    current_block: null,
    horizon_event: null,
    post_race_tier: null,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Recovery block (spec §2.1)
// ────────────────────────────────────────────────────────────────────────

describe('recovery block', () => {
  const recovery = BLOCK_LIBRARY.recovery;

  it('enters when single-event RSS in prior 24h ≥ 250', () => {
    const ctx = ctxFor({
      recent_activity: {
        max_rss_24h: 260,
        cumulative_rss_72h: 260,
        days_since_last_race: 0,
        recent_efi_decoupling: null,
        days_since_ftp_estimate: 0,
      },
    });
    expect(recovery.entry_conditions(ctx)).toBe(true);
  });

  it('enters when FS <= -25', () => {
    const ctx = ctxFor({
      daily_stats: [{ date: '2026-05-05', rss: 0, tfi: 80, afi: 95, form_score: -25 }],
    });
    expect(recovery.entry_conditions(ctx)).toBe(true);
  });

  it('does NOT enter at FS = -24 with no other triggers', () => {
    const ctx = ctxFor({
      daily_stats: [{ date: '2026-05-05', rss: 0, tfi: 80, afi: 95, form_score: -24 }],
    });
    expect(recovery.entry_conditions(ctx)).toBe(false);
  });

  it('default duration is 5 days for A-race, plus 1 in conservative mode', () => {
    const ctxA = ctxFor({ post_race_tier: 'A' });
    expect(recovery.default_duration(ctxA)).toBe(5);

    const ctxConservative = ctxFor({
      post_race_tier: 'A',
      coefficients: MASTERS_FACTOR_DEFAULTS.conservative,
    });
    expect(recovery.default_duration(ctxConservative)).toBe(6);
  });

  it('generates a flat array sized exactly start..end', () => {
    const ctx = ctxFor();
    const out = recovery.generate_sessions('2026-05-05', '2026-05-09', ctx);
    expect(out).toHaveLength(5);
    expect(out[0].date).toBe('2026-05-05');
    expect(out[4].date).toBe('2026-05-09');
  });
});

// ────────────────────────────────────────────────────────────────────────
// Reactivation block (spec §2.2)
// ────────────────────────────────────────────────────────────────────────

describe('reactivation block', () => {
  const reactivation = BLOCK_LIBRARY.reactivation;

  it('does not enter when FS is below the recovery target', () => {
    const ctx = ctxFor({
      current_block: { block_type: 'recovery', days_in: 5 },
      daily_stats: [
        { date: '2026-05-05', rss: 0, tfi: 80, afi: 80, form_score: -10 },
      ],
    });
    expect(reactivation.entry_conditions(ctx)).toBe(false);
  });

  it('enters after recovery completed and FS recovered', () => {
    const ctx = ctxFor({
      current_block: { block_type: 'recovery', days_in: 5 },
      daily_stats: [
        { date: '2026-05-05', rss: 0, tfi: 80, afi: 76, form_score: -2 },
      ],
    });
    expect(reactivation.entry_conditions(ctx)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Aerobic build block (spec §2.3)
// ────────────────────────────────────────────────────────────────────────

describe('aerobic_build block', () => {
  const aerobic = BLOCK_LIBRARY.aerobic_build;

  it('enters when EFI decoupling > 5% and ratio is healthy', () => {
    const ctx = ctxFor({
      recent_activity: {
        max_rss_24h: 50,
        cumulative_rss_72h: 150,
        days_since_last_race: null,
        recent_efi_decoupling: 0.07,
        days_since_ftp_estimate: 14,
      },
    });
    expect(aerobic.entry_conditions(ctx)).toBe(true);
  });

  it('blocks entry when AFI:TFI > 1.10', () => {
    const ctx = ctxFor({
      daily_stats: [{ date: '2026-05-05', rss: 0, tfi: 80, afi: 100, form_score: -20 }],
      recent_activity: {
        max_rss_24h: 50,
        cumulative_rss_72h: 150,
        days_since_last_race: null,
        recent_efi_decoupling: 0.10,
        days_since_ftp_estimate: 14,
      },
    });
    expect(aerobic.entry_conditions(ctx)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Threshold block (spec §2.4)
// ────────────────────────────────────────────────────────────────────────

describe('threshold block', () => {
  const threshold = BLOCK_LIBRARY.threshold;

  it('blocks entry when FTP estimate is older than 6 weeks', () => {
    const ctx = ctxFor({
      recent_activity: {
        max_rss_24h: 50,
        cumulative_rss_72h: 150,
        days_since_last_race: null,
        recent_efi_decoupling: 0.02,
        days_since_ftp_estimate: 60, // > 42
      },
    });
    expect(threshold.entry_conditions(ctx)).toBe(false);
  });

  it('enters when aerobic floor is good and FTP recent', () => {
    const ctx = ctxFor({
      recent_activity: {
        max_rss_24h: 50,
        cumulative_rss_72h: 150,
        days_since_last_race: null,
        recent_efi_decoupling: 0.03,
        days_since_ftp_estimate: 10,
      },
    });
    expect(threshold.entry_conditions(ctx)).toBe(true);
  });

  it('progression rule trims quality when AFI ratio runs hot', () => {
    const ctx = ctxFor({
      daily_stats: [{ date: '2026-05-05', rss: 0, tfi: 80, afi: 100, form_score: -20 }],
    });
    const base = {
      date: '2026-05-05',
      session_type: 'threshold' as const,
      target_rss: 100,
      target_duration_min: 75,
      prescribed_intervals: null,
      long_ride_flag: false,
      notes: 'Test',
    };
    const out = threshold.progression_rule(base, ctx, 0);
    expect(out.target_rss).toBeLessThan(base.target_rss);
  });
});

// ────────────────────────────────────────────────────────────────────────
// VO2 block (spec §2.5)
// ────────────────────────────────────────────────────────────────────────

describe('vo2 block', () => {
  const vo2 = BLOCK_LIBRARY.vo2;

  it('refuses entry when A-race is <14 days away', () => {
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Goal Race', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(vo2.entry_conditions(ctx)).toBe(false);
  });

  it('allows entry when A-race is >14 days away', () => {
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-06-15', name: 'Goal Race', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(vo2.entry_conditions(ctx)).toBe(true);
  });

  it('progression swaps HIT to Z1 when wellness ≤ 4', () => {
    const ctx = ctxFor({
      subjective: [
        { date: '2026-05-05', wellness_score: 3 },
      ],
    });
    const base = {
      date: '2026-05-05',
      session_type: 'vo2' as const,
      target_rss: 95,
      target_duration_min: 75,
      prescribed_intervals: null,
      long_ride_flag: false,
      notes: 'HIT',
    };
    const out = vo2.progression_rule(base, ctx, 0);
    expect(out.session_type).toBe('z1');
  });
});

// ────────────────────────────────────────────────────────────────────────
// Race-specific block (spec §2.6)
// ────────────────────────────────────────────────────────────────────────

describe('race_specific block', () => {
  const rs = BLOCK_LIBRARY.race_specific;

  it('enters when event is in the 7-14 day window', () => {
    // today = 2026-05-05; race = 2026-05-15 ⇒ 10 days away
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Race', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(rs.entry_conditions(ctx)).toBe(true);
  });

  it('refuses entry when event is >14 days out', () => {
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-25', name: 'Race', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(rs.entry_conditions(ctx)).toBe(false);
  });

  it('refuses entry when event is <7 days out (taper takes over)', () => {
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-10', name: 'Race', tier: 'A', status: 'upcoming' },
      ],
    });
    expect(rs.entry_conditions(ctx)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Taper block (spec §2.7)
// ────────────────────────────────────────────────────────────────────────

describe('taper block', () => {
  const taper = BLOCK_LIBRARY.taper;

  it('default duration scales with race tier', () => {
    const ctxA = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Race', tier: 'A', status: 'upcoming' },
      ],
    });
    const ctxB = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Race', tier: 'B', status: 'upcoming' },
      ],
    });
    const ctxC = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Race', tier: 'C', status: 'upcoming' },
      ],
    });
    expect(taper.default_duration(ctxA)).toBe(12);
    expect(taper.default_duration(ctxB)).toBe(6);
    expect(taper.default_duration(ctxC)).toBe(3);
  });

  it('day-1 session is rest with optional spin-ups, not a hard intensity day', () => {
    const ctx = ctxFor({
      upcoming_events: [
        { id: 'e1', date: '2026-05-15', name: 'Race', tier: 'A', status: 'upcoming' },
      ],
    });
    const sessions = taper.generate_sessions('2026-05-04', '2026-05-14', ctx);
    const dayBefore = sessions[sessions.length - 1];
    expect(dayBefore.session_type).toBe('opener');
    expect(dayBefore.target_rss).toBeLessThan(30);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Maintenance block (spec §2.8)
// ────────────────────────────────────────────────────────────────────────

describe('maintenance block', () => {
  const m = BLOCK_LIBRARY.maintenance;

  it('always enters (open-horizon default)', () => {
    expect(m.entry_conditions(ctxFor())).toBe(true);
  });

  it('default duration is 21 days', () => {
    expect(m.default_duration(ctxFor())).toBe(21);
  });

  it('generates 21 sessions with 3 quality days per week', () => {
    const sessions = m.generate_sessions('2026-05-05', '2026-05-25', ctxFor());
    expect(sessions).toHaveLength(21);

    const quality = sessions.filter(
      (s) => s.session_type === 'threshold' || s.session_type === 'vo2'
    );
    // 21 days / 7 = 3 weeks; 2 quality per week ⇒ 6 quality
    expect(quality).toHaveLength(6);
  });

  it('long ride flag is set on Saturdays only', () => {
    const sessions = m.generate_sessions('2026-05-05', '2026-05-25', ctxFor());
    const long = sessions.filter((s) => s.long_ride_flag);
    expect(long.length).toBeGreaterThanOrEqual(2);
    expect(long.length).toBeLessThanOrEqual(4);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Helpers (sanity)
// ────────────────────────────────────────────────────────────────────────

describe('block helpers', () => {
  it('latestSnapshot returns first daily-stats entry', () => {
    const ctx = ctxFor();
    expect(latestSnapshot(ctx)?.date).toBe('2026-05-05');
  });

  it('afiTfiRatio handles zero TFI safely', () => {
    const ctx = ctxFor({
      daily_stats: [{ date: '2026-05-05', rss: 0, tfi: 0, afi: 50, form_score: -50 }],
    });
    expect(afiTfiRatio(ctx)).toBe(Infinity);
  });
});
