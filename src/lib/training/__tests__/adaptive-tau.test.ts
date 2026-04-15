import { describe, it, expect } from 'vitest';
import {
  calculateTFITimeConstant,
  calculateAFITimeConstant,
  applyHRVModulation,
  DEFAULT_TFI_TAU,
  DEFAULT_AFI_TAU,
} from '../adaptive-tau';

// ────────────────────────────────────────────────────────────────────────
// Spec §3.4 — calculateTFITimeConstant (discrete age brackets)
// ────────────────────────────────────────────────────────────────────────

describe('calculateTFITimeConstant', () => {
  it('returns the default when age is null', () => {
    expect(calculateTFITimeConstant(null, 30)).toBe(DEFAULT_TFI_TAU);
  });

  it('returns the default when age is undefined', () => {
    expect(calculateTFITimeConstant(undefined, 30)).toBe(DEFAULT_TFI_TAU);
  });

  it('age<30 with low variance applies only the young-age factor', () => {
    // 42 * 0.90 * 1.00 = 37.8 → 38
    expect(calculateTFITimeConstant(25, 0)).toBe(38);
  });

  it('age<30 with high variance adds the history factor', () => {
    // 42 * 0.90 * 1.05 = 39.69 → 40
    expect(calculateTFITimeConstant(25, 30)).toBe(40);
  });

  it('30<=age<45 hits the baseline age bracket', () => {
    // 42 * 1.00 * 1.00 = 42
    expect(calculateTFITimeConstant(40, 0)).toBe(42);
  });

  it('30<=age<45 with high variance bumps by 5%', () => {
    // 42 * 1.00 * 1.05 = 44.1 → 44
    expect(calculateTFITimeConstant(40, 30)).toBe(44);
  });

  it('45<=age<55 lengthens the window by 10%', () => {
    // 42 * 1.10 * 1.00 = 46.2 → 46
    expect(calculateTFITimeConstant(50, 0)).toBe(46);
  });

  it('45<=age<55 with high variance stacks both factors', () => {
    // 42 * 1.10 * 1.05 = 48.51 → 49
    expect(calculateTFITimeConstant(50, 30)).toBe(49);
  });

  it('age>=55 lengthens the window by 20%', () => {
    // 42 * 1.20 * 1.00 = 50.4 → 50
    expect(calculateTFITimeConstant(60, 0)).toBe(50);
  });

  it('age>=55 with high variance hits the maximum bracket', () => {
    // 42 * 1.20 * 1.05 = 52.92 → 53
    expect(calculateTFITimeConstant(60, 30)).toBe(53);
  });

  it('variance exactly at threshold (20) does NOT bump', () => {
    // 42 * 1.00 * 1.00 = 42 (variance > 20 is strict)
    expect(calculateTFITimeConstant(40, 20)).toBe(42);
  });

  it('treats null or undefined variance as zero (no history bump)', () => {
    expect(calculateTFITimeConstant(40, null)).toBe(42);
    expect(calculateTFITimeConstant(40, undefined)).toBe(42);
  });

  it('returns an integer (Math.round)', () => {
    const result = calculateTFITimeConstant(25, 30);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Spec §3.5 — calculateAFITimeConstant (discrete age brackets)
// ────────────────────────────────────────────────────────────────────────

describe('calculateAFITimeConstant', () => {
  it('returns the default when age is null', () => {
    expect(calculateAFITimeConstant(null, 80)).toBe(DEFAULT_AFI_TAU);
  });

  it('returns the default when age is undefined', () => {
    expect(calculateAFITimeConstant(undefined, 80)).toBe(DEFAULT_AFI_TAU);
  });

  it('age<30 with moderate load applies only the young-age factor', () => {
    // +(7 * 0.85 * 1.00).toFixed(1)
    const expected = +(7 * 0.85 * 1.0).toFixed(1);
    expect(calculateAFITimeConstant(25, 50)).toBe(expected);
  });

  it('age<30 with high load stacks the load factor', () => {
    // +(7 * 0.85 * 1.10).toFixed(1)
    const expected = +(7 * 0.85 * 1.1).toFixed(1);
    expect(calculateAFITimeConstant(25, 120)).toBe(expected);
  });

  it('30<=age<45 with moderate load returns the 7-day baseline', () => {
    // +(7 * 1.00 * 1.00).toFixed(1) = 7
    expect(calculateAFITimeConstant(40, 50)).toBe(7);
  });

  it('30<=age<45 with high load bumps by 10%', () => {
    // +(7 * 1.00 * 1.10).toFixed(1) = 7.7
    expect(calculateAFITimeConstant(40, 120)).toBe(7.7);
  });

  it('45<=age<55 lengthens the fatigue window by 15%', () => {
    const expected = +(7 * 1.15 * 1.0).toFixed(1);
    expect(calculateAFITimeConstant(50, 50)).toBe(expected);
  });

  it('45<=age<55 with high load stacks both factors', () => {
    const expected = +(7 * 1.15 * 1.1).toFixed(1);
    expect(calculateAFITimeConstant(50, 120)).toBe(expected);
  });

  it('age>=55 lengthens the fatigue window by 30%', () => {
    const expected = +(7 * 1.3 * 1.0).toFixed(1);
    expect(calculateAFITimeConstant(60, 50)).toBe(expected);
  });

  it('age>=55 with high load hits the maximum bracket', () => {
    const expected = +(7 * 1.3 * 1.1).toFixed(1);
    expect(calculateAFITimeConstant(60, 120)).toBe(expected);
  });

  it('currentTFI exactly at threshold (100) does NOT bump', () => {
    // tfi > 100 is strict — at 100 the load factor stays 1.0
    expect(calculateAFITimeConstant(40, 100)).toBe(7);
  });

  it('treats null or undefined currentTFI as zero (no load bump)', () => {
    expect(calculateAFITimeConstant(40, null)).toBe(7);
    expect(calculateAFITimeConstant(40, undefined)).toBe(7);
  });

  it('returns a numeric rounded to 1 decimal place', () => {
    const result = calculateAFITimeConstant(50, 120);
    // toFixed(1) output parsed back via unary + → number with ≤ 1 dp
    expect(typeof result).toBe('number');
    expect(result.toString()).toMatch(/^\d+(\.\d)?$/);
  });
});

describe('applyHRVModulation', () => {
  it('is an identity function today', () => {
    expect(applyHRVModulation(42)).toBe(42);
    expect(applyHRVModulation(7, 65)).toBe(7);
    expect(applyHRVModulation(42, null)).toBe(42);
  });
});
