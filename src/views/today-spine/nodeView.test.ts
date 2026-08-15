import { describe, it, expect } from 'vitest';
import { buildNodeVM, ctlDeltaPctFromDays } from './nodeView';
import { C } from './tokens';
import type { DayNode } from './types';

function daysWithTfi(values: number[]): Array<{ tfi: number }> {
  return values.map((tfi) => ({ tfi }));
}

function makeDay(index: number, overrides: Partial<DayNode> = {}): DayNode {
  return {
    index,
    date: '2026-07-22',
    dateLabel: 'WED 22 JUL',
    isFuture: false,
    tfi: 60,
    afi: 55,
    fs: 5,
    rss: 0,
    planned: false,
    volHours: 4,
    activity: { tag: 'REST', tagColor: C.text3, name: 'Recovery day', meta: 'off the bike' },
    ...overrides,
  };
}

function makeDays(todayFs: number): DayNode[] {
  return Array.from({ length: 43 }, (_, i) => makeDay(i, i === 42 ? { fs: todayFs } : {}));
}

describe('buildNodeVM — state copy follows the spec §5 form band', () => {
  it.each([
    [25, 'Too fresh — fitness fading', C.orange],
    [15, 'Fresh', C.gold],
    [0, 'In the grey zone', C.text3],
    [-15, 'Carrying productive load', C.teal],
    [-40, 'Deep in a heavy block', C.coral],
  ])('fs=%d → "%s" with a matching color', (fs, stateText, color) => {
    const vm = buildNodeVM(makeDays(fs as number), 42, 42);
    expect(vm.stateText).toBe(stateText);
    expect(vm.stateColor).toBe(color);
  });

  it('renders a future day as a conditional sentence, not a bare projected state', () => {
    const days = makeDays(5).map((d, i) =>
      i === 40 ? { ...d, fs: -12 } : d,
    );
    // Pretend day 40 is in the future relative to a today at index 30.
    const vm = buildNodeVM(days, 40, 30);
    expect(vm.isFuture).toBe(true);
    expect(vm.stateText).toBe("On this path, you'd be carrying productive load");
  });
});

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
