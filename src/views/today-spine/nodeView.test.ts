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
    readiness: 60,
    volHours: 4,
    activity: { tag: 'REST', tagColor: C.text3, name: 'Recovery day', meta: 'off the bike' },
    ...overrides,
  };
}

function makeDays(todayFs: number, todayReadiness: number): DayNode[] {
  return Array.from({ length: 43 }, (_, i) =>
    makeDay(i, i === 42 ? { fs: todayFs, readiness: todayReadiness } : {}),
  );
}

describe('buildNodeVM — ring color follows the spec §5 form band', () => {
  it.each([
    [25, 'TOO FRESH · transition', C.orange],
    [15, 'FRESH', C.gold],
    [0, 'NEUTRAL · grey zone', C.text3],
    [-15, 'LOADING · optimal', C.teal],
    [-40, 'OVERREACHED', C.coral],
  ])('fs=%d → "%s" with a matching ring', (fs, stateText, color) => {
    const vm = buildNodeVM(makeDays(fs as number, 60), 42, 42);
    expect(vm.stateText).toBe(stateText);
    expect(vm.stateColor).toBe(color);
    expect(vm.ringColor).toBe(color);
  });

  it('never lets the ring contradict the state text, regardless of readiness', () => {
    // The old readiness-driven cuts (≥70 teal / ≥45 gold / else coral) showed
    // an alarm-red ring for FS −15 (readiness ≈ 24) next to teal "optimal".
    for (let fs = -50; fs <= 30; fs += 5) {
      for (const readiness of [28, 44, 45, 69, 70, 96]) {
        const vm = buildNodeVM(makeDays(fs, readiness), 42, 42);
        expect(vm.ringColor).toBe(vm.stateColor);
      }
    }
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
