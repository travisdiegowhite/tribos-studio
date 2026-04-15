import { describe, it, expect } from 'vitest';
// calculateFormScoreConfidence lives in the API utils tree because it's
// primarily called server-side during training_load_daily upserts; the
// unit tests live here to mirror the adaptive-tau test layout.
import {
  calculateFormScoreConfidence,
  computeTFIComposition,
} from '../../../../api/utils/fitnessSnapshots.js';

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
    // Spec §3.6 weights (oldest→newest): [0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.30]
    // [0.4, 0.4, 0.4, 0.95, 0.95, 0.95, 0.95]
    // = 0.4 * (0.05+0.08+0.10) + 0.95 * (0.12+0.15+0.20+0.30)
    // = 0.4 * 0.23 + 0.95 * 0.77 = 0.092 + 0.7315 = 0.8235
    // JS float rounding lands this at 0.823.
    const weighted = calculateFormScoreConfidence([0.4, 0.4, 0.4, 0.95, 0.95, 0.95, 0.95]);
    const simpleMean = (3 * 0.4 + 4 * 0.95) / 7;
    expect(weighted).toBeGreaterThan(simpleMean);
    expect(weighted).toBe(0.823);
  });

  it('weights recent days more than old ones (recent low, old high)', () => {
    // [0.95, 0.95, 0.95, 0.4, 0.4, 0.4, 0.4]
    // = 0.95 * 0.23 + 0.4 * 0.77 = 0.2185 + 0.308 = 0.5265 → 0.527
    const weighted = calculateFormScoreConfidence([0.95, 0.95, 0.95, 0.4, 0.4, 0.4, 0.4]);
    const simpleMean = (3 * 0.95 + 4 * 0.4) / 7;
    expect(weighted).toBeLessThan(simpleMean);
    expect(weighted).toBe(0.527);
  });

  it('treats null entries as 0', () => {
    // [null, null, 0.9, 0.9, 0.9, 0.9, 0.9]
    // = 0.9 * (0.10+0.12+0.15+0.20+0.30) = 0.9 * 0.87 = 0.783
    expect(calculateFormScoreConfidence([null, null, 0.9, 0.9, 0.9, 0.9, 0.9])).toBe(0.783);
  });

  it('treats undefined entries as 0', () => {
    expect(
      calculateFormScoreConfidence([undefined, undefined, 0.9, 0.9, 0.9, 0.9, 0.9])
    ).toBe(0.783);
  });

  it('pads short arrays with 0 at the oldest slots', () => {
    // [0.9, 0.9, 0.9] → [0,0,0,0,0.9,0.9,0.9]
    // = 0.9 * (0.15+0.20+0.30) = 0.9 * 0.65 = 0.585
    expect(calculateFormScoreConfidence([0.9, 0.9, 0.9])).toBe(0.585);
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

// ─── computeTFIComposition — spec §3.6 ───────────────────────────────────────

describe('computeTFIComposition', () => {
  it('returns null for empty or missing input', () => {
    expect(computeTFIComposition([])).toBeNull();
    expect(computeTFIComposition(null)).toBeNull();
    expect(computeTFIComposition(undefined)).toBeNull();
  });

  it('splits a single all-aerobic day into 100% aerobic', () => {
    const out = computeTFIComposition([
      { rss: 80, aerobic_seconds: 3600, threshold_seconds: 0, high_intensity_seconds: 0 },
    ]);
    expect(out).toEqual({
      aerobic_fraction: 1,
      threshold_fraction: 0,
      high_intensity_fraction: 0,
    });
  });

  it('weights each day by its RSS, not just time in zone', () => {
    // Day 1: big aerobic ride (RSS 200, all Z1-3)
    // Day 2: short vo2 (RSS 50, all Z5)
    // → aerobic 200 / 250 = 0.80, high 50 / 250 = 0.20
    const out = computeTFIComposition([
      { rss: 200, aerobic_seconds: 18000, threshold_seconds: 0, high_intensity_seconds: 0 },
      { rss: 50, aerobic_seconds: 0, threshold_seconds: 0, high_intensity_seconds: 600 },
    ]);
    expect(out?.aerobic_fraction).toBe(0.8);
    expect(out?.threshold_fraction).toBe(0);
    expect(out?.high_intensity_fraction).toBe(0.2);
  });

  it('fractions for a day are scaled by that day\'s zone seconds split', () => {
    // One mixed session: RSS=100 across 60% aerobic, 20% threshold, 20% high
    const out = computeTFIComposition([
      {
        rss: 100,
        aerobic_seconds: 3600,
        threshold_seconds: 1200,
        high_intensity_seconds: 1200,
      },
    ]);
    expect(out?.aerobic_fraction).toBe(0.6);
    expect(out?.threshold_fraction).toBe(0.2);
    expect(out?.high_intensity_fraction).toBe(0.2);
  });

  it('skips days with zero RSS or zero total zone seconds', () => {
    const out = computeTFIComposition([
      { rss: 0, aerobic_seconds: 3600, threshold_seconds: 0, high_intensity_seconds: 0 },
      { rss: 100, aerobic_seconds: 0, threshold_seconds: 0, high_intensity_seconds: 0 },
      { rss: 80, aerobic_seconds: 3600, threshold_seconds: 0, high_intensity_seconds: 0 },
    ]);
    expect(out).toEqual({
      aerobic_fraction: 1,
      threshold_fraction: 0,
      high_intensity_fraction: 0,
    });
  });

  it('returns null when every entry has zero RSS or zero zone time', () => {
    expect(
      computeTFIComposition([
        { rss: 0, aerobic_seconds: 3600, threshold_seconds: 0, high_intensity_seconds: 0 },
        { rss: 80, aerobic_seconds: 0, threshold_seconds: 0, high_intensity_seconds: 0 },
      ])
    ).toBeNull();
  });

  it('fractions sum to 1.0 (within rounding)', () => {
    const out = computeTFIComposition([
      { rss: 100, aerobic_seconds: 2000, threshold_seconds: 1000, high_intensity_seconds: 600 },
      { rss: 50, aerobic_seconds: 900, threshold_seconds: 0, high_intensity_seconds: 900 },
    ]);
    const sum = (out?.aerobic_fraction ?? 0)
      + (out?.threshold_fraction ?? 0)
      + (out?.high_intensity_fraction ?? 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.002);
  });
});
