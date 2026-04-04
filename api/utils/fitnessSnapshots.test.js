import { describe, it, expect } from 'vitest';
import {
  calculateCTL,
  calculateATL,
  calculateTSB,
  estimateTSS,
} from './fitnessSnapshots.js';

// ─── CTL / ATL / TSB ────────────────────────────────────────────────────────

describe('calculateCTL', () => {
  it('returns 0 for empty input', () => {
    expect(calculateCTL([])).toBe(0);
    expect(calculateCTL(null)).toBe(0);
  });

  it('converges toward constant daily TSS', () => {
    // 90 days of constant 100 TSS should converge close to 100
    const daily = Array(90).fill(100);
    const ctl = calculateCTL(daily);
    expect(ctl).toBeGreaterThan(85);
    expect(ctl).toBeLessThanOrEqual(100);
  });

  it('uses 42-day time constant (standard iterative EWA)', () => {
    // After 1 day of 420 TSS from 0, CTL = 0 + (420 - 0) / 42 = 10
    const daily = [420];
    expect(calculateCTL(daily)).toBe(10);
  });

  it('decays on rest days', () => {
    // 42 days of 100 TSS then 7 rest days — CTL should decrease
    const training = Array(42).fill(100);
    const rest = Array(7).fill(0);
    const ctlBefore = calculateCTL(training);
    const ctlAfter = calculateCTL([...training, ...rest]);
    expect(ctlAfter).toBeLessThan(ctlBefore);
  });
});

describe('calculateATL', () => {
  it('returns 0 for empty input', () => {
    expect(calculateATL([])).toBe(0);
  });

  it('converges toward constant daily TSS', () => {
    // 30 days of constant 100 TSS — ATL should converge close to 100
    const daily = Array(30).fill(100);
    const atl = calculateATL(daily);
    expect(atl).toBeGreaterThan(90);
    expect(atl).toBeLessThanOrEqual(100);
  });

  it('uses 7-day time constant (standard iterative EWA)', () => {
    // After 1 day of 70 TSS from 0, ATL = 0 + (70 - 0) / 7 = 10
    const daily = [70];
    expect(calculateATL(daily)).toBe(10);
  });

  it('reacts faster than CTL', () => {
    // After 7 days of high TSS, ATL should be much higher than CTL
    const daily = Array(7).fill(200);
    const ctl = calculateCTL(daily);
    const atl = calculateATL(daily);
    expect(atl).toBeGreaterThan(ctl);
  });
});

describe('calculateTSB', () => {
  it('returns CTL minus ATL', () => {
    expect(calculateTSB(80, 60)).toBe(20);
    expect(calculateTSB(60, 80)).toBe(-20);
    expect(calculateTSB(100, 100)).toBe(0);
  });
});

// ─── TSS Estimation ─────────────────────────────────────────────────────────

describe('estimateTSS', () => {
  it('prefers kJ+FTP over stored TSS for consistency', () => {
    const activity = { tss: 150, kilojoules: 1440, moving_time: 7200 };
    // kJ tier (1440/7.2=200) wins over stored TSS (150)
    expect(estimateTSS(activity, 200)).toBe(200);
  });

  it('falls back to stored TSS when no NP, kJ, or power data', () => {
    const activity = { tss: 150, moving_time: 7200 };
    expect(estimateTSS(activity, 200)).toBe(150);
  });

  describe('NP+FTP estimation', () => {
    it('uses NP+FTP when normalized power is available', () => {
      // IF = 200/200 = 1.0, TSS = 2h × 1.0² × 100 = 200
      const activity = { normalized_power: 200, moving_time: 7200 };
      expect(estimateTSS(activity, 200)).toBe(200);
    });

    it('defaults FTP to 200 when not provided', () => {
      const activity = { normalized_power: 200, moving_time: 3600 };
      // IF = 200/200 = 1.0, TSS = 1h × 1.0 × 100 = 100
      expect(estimateTSS(activity)).toBe(100);
    });

    it('prefers NP+FTP over kJ and stored TSS', () => {
      const activity = { normalized_power: 250, moving_time: 7200, kilojoules: 1440, tss: 300 };
      // IF = 250/200 = 1.25, TSS = 2h × 1.5625 × 100 = 313
      expect(estimateTSS(activity, 200)).toBe(313);
    });
  });

  describe('kJ-based estimation', () => {
    it('produces correct TSS for a 2h ride at 200W with FTP=200', () => {
      // 200W × 7200s = 1,440,000 J = 1440 kJ
      // TSS = 1440 / (200 × 0.036) = 1440 / 7.2 = 200
      const activity = { kilojoules: 1440, moving_time: 7200 };
      const tss = estimateTSS(activity, 200);
      expect(tss).toBe(200);
    });

    it('produces correct TSS for a 1h ride at FTP=250', () => {
      // 250W × 3600s = 900 kJ
      // TSS = 900 / (250 × 0.036) = 900 / 9 = 100
      const activity = { kilojoules: 900, moving_time: 3600 };
      const tss = estimateTSS(activity, 250);
      expect(tss).toBe(100);
    });

    it('uses default FTP=200 when no FTP provided', () => {
      const activity = { kilojoules: 720, moving_time: 3600 };
      // TSS = 720 / (200 × 0.036) = 720 / 7.2 = 100
      const tss = estimateTSS(activity);
      expect(tss).toBe(100);
    });

    it('does NOT overestimate like the old formula', () => {
      // Old formula: 1440 / 2 / 1.2 = 600 (3x too high)
      // New formula: 1440 / 7.2 = 200
      const activity = { kilojoules: 1440, moving_time: 7200 };
      const tss = estimateTSS(activity, 200);
      expect(tss).toBeLessThan(300); // Sanity check: definitely not 600
      expect(tss).toBe(200);
    });

    it('produces higher TSS for lower FTP (same work is harder)', () => {
      const activity = { kilojoules: 1440, moving_time: 7200 };
      const tssLowFtp = estimateTSS(activity, 150);
      const tssHighFtp = estimateTSS(activity, 250);
      expect(tssLowFtp).toBeGreaterThan(tssHighFtp);
    });
  });

  describe('running estimation', () => {
    it('estimates running TSS from pace and duration', () => {
      const activity = {
        type: 'Run',
        moving_time: 3600, // 1 hour
        distance: 10000,    // 10km = 6:00/km pace
        total_elevation_gain: 0,
      };
      const tss = estimateTSS(activity);
      // Easy run: ~51 (60 base × 0.85 intensity)
      expect(tss).toBeGreaterThan(30);
      expect(tss).toBeLessThan(100);
    });
  });

  describe('duration heuristic fallback', () => {
    it('estimates from duration when no kJ or power', () => {
      const activity = {
        moving_time: 7200,          // 2 hours
        total_elevation_gain: 300,
      };
      const tss = estimateTSS(activity);
      // Base: 2 × 50 = 100, elevation: (300/300) × 10 = 10 → 110
      expect(tss).toBe(110);
    });
  });
});
