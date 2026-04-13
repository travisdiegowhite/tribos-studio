import { describe, it, expect } from 'vitest';
import {
  calculateLongTimeConstant,
  calculateShortTimeConstant,
  applyHRVModulation,
  DEFAULT_LONG_TAU,
  DEFAULT_SHORT_TAU,
} from '../adaptive-tau';

describe('calculateLongTimeConstant', () => {
  it('returns the default when age is null', () => {
    expect(calculateLongTimeConstant(null, 900)).toBe(DEFAULT_LONG_TAU);
  });

  it('returns the default when age is undefined', () => {
    expect(calculateLongTimeConstant(undefined, 900)).toBe(DEFAULT_LONG_TAU);
  });

  it('returns the baseline at age 35 with baseline variance', () => {
    // ageAdj = 0, varAdj = 0 → 42
    expect(calculateLongTimeConstant(35, 900)).toBe(42);
  });

  it('lengthens the window for older athletes', () => {
    // age 55: ageAdj = 6, variance baseline → 48
    expect(calculateLongTimeConstant(55, 900)).toBe(48);
  });

  it('shortens the window for younger athletes', () => {
    // age 22: ageAdj = -3.9, variance baseline → 38.1
    expect(calculateLongTimeConstant(22, 900)).toBe(38.1);
  });

  it('extends the window when daily TSS variance is high', () => {
    // age 35, variance 1500 → varAdj = (1500-900)/100 = 6 → 48
    expect(calculateLongTimeConstant(35, 1500)).toBe(48);
  });

  it('caps variance adjustment at the upper bound', () => {
    // variance 10_000 → varAdj capped at 10 → 52
    expect(calculateLongTimeConstant(35, 10000)).toBe(52);
  });

  it('floors variance adjustment at -5', () => {
    // variance 0 → varAdj = (0-900)/100 = -9 → clamped to -5 → 37
    expect(calculateLongTimeConstant(35, 0)).toBe(37);
  });

  it('clamps to LONG_TAU_MAX for very old + very variable', () => {
    expect(calculateLongTimeConstant(99, 50000)).toBe(60);
  });

  it('clamps to LONG_TAU_MIN for very young + very consistent', () => {
    expect(calculateLongTimeConstant(13, 0)).toBe(35);
  });

  it('treats null variance as baseline (no adjustment)', () => {
    expect(calculateLongTimeConstant(35, null)).toBe(42);
    expect(calculateLongTimeConstant(35, undefined)).toBe(42);
  });
});

describe('calculateShortTimeConstant', () => {
  it('returns the default when age is null', () => {
    expect(calculateShortTimeConstant(null, 60)).toBe(DEFAULT_SHORT_TAU);
  });

  it('returns the default when age is undefined', () => {
    expect(calculateShortTimeConstant(undefined, 60)).toBe(DEFAULT_SHORT_TAU);
  });

  it('returns the baseline at age 35 with modest load', () => {
    // ageAdj = 0, load ≤ 70 → 7
    expect(calculateShortTimeConstant(35, 50)).toBe(7);
  });

  it('lengthens slightly for older athletes', () => {
    // age 55: ageAdj = 1 → 8
    expect(calculateShortTimeConstant(55, 50)).toBe(8);
  });

  it('adds a load bump when carrying high chronic fitness', () => {
    // age 35, load 90 → ageAdj 0 + loadAdj 1 → 8
    expect(calculateShortTimeConstant(35, 90)).toBe(8);
  });

  it('rises with age and load but stays within the SHORT_TAU bounds', () => {
    // age 99, high load: ageAdj = 3.2, loadAdj = 1 → 11.2 (under 14 cap)
    expect(calculateShortTimeConstant(99, 120)).toBe(11.2);
  });

  it('clamps to SHORT_TAU_MIN for very young athletes', () => {
    // age 13: ageAdj = -1.1 → 5.9; load 0 → no bump → 5.9
    expect(calculateShortTimeConstant(13, 0)).toBe(5.9);
  });

  it('treats null load as zero (no bump)', () => {
    expect(calculateShortTimeConstant(35, null)).toBe(7);
    expect(calculateShortTimeConstant(35, undefined)).toBe(7);
  });
});

describe('applyHRVModulation', () => {
  it('is an identity function today', () => {
    expect(applyHRVModulation(42)).toBe(42);
    expect(applyHRVModulation(7, 65)).toBe(7);
    expect(applyHRVModulation(42, null)).toBe(42);
  });
});
