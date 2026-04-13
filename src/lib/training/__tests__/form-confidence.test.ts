import { describe, it, expect } from 'vitest';
// calculateFormScoreConfidence lives in the API utils tree because it's
// primarily called server-side during training_load_daily upserts; the
// unit tests live here to mirror the adaptive-tau test layout.
import { calculateFormScoreConfidence } from '../../../../api/utils/fitnessSnapshots.js';

describe('calculateFormScoreConfidence', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateFormScoreConfidence([])).toBe(0);
  });

  it('returns 0 when called with no arguments', () => {
    expect(calculateFormScoreConfidence()).toBe(0);
  });

  it('returns the constant when all 7 days share the same confidence', () => {
    expect(calculateFormScoreConfidence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9])).toBe(0.9);
  });

  it('weights recent days more than old ones (recent high, old low)', () => {
    // oldest → newest: [0.4, 0.4, 0.4, 0.95, 0.95, 0.95, 0.95]
    // weighted: (1*0.4 + 2*0.4 + 3*0.4 + 4*0.95 + 5*0.95 + 6*0.95 + 7*0.95) / 28
    //        =  (2.4 + 20.9) / 28 = 23.3/28 ≈ 0.832
    // Simple mean is (3*0.4 + 4*0.95)/7 ≈ 0.714 — weighted should be higher.
    const weighted = calculateFormScoreConfidence([0.4, 0.4, 0.4, 0.95, 0.95, 0.95, 0.95]);
    const simpleMean = (3 * 0.4 + 4 * 0.95) / 7;
    expect(weighted).toBeGreaterThan(simpleMean);
    expect(weighted).toBe(0.832);
  });

  it('weights recent days more than old ones (recent low, old high)', () => {
    // oldest → newest: [0.95, 0.95, 0.95, 0.4, 0.4, 0.4, 0.4]
    // weighted: (1+2+3)*0.95 + (4+5+6+7)*0.4 = 6*0.95 + 22*0.4 = 14.5; /28 ≈ 0.518
    const weighted = calculateFormScoreConfidence([0.95, 0.95, 0.95, 0.4, 0.4, 0.4, 0.4]);
    const simpleMean = (3 * 0.95 + 4 * 0.4) / 7;
    expect(weighted).toBeLessThan(simpleMean);
    expect(weighted).toBe(0.518);
  });

  it('treats null entries as 0', () => {
    // [null, null, 0.9, 0.9, 0.9, 0.9, 0.9]
    // weighted: (3+4+5+6+7)*0.9 / 28 = 25*0.9/28 = 22.5/28 ≈ 0.804
    expect(calculateFormScoreConfidence([null, null, 0.9, 0.9, 0.9, 0.9, 0.9])).toBe(0.804);
  });

  it('treats undefined entries as 0', () => {
    expect(
      calculateFormScoreConfidence([undefined, undefined, 0.9, 0.9, 0.9, 0.9, 0.9])
    ).toBe(0.804);
  });

  it('pads short arrays with 0 at the oldest slots', () => {
    // [0.9, 0.9, 0.9] → treated as [0,0,0,0,0.9,0.9,0.9]
    // weighted: (5+6+7)*0.9 / 28 = 18*0.9/28 = 16.2/28 ≈ 0.579
    expect(calculateFormScoreConfidence([0.9, 0.9, 0.9])).toBe(0.579);
  });

  it('truncates arrays longer than 7 to the most recent 7', () => {
    // The oldest entry (100) should be dropped, then all remaining are 0.9.
    const long = [100, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    expect(calculateFormScoreConfidence(long)).toBe(0.9);
  });

  it('rounds to 3 decimals', () => {
    // All entries 1/3 → weighted avg 1/3 → rounds to 0.333
    const third = 1 / 3;
    expect(calculateFormScoreConfidence([third, third, third, third, third, third, third]))
      .toBe(0.333);
  });

  it('clamps values above 1 down to 1', () => {
    expect(calculateFormScoreConfidence([2, 2, 2, 2, 2, 2, 2])).toBe(1);
  });

  it('clamps negative values back up to 0', () => {
    expect(calculateFormScoreConfidence([-0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5])).toBe(0);
  });

  it('returns 0 when input is not an array', () => {
    // @ts-expect-error — validating defensive behavior against misuse
    expect(calculateFormScoreConfidence(null)).toBe(0);
    // @ts-expect-error — validating defensive behavior against misuse
    expect(calculateFormScoreConfidence('nope')).toBe(0);
  });
});
