/**
 * Regression tests for the extracted CP/W' utilities: same numbers the
 * CriticalPowerModel component produced pre-extraction, plus the new
 * best-efforts merge helper.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateCPandWPrime,
  calculateWPrimeBalance,
  predictPowerForDuration,
  predictDurationForPower,
  bestEffortsFromCurves,
} from './criticalPower';

describe('estimateCPandWPrime', () => {
  it('fits the 2-parameter model from best efforts', () => {
    // Synthetic athlete: CP=250, W'=20000 → P(t) = 250 + 20000/t
    const efforts = { 180: 250 + 20000 / 180, 300: 250 + 20000 / 300, 1200: 250 + 20000 / 1200 };
    const fit = estimateCPandWPrime(efforts, null)!;
    expect(fit.model).toBe('calculated');
    expect(fit.cp).toBe(250);
    expect(fit.wPrime).toBe(20000);
  });

  it('falls back to FTP estimate without efforts or on out-of-range fits', () => {
    expect(estimateCPandWPrime(null, 260)).toEqual({ cp: 247, wPrime: 20000, model: 'estimated' });
    // Degenerate efforts produce an out-of-range fit → estimate
    expect(estimateCPandWPrime({ 180: 10, 300: 900 }, 200)!.model).toBe('estimated');
    expect(estimateCPandWPrime(null, null)).toBeNull();
  });
});

describe('calculateWPrimeBalance (extraction regression)', () => {
  it('produces the original component numbers at 1 Hz', () => {
    const points = calculateWPrimeBalance([300, 300, 100], 250, 20000);
    expect(points[0].wBalance).toBe(19950);
    expect(points[1].wBalance).toBe(19900);
    expect(points[1].aboveCP).toBe(true);
    expect(points[2].aboveCP).toBe(false);
    expect(points[2].wBalance).toBeGreaterThan(19900); // recovery step
    expect(points[2].wBalancePercent).toBeCloseTo((points[2].wBalance / 20000) * 100);
  });
});

describe('predictors', () => {
  it('predict power/duration from the model', () => {
    expect(predictPowerForDuration(250, 20000, 300)).toBe(317);
    expect(predictDurationForPower(250, 20000, 300)).toBe(400);
    expect(predictDurationForPower(250, 20000, 200)).toBe(Infinity);
  });
});

describe('bestEffortsFromCurves', () => {
  it('merges duration-suffixed maps taking the max, fit-range only', () => {
    const snapshot = { '5s': 900, '300s': 320, '1200s': 260 };
    const activity = { '300s': 335, '600s': 290, '3600s': 230 };
    const merged = bestEffortsFromCurves([snapshot, activity, null]);
    expect(merged).toEqual({ 300: 335, 600: 290, 1200: 260 });
  });

  it('drops sprints and ultra-long durations (they break the linear fit)', () => {
    expect(bestEffortsFromCurves([{ '1s': 1000, '30s': 600, '3600s': 220 }])).toEqual({});
  });
});
