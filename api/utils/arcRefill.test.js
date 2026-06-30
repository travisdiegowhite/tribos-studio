import { describe, it, expect } from 'vitest';
import { buildArc, generateArcWorkouts } from './arcBuilder.js';
import { coefficientsForMode } from './sequencerBlockOps.js';
import { computeArcRefill, computeDailyStatsFromActivities } from './arcRefill.js';

// A real arc to drive the tests.
const TODAY = '2026-06-29';
const RACE = '2026-09-26';
const PLAN_START = TODAY;
const GEN_CTX = { coefficients: undefined, upcoming_events: [{ tier: 'A', date: RACE }] };

const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
const canonical = generateArcWorkouts(arc.blocks, { ctx: GEN_CTX, arcStart: PLAN_START });

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Pick a window whose first day is a quality (threshold/vo2/tempo) session, so
// the readiness rules have something to act on.
const firstQuality = canonical.find(
  (r) => ['threshold', 'vo2', 'tempo'].includes(r.session_type) && r.scheduled_date > TODAY,
);
const WINDOW_START = firstQuality.scheduled_date;
const WINDOW_END = addDays(WINDOW_START, 6);

// Build DB-shaped existing rows for the window (as the canonical, un-eased arc).
function existingFromCanonical(overrides = {}) {
  return canonical
    .filter((r) => r.scheduled_date >= WINDOW_START && r.scheduled_date <= WINDOW_END)
    .map((r) => ({
      id: `row-${r.scheduled_date}`,
      scheduled_date: r.scheduled_date,
      source: 'arc',
      completed: false,
      workout_type: r.workout_type,
      name: r.name,
      target_rss: r.target_rss,
      target_duration: r.target_duration,
      duration_minutes: r.duration_minutes,
      notes: r.notes,
      adjustment_reason: null,
      phase: r.phase,
      ...(overrides[r.scheduled_date] || {}),
    }));
}

const COEFFS = coefficientsForMode('standard');

// daily_stats: index 0 = today. Provide ≥5 entries for the AFI rule.
function dailyStats({ fs = 0, afiToday = 60, afi4dAgo = 60 } = {}) {
  return [
    { form_score: fs, tfi: 80, afi: afiToday },
    { form_score: fs, tfi: 80, afi: (afiToday + afi4dAgo) / 2 },
    { form_score: fs, tfi: 80, afi: (afiToday + afi4dAgo) / 2 },
    { form_score: fs, tfi: 80, afi: (afiToday + afi4dAgo) / 2 },
    { form_score: fs, tfi: 80, afi: afi4dAgo },
  ];
}

const base = (over = {}) => ({
  blocks: arc.blocks,
  planStartDate: PLAN_START,
  windowStart: WINDOW_START,
  windowDays: 7,
  genCtx: GEN_CTX,
  availability: null,
  existingRows: existingFromCanonical(),
  ...over,
});

describe('computeArcRefill', () => {
  it('eases the upcoming quality session to Z2 when Form Score ≤ -15', () => {
    const { upserts, changes } = computeArcRefill(
      base({ gatingCtx: { daily_stats: dailyStats({ fs: -18 }), subjective: [], coefficients: COEFFS } }),
    );
    // The first-day quality session is eased.
    const eased = upserts.find((u) => u.scheduled_date === WINDOW_START);
    expect(eased).toBeTruthy();
    expect(eased.workout_type).toBe('endurance'); // z2
    expect(eased.target_rss).toBe(55);
    expect(eased.target_tss).toBe(55); // dual-write
    expect(eased.duration_minutes).toBe(75);
    expect(eased.adjustment_reason).toMatch(/FS/);
    // Persistable only — no transient gating fields leak into the write.
    expect(eased).not.toHaveProperty('session_type');
    expect(eased).not.toHaveProperty('prescribed_intervals');
    expect(changes.find((c) => c.scheduled_date === WINDOW_START)?.reason).toMatch(/FS/);
  });

  it('trims the quality target 25% when AFI 4-day growth exceeds the ceiling', () => {
    // FS healthy (FS rule skips); AFI grows 60→90 over 4 days = +50% > 25% ceiling.
    const origRss = canonical.find((r) => r.scheduled_date === WINDOW_START).target_rss;
    const { upserts } = computeArcRefill(
      base({ gatingCtx: { daily_stats: dailyStats({ fs: 0, afiToday: 90, afi4dAgo: 60 }), subjective: [], coefficients: COEFFS } }),
    );
    const trimmed = upserts.find((u) => u.scheduled_date === WINDOW_START);
    expect(trimmed).toBeTruthy();
    // Trim keeps the session type (still a quality day), just lighter.
    expect(trimmed.workout_type).toBe(canonical.find((r) => r.scheduled_date === WINDOW_START).workout_type);
    expect(trimmed.target_rss).toBe(Math.round(origRss * 0.75));
    expect(trimmed.target_rss).toBe(trimmed.target_tss);
    expect(trimmed.adjustment_reason).toMatch(/AFI|growth/i);
  });

  it('restores a previously-eased session to canonical when Form Score recovers', () => {
    // Existing rows: the first-day quality session is currently eased to Z2.
    const easedExisting = existingFromCanonical({
      [WINDOW_START]: {
        workout_type: 'endurance',
        name: 'Endurance Ride',
        target_rss: 55,
        target_duration: 75,
        duration_minutes: 75,
        adjustment_reason: 'FS ≤ -15: no quality work today. Substituting Z2.',
      },
    });
    const canonRow = canonical.find((r) => r.scheduled_date === WINDOW_START);
    const { upserts } = computeArcRefill(
      base({
        existingRows: easedExisting,
        gatingCtx: { daily_stats: dailyStats({ fs: -2 }), subjective: [], coefficients: COEFFS },
      }),
    );
    const restored = upserts.find((u) => u.scheduled_date === WINDOW_START);
    expect(restored).toBeTruthy();
    expect(restored.workout_type).toBe(canonRow.workout_type); // back to threshold/vo2
    expect(restored.target_rss).toBe(canonRow.target_rss);
    expect(restored.adjustment_reason).toBeNull();
  });

  it('never writes manual/coach or completed rows', () => {
    const guarded = existingFromCanonical({
      [WINDOW_START]: { source: 'manual' }, // user-edited that day
    });
    const { upserts } = computeArcRefill(
      base({ existingRows: guarded, gatingCtx: { daily_stats: dailyStats({ fs: -18 }), subjective: [], coefficients: COEFFS } }),
    );
    expect(upserts.find((u) => u.scheduled_date === WINDOW_START)).toBeUndefined();

    const done = existingFromCanonical({ [WINDOW_START]: { completed: true } });
    const r2 = computeArcRefill(
      base({ existingRows: done, gatingCtx: { daily_stats: dailyStats({ fs: -18 }), subjective: [], coefficients: COEFFS } }),
    );
    expect(r2.upserts.find((u) => u.scheduled_date === WINDOW_START)).toBeUndefined();
  });

  it('is a no-op when stats are healthy and rows already canonical', () => {
    const { upserts, changes } = computeArcRefill(
      base({ gatingCtx: { daily_stats: dailyStats({ fs: 5 }), subjective: [], coefficients: COEFFS } }),
    );
    expect(upserts).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('AFI rule stays inert with fewer than 5 daily_stats rows', () => {
    const { upserts } = computeArcRefill(
      base({
        gatingCtx: {
          daily_stats: [{ form_score: 0, tfi: 80, afi: 200 }, { form_score: 0, tfi: 80, afi: 50 }],
          subjective: [],
          coefficients: COEFFS,
        },
      }),
    );
    // No FS breach, AFI growth uncomputable → nothing trimmed.
    expect(upserts).toEqual([]);
  });

  it('returns empty for an arc with no blocks', () => {
    expect(computeArcRefill(base({ blocks: [] }))).toEqual({ upserts: [], changes: [] });
    expect(computeArcRefill(base({ blocks: null }))).toEqual({ upserts: [], changes: [] });
  });

  it('only ever touches rows inside the window', () => {
    const { upserts } = computeArcRefill(
      base({ gatingCtx: { daily_stats: dailyStats({ fs: -18 }), subjective: [], coefficients: COEFFS } }),
    );
    for (const u of upserts) {
      expect(u.scheduled_date >= WINDOW_START && u.scheduled_date <= WINDOW_END).toBe(true);
    }
  });
});

describe('computeDailyStatsFromActivities', () => {
  const ride = (date, tss) => ({
    start_date: `${date}T10:00:00Z`,
    tss,
    type: 'Ride',
    sport_type: 'Ride',
    distance: 40000,
    total_elevation_gain: 150,
    moving_time: 3600,
  });

  it('returns [] with no activities and no server history', () => {
    expect(computeDailyStatsFromActivities([], 250, '2026-06-29', [])).toEqual([]);
  });

  it('puts today first (descending) and drives Form Score negative under heavy recent load', () => {
    // Big load on the days just before today → AFI (τ7) spikes above TFI (τ42) → FS < 0.
    const today = '2026-06-29';
    const acts = [ride('2026-06-26', 150), ride('2026-06-27', 150), ride('2026-06-28', 150)];
    const series = computeDailyStatsFromActivities(acts, 250, today, []);
    expect(series.length).toBeGreaterThanOrEqual(5);
    expect(series[0].date).toBe(today); // most recent first
    expect(series[0].form_score).toBeLessThanOrEqual(-15); // would trip the FS gate
    expect(series[0].afi).toBeGreaterThan(series[0].tfi); // fatigued
  });

  it('prefers a server-history overlay for a day when present', () => {
    const today = '2026-06-29';
    const series = computeDailyStatsFromActivities([], 250, today, [
      { date: today, tfi: 80, afi: 100, form_score: -18 },
    ]);
    expect(series[0].date).toBe(today);
    expect(series[0].form_score).toBe(-18);
  });

  it('produces a series an arc refill actually eases (end-to-end, activity-driven)', () => {
    // Use a window day that is a quality session, then prove heavy load before it eases it.
    const qualityDay = WINDOW_START;
    const before = (n) => {
      const d = new Date(qualityDay + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    const acts = [ride(before(1), 160), ride(before(2), 160), ride(before(3), 160)];
    const daily = computeDailyStatsFromActivities(acts, 250, qualityDay, []);
    const { upserts } = computeArcRefill(
      base({ windowStart: qualityDay, gatingCtx: { daily_stats: daily, subjective: [], coefficients: COEFFS } }),
    );
    const eased = upserts.find((u) => u.scheduled_date === qualityDay);
    expect(eased?.adjustment_reason).toMatch(/FS/);
    expect(eased?.target_rss).toBe(55);
  });
});
