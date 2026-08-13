import { describe, it, expect } from 'vitest';
import {
  deriveCurrentWeek,
  derivePhaseFromBlocks,
  weekBoundsInTz,
  formatDateInTz,
} from './contextHelpers.js';

// The production plan this fix was diagnosed against: started 2026-06-28,
// 13 weeks, event 2026-09-26.
const RAD_PLAN = { start_date: '2026-06-28', started_at: '2026-06-28 00:00:00+00', duration_weeks: 13 };

const RAD_BLOCKS = [
  { block_type: 'maintenance', start_date: '2026-06-28', end_date: '2026-07-09' },
  { block_type: 'reactivation', start_date: '2026-07-10', end_date: '2026-07-16' },
  { block_type: 'aerobic_build', start_date: '2026-07-17', end_date: '2026-07-30' },
  { block_type: 'threshold', start_date: '2026-07-31', end_date: '2026-08-20' },
  { block_type: 'vo2', start_date: '2026-08-21', end_date: '2026-09-03' },
  { block_type: 'race_specific', start_date: '2026-09-04', end_date: '2026-09-13' },
  { block_type: 'taper', start_date: '2026-09-14', end_date: '2026-09-25' },
];

describe('deriveCurrentWeek', () => {
  it('returns 1 on the start date', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2026-06-28')).toBe(1);
  });

  it('returns 1 through day 6', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2026-07-04')).toBe(1);
  });

  it('rolls to week 2 on day 7', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2026-07-05')).toBe(2);
  });

  it('computes week 7 for the production repro (2026-08-13)', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2026-08-13')).toBe(7);
  });

  it('clamps to duration_weeks after the plan ends', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2027-01-01')).toBe(13);
  });

  it('clamps to 1 before the start date', () => {
    expect(deriveCurrentWeek(RAD_PLAN, '2026-06-01')).toBe(1);
  });

  it('prefers started_at over start_date', () => {
    const plan = { start_date: '2026-01-01', started_at: '2026-06-28T00:00:00Z', duration_weeks: 13 };
    expect(deriveCurrentWeek(plan, '2026-08-13')).toBe(7);
  });

  it('returns 1 when dates are missing or malformed', () => {
    expect(deriveCurrentWeek({}, '2026-08-13')).toBe(1);
    expect(deriveCurrentWeek(null, '2026-08-13')).toBe(1);
    expect(deriveCurrentWeek(RAD_PLAN, undefined)).toBe(1);
    expect(deriveCurrentWeek({ start_date: 'garbage' }, '2026-08-13')).toBe(1);
  });

  it('does not clamp when duration_weeks is missing', () => {
    expect(deriveCurrentWeek({ start_date: '2026-06-28' }, '2027-01-02')).toBe(27);
  });
});

describe('derivePhaseFromBlocks', () => {
  it('finds the block containing today (production repro: threshold on 2026-08-13)', () => {
    const phase = derivePhaseFromBlocks(RAD_BLOCKS, '2026-08-13');
    expect(phase).not.toBeNull();
    expect(phase.blockType).toBe('threshold');
    expect(phase.blockName).toBe('Threshold');
    expect(phase.blockPurpose).toMatch(/sustainable power/i);
  });

  it('resolves to the first block before the arc starts', () => {
    expect(derivePhaseFromBlocks(RAD_BLOCKS, '2026-06-01').blockType).toBe('maintenance');
  });

  it('resolves to the last block after the arc ends', () => {
    expect(derivePhaseFromBlocks(RAD_BLOCKS, '2026-10-15').blockType).toBe('taper');
  });

  it('resolves a gap between blocks to the next upcoming block', () => {
    const gappy = [
      { block_type: 'aerobic_build', start_date: '2026-07-01', end_date: '2026-07-10' },
      { block_type: 'taper', start_date: '2026-07-20', end_date: '2026-07-27' },
    ];
    expect(derivePhaseFromBlocks(gappy, '2026-07-15').blockType).toBe('taper');
  });

  it('returns null for missing/invalid blocks so callers can fall back', () => {
    expect(derivePhaseFromBlocks(null, '2026-08-13')).toBeNull();
    expect(derivePhaseFromBlocks([], '2026-08-13')).toBeNull();
    expect(derivePhaseFromBlocks([{ block_type: 'x' }], '2026-08-13')).toBeNull();
    expect(derivePhaseFromBlocks(RAD_BLOCKS, undefined)).toBeNull();
  });

  it('labels unknown block types with the raw type', () => {
    const blocks = [{ block_type: 'mystery', start_date: '2026-08-01', end_date: '2026-08-31' }];
    const phase = derivePhaseFromBlocks(blocks, '2026-08-13');
    expect(phase.blockName).toBe('mystery');
    expect(phase.blockPurpose).toBe('');
  });
});

describe('weekBoundsInTz', () => {
  it('returns Monday → next Monday for a mid-week date', () => {
    // 2026-08-13 is a Thursday; noon UTC is the same date in Denver.
    const now = new Date('2026-08-13T12:00:00Z');
    const { weekStartStr, weekEndStr } = weekBoundsInTz(now, 'America/Denver');
    expect(weekStartStr).toBe('2026-08-10');
    expect(weekEndStr).toBe('2026-08-17');
  });

  it('treats Sunday as the last day of the week', () => {
    const now = new Date('2026-08-16T12:00:00Z'); // Sunday
    const { weekStartStr, weekEndStr } = weekBoundsInTz(now, 'America/Denver');
    expect(weekStartStr).toBe('2026-08-10');
    expect(weekEndStr).toBe('2026-08-17');
  });

  it('respects the timezone when UTC has rolled past midnight', () => {
    // 03:00 UTC Monday 2026-08-17 is still Sunday 2026-08-16 in Denver.
    const now = new Date('2026-08-17T03:00:00Z');
    const denver = weekBoundsInTz(now, 'America/Denver');
    expect(denver.weekStartStr).toBe('2026-08-10');
    const utc = weekBoundsInTz(now, 'UTC');
    expect(utc.weekStartStr).toBe('2026-08-17');
  });
});

describe('formatDateInTz (moved from assembleFitnessContext)', () => {
  it('formats in the given timezone', () => {
    const d = new Date('2026-07-23T03:00:00Z');
    expect(formatDateInTz(d, 'America/Denver')).toBe('2026-07-22');
    expect(formatDateInTz(d, 'UTC')).toBe('2026-07-23');
  });
});
