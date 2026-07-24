import { describe, it, expect } from 'vitest';
import { sanitizeStressScore } from './stressScoreSanitizer.js';

describe('sanitizeStressScore', () => {
  it('passes plausible device TSS values through unchanged', () => {
    expect(sanitizeStressScore(84)).toBe(84);
    expect(sanitizeStressScore(350.4)).toBe(350.4);
    expect(sanitizeStressScore(999.9)).toBe(999.9);
    expect(sanitizeStressScore(0.5)).toBe(0.5);
  });

  it('rejects the FIT uint16 sentinel (0xFFFF / 10 = 6553.5)', () => {
    expect(sanitizeStressScore(6553.5)).toBeNull();
  });

  it('rejects the raw uint16 sentinel and other implausibly large values', () => {
    expect(sanitizeStressScore(65535)).toBeNull();
    expect(sanitizeStressScore(5598.9)).toBeNull();
    expect(sanitizeStressScore(1000)).toBeNull();
  });

  it('rejects zero and negatives', () => {
    expect(sanitizeStressScore(0)).toBeNull();
    expect(sanitizeStressScore(-5)).toBeNull();
  });

  it('rejects non-finite and non-numeric input', () => {
    expect(sanitizeStressScore(NaN)).toBeNull();
    expect(sanitizeStressScore(Infinity)).toBeNull();
    expect(sanitizeStressScore(-Infinity)).toBeNull();
    expect(sanitizeStressScore(null)).toBeNull();
    expect(sanitizeStressScore(undefined)).toBeNull();
    expect(sanitizeStressScore('84')).toBeNull();
  });
});
