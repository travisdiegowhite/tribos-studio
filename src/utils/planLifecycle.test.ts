import { describe, it, expect } from 'vitest';
import { planAnchorDate, planLifecycle, isPlanCurrent } from './planLifecycle';

const RAD_PLAN = {
  started_at: '2026-08-21 00:00:00+00',
  duration_weeks: 6,
  target_event_date: '2026-09-26',
  blocks: [{ block_type: 'taper', start_date: '2026-09-14', end_date: '2026-09-25' }],
};

describe('planLifecycle (browser twin)', () => {
  it('matches the server anchor rules', () => {
    expect(planAnchorDate(RAD_PLAN)).toBe('2026-09-26');
    expect(planAnchorDate({ ...RAD_PLAN, target_event_date: null })).toBe('2026-09-25');
    expect(planAnchorDate({ start_date: '2026-01-05', duration_weeks: 2 })).toBe('2026-01-18');
  });

  it('ends the day after the anchor', () => {
    expect(planLifecycle(RAD_PLAN, '2026-09-26').state).toBe('active');
    expect(planLifecycle(RAD_PLAN, '2026-10-18')).toEqual({
      state: 'ended', anchorDate: '2026-09-26', daysSinceEnd: 22,
    });
    expect(isPlanCurrent(RAD_PLAN, '2026-10-18')).toBe(false);
  });

  it('never ends an undated plan', () => {
    expect(isPlanCurrent({}, '2030-01-01')).toBe(true);
  });
});
