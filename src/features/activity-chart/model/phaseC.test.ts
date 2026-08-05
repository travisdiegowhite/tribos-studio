/**
 * Phase C model tests: selection stats (NP parity with the api algorithm),
 * dt-aware W' balance, and brush window math.
 */

import { describe, it, expect } from 'vitest';
import { computeSelectionStats } from './selectionStats';
import { computeWBalSeries } from './wbal';
import {
  clampBrushWindow,
  resizeBrushWindow,
  panBrushWindow,
  minBrushSpan,
  isFullWindow,
} from './brushState';
import { normalizedPowerFromSamples } from '../../../utils/normalizedPower';
import { calculateWPrimeBalance } from '../../../utils/criticalPower';

// Reference NP implementation transcribed from api/utils/fitParser.js:397 —
// the shared parity vector guaranteeing client and server agree.
function apiNormalizedPower(powerValues: number[]): number | null {
  if (!powerValues || powerValues.length < 30) return null;
  const rollingAvgs: number[] = [];
  for (let i = 29; i < powerValues.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) sum += powerValues[j] || 0;
    rollingAvgs.push(sum / 30);
  }
  const fourth = rollingAvgs.map((a) => a ** 4);
  const avg = fourth.reduce((a, b) => a + b, 0) / fourth.length;
  return Math.round(avg ** 0.25);
}

describe('normalizedPowerFromSamples', () => {
  it('matches the api implementation exactly at 1 Hz (parity vector)', () => {
    const stream = Array.from({ length: 600 }, (_, i) =>
      150 + 100 * Math.sin(i / 40) + (i % 90 < 15 ? 200 : 0)
    );
    expect(normalizedPowerFromSamples(stream, 1)).toBe(apiNormalizedPower(stream));
  });

  it('shrinks the rolling window for coarser sampling', () => {
    // 10 s samples: steady 200 W with one 300 W sample
    const stream = [...Array(20).fill(200), 300, ...Array(20).fill(200)];
    const np = normalizedPowerFromSamples(stream, 10)!;
    expect(np).toBeGreaterThan(200);
    expect(np).toBeLessThan(300);
  });

  it('returns null under 30 s of data', () => {
    expect(normalizedPowerFromSamples(Array(29).fill(200), 1)).toBeNull();
    expect(normalizedPowerFromSamples([200, 200], 10)).toBeNull();
  });
});

describe('computeSelectionStats', () => {
  const t = Array.from({ length: 120 }, (_, i) => i);
  const power = Array.from({ length: 120 }, (_, i) => (i % 10 === 0 ? null : 200 + (i % 3)));

  it('computes avg/max over the window skipping nulls', () => {
    const stats = computeSelectionStats(power, t, 0, 119, { isPower: true, sampleSeconds: 1 });
    expect(stats.max).toBe(202);
    expect(stats.avg).toBeGreaterThan(200);
    expect(stats.durationS).toBe(119);
    expect(stats.np).not.toBeNull();
  });

  it('recomputes on a sub-window (zoom changes the numbers)', () => {
    const spiky = t.map((i) => (i < 60 ? 100 : 300));
    const full = computeSelectionStats(spiky, t, 0, 119, { isPower: true, sampleSeconds: 1 });
    const zoomed = computeSelectionStats(spiky, t, 60, 119, { isPower: true, sampleSeconds: 1 });
    expect(full.avg).toBeCloseTo(200);
    expect(zoomed.avg).toBeCloseTo(300);
    expect(zoomed.np).toBe(300);
  });

  it('omits NP for non-power metrics', () => {
    const stats = computeSelectionStats(power, t, 0, 119, { isPower: false, sampleSeconds: 1 });
    expect(stats.np).toBeNull();
  });
});

describe('calculateWPrimeBalance dt handling', () => {
  it('reproduces original 1 Hz behavior at dt = 1 (regression)', () => {
    const power = [...Array(60).fill(300), ...Array(60).fill(100)];
    const a = calculateWPrimeBalance(power, 250, 20000);
    const b = calculateWPrimeBalance(power, 250, 20000, 1);
    expect(a).toEqual(b);
    // 60 s at 50 W above CP = 3 kJ depleted
    expect(a[59].wBalance).toBeCloseTo(17000, 0);
    // recovery brings it back up afterwards
    expect(a[119].wBalance).toBeGreaterThan(a[59].wBalance);
  });

  it('depletes the same joules regardless of sampling rate', () => {
    const oneHz = calculateWPrimeBalance(Array(60).fill(300), 250, 20000, 1);
    const tenS = calculateWPrimeBalance(Array(6).fill(300), 250, 20000, 10);
    expect(tenS[5].wBalance).toBeCloseTo(oneHz[59].wBalance, 6);
  });
});

describe('computeWBalSeries', () => {
  const t = Array.from({ length: 120 }, (_, i) => i);

  it('finds the minimum and treats nulls as coasting', () => {
    const power = t.map((i) => (i < 60 ? 400 : null));
    const series = computeWBalSeries(power, t, 250, 20000)!;
    expect(series.minIndex).toBe(59);
    expect(series.minJ).toBeCloseTo(20000 - 60 * 150, 0);
    expect(series.values[119]).toBeGreaterThan(series.minJ); // recovered while coasting
  });

  it('clamps pause gaps to 60 s of recovery per step', () => {
    const power = [400, 400, 0, 0];
    const withPause = computeWBalSeries(power, [0, 1, 3600, 3601], 250, 20000)!;
    const withClampedGap = computeWBalSeries(power, [0, 1, 61, 62], 250, 20000)!;
    expect(withPause.values[2]).toBeCloseTo(withClampedGap.values[2], 6);
  });

  it('returns null for unusable input', () => {
    expect(computeWBalSeries([], [], 250, 20000)).toBeNull();
    expect(computeWBalSeries([1, 2], [0, 1], 0, 20000)).toBeNull();
  });
});

describe('brush window math', () => {
  it('clamps into the domain preserving the minimum span', () => {
    expect(clampBrushWindow(-50, -10, 0, 100, 10)).toEqual({ x0: 0, x1: 10 });
    expect(clampBrushWindow(95, 200, 0, 100, 10)).toEqual({ x0: 90, x1: 100 });
    expect(clampBrushWindow(48, 52, 0, 100, 10)).toEqual({ x0: 45, x1: 55 });
  });

  it('resize keeps the opposite edge anchored', () => {
    const w = { x0: 20, x1: 80 };
    expect(resizeBrushWindow(w, 'start', 40, 0, 100, 10)).toEqual({ x0: 40, x1: 80 });
    expect(resizeBrushWindow(w, 'end', 30, 0, 100, 10).x1).toBe(30);
    // crossing over is prevented by the min span
    expect(resizeBrushWindow(w, 'start', 79, 0, 100, 10).x0).toBe(70);
  });

  it('pan preserves span at the edges', () => {
    expect(panBrushWindow({ x0: 20, x1: 40 }, -50, 0, 100)).toEqual({ x0: 0, x1: 20 });
    expect(panBrushWindow({ x0: 20, x1: 40 }, 100, 0, 100)).toEqual({ x0: 80, x1: 100 });
  });

  it('minBrushSpan and isFullWindow behave', () => {
    expect(minBrushSpan(0, 7200, true)).toBe(72);
    expect(minBrushSpan(0, 1000, true)).toBe(30);
    expect(isFullWindow(null, 0, 100)).toBe(true);
    expect(isFullWindow({ x0: 0, x1: 100 }, 0, 100)).toBe(true);
    expect(isFullWindow({ x0: 10, x1: 100 }, 0, 100)).toBe(false);
  });
});
