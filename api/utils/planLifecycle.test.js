import { describe, it, expect } from 'vitest';
import { planAnchorDate, planLifecycle, isPlanCurrent } from './planLifecycle.js';

// The production plan that prompted this: built for The Rad (2026-09-26),
// last block ending the day before, still 'active' in October.
const RAD_PLAN = {
  name: 'Plan: The Rad',
  status: 'active',
  started_at: '2026-08-21 00:00:00+00',
  duration_weeks: 6,
  target_event_date: '2026-09-26',
  blocks: [
    { block_type: 'race_specific', start_date: '2026-09-04', end_date: '2026-09-13' },
    { block_type: 'taper', start_date: '2026-09-14', end_date: '2026-09-25' },
  ],
};

describe('planAnchorDate', () => {
  it('prefers target_event_date', () => {
    expect(planAnchorDate(RAD_PLAN)).toBe('2026-09-26');
  });

  it('falls back to the last block end', () => {
    expect(planAnchorDate({ ...RAD_PLAN, target_event_date: null })).toBe('2026-09-25');
  });

  it('falls back to start + duration for template plans', () => {
    expect(planAnchorDate({ start_date: '2026-01-05', duration_weeks: 2 })).toBe('2026-01-18');
  });

  it('is null when nothing dates the plan', () => {
    expect(planAnchorDate({ name: 'undated' })).toBeNull();
  });
});

describe('planLifecycle', () => {
  it('race day itself is still active', () => {
    expect(planLifecycle(RAD_PLAN, '2026-09-26').state).toBe('active');
  });

  it('the day after the anchor is ended', () => {
    expect(planLifecycle(RAD_PLAN, '2026-09-27')).toEqual({
      state: 'ended', anchorDate: '2026-09-26', daysSinceEnd: 1,
    });
  });

  it('reports how long ago it ended', () => {
    expect(planLifecycle(RAD_PLAN, '2026-10-18').daysSinceEnd).toBe(22);
  });

  it('a plan that has not started is upcoming, and current', () => {
    expect(planLifecycle(RAD_PLAN, '2026-08-01').state).toBe('upcoming');
    expect(isPlanCurrent(RAD_PLAN, '2026-08-01')).toBe(true);
  });

  it('never ends an undated plan', () => {
    expect(isPlanCurrent({ name: 'undated' }, '2030-01-01')).toBe(true);
  });

  it('isPlanCurrent is false once ended', () => {
    expect(isPlanCurrent(RAD_PLAN, '2026-10-18')).toBe(false);
  });
});
