import { describe, it, expect } from 'vitest';
import {
  buildArc,
  generateArcWorkouts,
  SESSION_TYPE_TO_WORKOUT_TYPE,
} from './arcBuilder.js';

// Fixed dates keep these pure: buildArc/generateArcWorkouts derive everything from
// the date strings, with no wall-clock dependency.
const TODAY = '2026-06-28';
const RACE = '2026-09-26'; // 90 days out — a full A chain fits.

describe('buildArc', () => {
  it('builds an A-tier block chain spanning today → the day before the race', () => {
    const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
    expect(arc.blocks.length).toBeGreaterThan(0);
    expect(arc.blocks[0].start_date).toBe(TODAY);
    const last = arc.blocks[arc.blocks.length - 1];
    // The plan stops the day before the race (the athlete races on race day).
    expect(last.end_date < RACE).toBe(true);
    // A-tier chains peak into a taper.
    expect(last.block_type).toBe('taper');
  });

  it('uses a shorter chain for a lower-priority tier', () => {
    const a = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
    const c = buildArc({ today: TODAY, raceDate: RACE, tier: 'C' });
    expect(c.chain_used.length).toBeLessThan(a.chain_used.length);
  });

  it('flags a conflict when the race is in the past', () => {
    const arc = buildArc({ today: TODAY, raceDate: '2026-06-01', tier: 'A' });
    expect(arc.validation_status).toBe('conflict');
    expect(arc.blocks).toHaveLength(0);
  });

  it('respects the recovery mode (conservative adds recovery padding)', () => {
    // Conservative mode only changes coefficients; the call must still succeed and
    // produce a valid chain ending in taper.
    const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A', recoveryMode: 'conservative' });
    expect(arc.blocks.length).toBeGreaterThan(0);
    expect(arc.blocks[arc.blocks.length - 1].block_type).toBe('taper');
  });
});

describe('generateArcWorkouts', () => {
  const arc = buildArc({ today: TODAY, raceDate: RACE, tier: 'A' });
  const rows = generateArcWorkouts(arc.blocks, {
    ctx: { upcoming_events: [{ tier: 'A', date: RACE }] },
    arcStart: TODAY,
  });

  it('emits one planned-workout row per day across the whole arc', () => {
    // ~90 days of sessions.
    expect(rows.length).toBeGreaterThan(60);
    for (const r of rows) {
      expect(r.scheduled_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source).toBe('arc');
      expect(r.phase).toBeTruthy();
      expect(r.completed).toBe(false);
      expect(r.workout_id).toBeNull();
      // Dual-write canonical + legacy load (CLAUDE.md metrics freeze).
      expect(r.target_rss).toBe(r.target_tss);
      // workout_type is one of the mapped values.
      expect(Object.values(SESSION_TYPE_TO_WORKOUT_TYPE)).toContain(r.workout_type);
    }
  });

  it('numbers weeks from the arc start', () => {
    expect(rows[0].week_number).toBe(1);
    // Week numbers increase monotonically with date.
    const last = rows[rows.length - 1];
    expect(last.week_number).toBeGreaterThanOrEqual(rows[0].week_number);
  });

  it('lands the taper in the final block of the arc', () => {
    const taperRows = rows.filter((r) => r.phase === 'taper');
    expect(taperRows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].phase).toBe('taper');
  });

  it('maps session types to valid workout types (e.g. vo2 → vo2max)', () => {
    const vo2Rows = rows.filter((r) => r.phase === 'vo2' && r.workout_type === 'vo2max');
    // The vo2 block should contribute at least one vo2max session.
    expect(vo2Rows.length).toBeGreaterThan(0);
  });

  it('returns [] for an empty block list', () => {
    expect(generateArcWorkouts([])).toEqual([]);
    expect(generateArcWorkouts(null)).toEqual([]);
  });
});
