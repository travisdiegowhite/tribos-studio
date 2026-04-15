import { describe, it, expect } from 'vitest';
import { estimateTSS, updateCalibration, computeTRIMP } from '../fatigue-estimation';
import { DEFAULT_CALIBRATION } from '../constants';
import type { ActivityData, CalibrationFactors } from '../types';

describe('estimateTSS', () => {
  const defaultCal: CalibrationFactors = { ...DEFAULT_CALIBRATION };

  describe('Tier 1: Power', () => {
    it('computes TSS from normalized power and FTP', () => {
      const activity: ActivityData = {
        duration_seconds: 3600, // 1 hour
        normalized_power: 200,
        ftp: 250,
      };
      const result = estimateTSS(activity, defaultCal);

      // TSS = (3600 * 200 * 0.8) / (250 * 3600) * 100 = 64
      expect(result.source).toBe('power');
      expect(result.tss).toBeCloseTo(64, 0);
      expect(result.confidence).toBe(0.95);
      expect(result.tss_low).toBeLessThan(result.tss);
      expect(result.tss_high).toBeGreaterThan(result.tss);
    });

    it('handles high intensity (IF > 1.0)', () => {
      const activity: ActivityData = {
        duration_seconds: 1800, // 30 min
        normalized_power: 280,
        ftp: 250,
      };
      const result = estimateTSS(activity, defaultCal);

      // IF = 1.12, TSS = (1800 * 280 * 1.12) / (250 * 3600) * 100 ≈ 62.7
      expect(result.source).toBe('power');
      expect(result.tss).toBeGreaterThan(50);
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Tier 2: Heart Rate Stream', () => {
    it('estimates TSS from HR stream using TRIMP', () => {
      // Simulate 60 minutes mostly in zone 3
      const hr_stream = new Array(3600).fill(155); // all in Z3 (70-80% HRR)
      const activity: ActivityData = {
        duration_seconds: 3600,
        hr_stream,
        hr_max: 190,
        hr_rest: 60,
      };
      const result = estimateTSS(activity, defaultCal);

      expect(result.source).toBe('hr');
      expect(result.tss).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.55);
      expect(result.confidence).toBeLessThanOrEqual(0.80);
    });

    it('applies cardiac drift correction for long rides', () => {
      const hr_stream = new Array(7200).fill(140); // 2 hours in Z2
      const shortActivity: ActivityData = {
        duration_seconds: 3600,
        hr_stream: hr_stream.slice(0, 3600),
        hr_max: 190,
        hr_rest: 60,
      };
      const longActivity: ActivityData = {
        duration_seconds: 7200,
        hr_stream,
        hr_max: 190,
        hr_rest: 60,
      };

      const shortResult = estimateTSS(shortActivity, defaultCal);
      const longResult = estimateTSS(longActivity, defaultCal);

      // Long ride should not be exactly 2x short ride due to drift correction
      const ratio = longResult.tss / shortResult.tss;
      expect(ratio).toBeLessThan(2.0); // drift correction reduces long ride TSS
    });
  });

  describe('Tier 2b: Average HR', () => {
    it('falls back to avg HR when no stream available', () => {
      const activity: ActivityData = {
        duration_seconds: 3600,
        avg_hr: 150,
        hr_max: 190,
        hr_rest: 60,
      };
      const result = estimateTSS(activity, defaultCal);

      expect(result.source).toBe('hr');
      expect(result.tss).toBeGreaterThan(0);
      expect(result.method_detail).toContain('avgHR');
    });
  });

  describe('Tier 3: RPE', () => {
    it('estimates TSS from session RPE', () => {
      const activity: ActivityData = {
        duration_seconds: 3600, // 60 min
        rpe: 7,
      };
      const result = estimateTSS(activity, defaultCal);

      // sRPE = 7 * 60 = 420, TSS = 420 * 0.55 = 231
      expect(result.source).toBe('rpe');
      expect(result.tss).toBeCloseTo(231, 0);
      expect(result.confidence).toBe(0.50);
    });

    it('ignores rpe of 0', () => {
      const activity: ActivityData = {
        duration_seconds: 3600,
        rpe: 0,
        workout_type: 'endurance',
      };
      const result = estimateTSS(activity, defaultCal);
      expect(result.source).toBe('inferred'); // falls through to Tier 4
    });
  });

  describe('Tier 4: Type Inference', () => {
    it('estimates from workout type and duration', () => {
      const activity: ActivityData = {
        duration_seconds: 3600,
        workout_type: 'endurance',
      };
      const result = estimateTSS(activity, defaultCal);

      // 48 TSS/hour * 1 hour = 48
      expect(result.source).toBe('inferred');
      expect(result.tss).toBeCloseTo(48, 0);
      expect(result.confidence).toBe(0.40);
    });

    it('adds elevation bonus (plus VAM factor per spec §3.1)', () => {
      const flat: ActivityData = {
        duration_seconds: 3600,
        workout_type: 'endurance',
        total_elevation_m: 0,
      };
      const hilly: ActivityData = {
        duration_seconds: 3600,
        workout_type: 'endurance',
        total_elevation_m: 900, // 30 elevation-bonus + vamFactor ~1.09
      };
      const flatResult = estimateTSS(flat, defaultCal);
      const hillyResult = estimateTSS(hilly, defaultCal);

      // Elevation on a timed ride now contributes both the raw 30-TSS
      // bonus AND the spec §3.1 VAM factor; the diff exceeds 30.
      expect(hillyResult.tss).toBeGreaterThan(flatResult.tss + 30);
    });

    it('defaults to endurance for unknown type', () => {
      const activity: ActivityData = {
        duration_seconds: 3600,
        workout_type: 'unknown_type',
      };
      const result = estimateTSS(activity, defaultCal);
      expect(result.tss).toBeCloseTo(48, 0); // same as endurance
    });
  });

  describe('Tier priority', () => {
    it('prefers power over HR over RPE over inference', () => {
      const activity: ActivityData = {
        duration_seconds: 3600,
        normalized_power: 200,
        ftp: 250,
        hr_stream: new Array(3600).fill(150),
        hr_max: 190,
        hr_rest: 60,
        rpe: 6,
        workout_type: 'tempo',
      };
      const result = estimateTSS(activity, defaultCal);
      expect(result.source).toBe('power');
    });
  });
});

describe('updateCalibration', () => {
  it('updates trimp_to_tss factor', () => {
    const current: CalibrationFactors = { trimp_to_tss: 0.85, srpe_to_tss: 0.55, sample_count: 5 };
    const updated = updateCalibration(current, 100, 120); // actual/trimp = 0.833

    expect(updated.trimp_to_tss).toBeCloseTo(0.85 * 0.85 + (100/120) * 0.15, 2);
    expect(updated.sample_count).toBe(6);
  });

  it('updates srpe_to_tss when srpe provided', () => {
    const current: CalibrationFactors = { trimp_to_tss: 0.85, srpe_to_tss: 0.55, sample_count: 0 };
    const updated = updateCalibration(current, 100, 120, 200);

    expect(updated.srpe_to_tss).not.toBe(0.55);
    expect(updated.sample_count).toBe(1);
  });
});

describe('computeTRIMP', () => {
  it('computes weighted zone minutes', () => {
    // 30 min in Z1 (below 50% HRR), 30 min in Z3 (60-70% HRR)
    const hr_rest = 60;
    const hr_max = 200;
    const hrr = hr_max - hr_rest; // 140
    const z1_hr = hr_rest + hrr * 0.40; // 116 — zone 1
    const z3_hr = hr_rest + hrr * 0.65; // 151 — zone 3

    const stream = [
      ...new Array(1800).fill(z1_hr),
      ...new Array(1800).fill(z3_hr),
    ];

    const trimp = computeTRIMP(stream, hr_max, hr_rest, 3600);

    // Z1: 30 min * 1 = 30, Z3: 30 min * 3 = 90, total = 120
    expect(trimp).toBeCloseTo(120, 0);
  });
});
