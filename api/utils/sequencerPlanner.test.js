/**
 * Unit tests for the event-anchored sequence planner (Phase 2).
 * Pure function — no I/O. Verifies block layout, durations, validation status,
 * and edge cases (race in past, very short horizon, conservative coefficients).
 */

import { describe, it, expect } from 'vitest';
import { buildEventAnchoredSequence } from './sequencerPlanner.js';

const STANDARD = {
  recovery_block_days_added: 0,
  hit_spacing_hours: 36,
  afi_growth_ceiling_4d: 0.25,
  afi_tfi_gate: 1.10,
  fs_recovery_target: -5,
};

const CONSERVATIVE = {
  ...STANDARD,
  recovery_block_days_added: 1,
  hit_spacing_hours: 48,
};

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('buildEventAnchoredSequence', () => {
  it('rejects races in the past', () => {
    const out = buildEventAnchoredSequence({
      today: '2026-05-07',
      race_date: '2026-04-01',
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.validation_status).toBe('conflict');
    expect(out.blocks).toHaveLength(0);
  });

  it('builds full A-race chain when horizon is long', () => {
    // 16 weeks out (~112 days) — comfortably fits the full chain
    const today = '2026-05-07';
    const race = addDays(today, 16 * 7);
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.validation_status).toBe('valid');
    expect(out.chain_used).toEqual([
      'aerobic_build', 'threshold', 'vo2', 'race_specific', 'taper',
    ]);
    // Last block ends day-before-race
    expect(out.blocks[out.blocks.length - 1].end_date).toBe(addDays(race, -1));
    // Blocks are contiguous
    for (let i = 1; i < out.blocks.length; i++) {
      expect(out.blocks[i].start_date).toBe(addDays(out.blocks[i - 1].end_date, 1));
    }
  });

  it('drops aerobic_build when horizon is too short for full chain', () => {
    const today = '2026-05-07';
    // 50 days: minimum aerobic_build (14) + threshold (14) + vo2 (9)
    //         + race_specific (7) + taper (2) = 46 ≤ 50 ✓
    // But 50 < default total (14+21+14+10+12 = 71), so durations compress.
    // Try a tighter horizon (e.g., 35 days) to force a drop.
    const race = addDays(today, 35);
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.chain_used).not.toContain('aerobic_build');
    expect(out.chain_used).toContain('taper');
  });

  it('compresses to taper-only when horizon is very short', () => {
    const today = '2026-05-07';
    const race = addDays(today, 5); // 5 days out
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    // For 5 days, taper.min=2 + race_specific.min=7 doesn't fit.
    // Should drop to taper-only.
    expect(out.chain_used).toEqual(['taper']);
  });

  it('B-race chain skips aerobic_build and race_specific by default', () => {
    const today = '2026-05-07';
    const race = addDays(today, 12 * 7);
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'B',
      coefficients: STANDARD,
    });
    // B chain = threshold → vo2 → taper, plus filler maintenance/reactivation
    const types = out.blocks.map((b) => b.block_type);
    expect(types).toContain('threshold');
    expect(types).toContain('vo2');
    expect(types).toContain('taper');
    expect(types).not.toContain('race_specific');
    expect(types).not.toContain('aerobic_build');
  });

  it('prepends maintenance + reactivation for long horizons (≥ 14 days filler)', () => {
    const today = '2026-05-07';
    const race = addDays(today, 20 * 7); // 140 days
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.blocks[0].block_type).toBe('maintenance');
    // Reactivation comes second
    expect(out.blocks[1].block_type).toBe('reactivation');
    // First block starts on `today`
    expect(out.blocks[0].start_date).toBe(today);
  });

  it('prepends just reactivation when filler ≤ 14 days', () => {
    const today = '2026-05-07';
    // Race far enough that build chain fits, but filler is small.
    // Default A total = 14+21+14+10+12 = 71. Add 10 day filler → 81-day horizon.
    const race = addDays(today, 81);
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.blocks[0].block_type).toBe('reactivation');
    expect(out.blocks[0].start_date).toBe(today);
  });

  it('honours conservative recovery_block_days_added on reactivation length', () => {
    const today = '2026-05-07';
    const race = addDays(today, 20 * 7);
    const standard = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    const conservative = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: CONSERVATIVE,
    });
    const stdReact = standard.blocks.find((b) => b.block_type === 'reactivation');
    const consReact = conservative.blocks.find((b) => b.block_type === 'reactivation');
    expect(stdReact && consReact).toBeTruthy();
    expect(consReact.duration_days).toBe(stdReact.duration_days + 1);
  });

  it('blocks cover [today, race_date - 1] with no gaps', () => {
    const today = '2026-05-07';
    const race = addDays(today, 90);
    const out = buildEventAnchoredSequence({
      today,
      race_date: race,
      tier: 'A',
      coefficients: STANDARD,
    });
    expect(out.blocks[0].start_date).toBe(today);
    expect(out.blocks[out.blocks.length - 1].end_date).toBe(addDays(race, -1));
    for (let i = 1; i < out.blocks.length; i++) {
      expect(out.blocks[i].start_date).toBe(addDays(out.blocks[i - 1].end_date, 1));
    }
  });
});
