import { describe, it, expect } from 'vitest';
import { ctlDeltaPctFromDays } from './nodeView';

function daysWithTfi(values: number[]): Array<{ tfi: number }> {
  return values.map((tfi) => ({ tfi }));
}

describe('ctlDeltaPctFromDays', () => {
  it('computes the % change vs 27 days back', () => {
    const days = daysWithTfi(Array.from({ length: 43 }, (_, i) => 50 + i * 0.5));
    // today (i=42) = 71, 27 back (i=15) = 57.5 → +23.478…%
    expect(ctlDeltaPctFromDays(days, 42)).toBeCloseTo(((71 - 57.5) / 57.5) * 100, 5);
  });

  it('returns 0 when the base is zero (fresh account ramp)', () => {
    const days = daysWithTfi([0, 0, 0, 10, 20, 30]);
    expect(ctlDeltaPctFromDays(days, 5)).toBe(0);
  });

  it('clamps the lookback at the start of a short history', () => {
    const days = daysWithTfi([40, 50]);
    expect(ctlDeltaPctFromDays(days, 1)).toBeCloseTo(25, 5); // vs index 0
  });
});
