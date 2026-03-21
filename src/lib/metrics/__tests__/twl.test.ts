import { describe, it, expect } from 'vitest';
import { computeTWL, computeGVI } from '../twl';

describe('computeTWL', () => {
  it('returns base TSS for flat sea-level ride', () => {
    const result = computeTWL({
      baseTSS: 100, elevationGainM: 0,
      rideDurationHours: 2, gvi: 0.5, meanElevationM: 200,
    });
    // Only beta component: 0.03 * 0.5 = 0.015, no altitude or climbing
    expect(result.twl).toBeCloseTo(101.5, 0);
    expect(result.mTerrain).toBeCloseTo(1.015, 2);
  });

  it('returns exactly base TSS for perfectly flat zero-elevation ride', () => {
    const result = computeTWL({
      baseTSS: 100, elevationGainM: 0,
      rideDurationHours: 2, gvi: 0, meanElevationM: 0,
    });
    expect(result.twl).toBe(100);
    expect(result.mTerrain).toBe(1);
    expect(result.overagePercent).toBe(0);
  });

  it('applies meaningful multiplier for Front Range ride', () => {
    const result = computeTWL({
      baseTSS: 100, elevationGainM: 1300,
      rideDurationHours: 2, gvi: 3.5, meanElevationM: 1800,
    });
    // α: 0.10 * min(1.5, 650/1000) = 0.10 * 0.65 = 0.065
    // β: 0.03 * 3.5 = 0.105
    // γ: 0.05 * max(0, (1800-1000)/1000) = 0.05 * 0.8 = 0.040
    // M = 1 + 0.065 + 0.105 + 0.040 = 1.210
    expect(result.mTerrain).toBeCloseTo(1.21, 2);
    expect(result.twl).toBeCloseTo(121, 0);
    expect(result.overagePercent).toBe(21);
  });

  it('caps VAM_norm at 1.5', () => {
    const result = computeTWL({
      baseTSS: 100, elevationGainM: 5000,
      rideDurationHours: 1, gvi: 1, meanElevationM: 1000,
    });
    // VAM = 5000 m/hr, VAM_norm = min(1.5, 5.0) = 1.5
    expect(result.vamNorm).toBe(1.5);
  });

  it('altitude term is 0 below 1000m', () => {
    const result = computeTWL({
      baseTSS: 100, elevationGainM: 500,
      rideDurationHours: 2, gvi: 2, meanElevationM: 800,
    });
    expect(result.gammaComponent).toBe(0);
  });

  it('handles zero duration gracefully', () => {
    const result = computeTWL({
      baseTSS: 50, elevationGainM: 200,
      rideDurationHours: 0, gvi: 1, meanElevationM: 500,
    });
    expect(result.vam).toBe(0);
    expect(result.vamNorm).toBe(0);
    expect(result.twl).toBeGreaterThan(0);
  });
});

describe('computeGVI', () => {
  it('returns 0 for flat terrain', () => {
    // Constant elevation, varying distance
    const elevation = [100, 100, 100, 100, 100];
    const distance  = [0, 10, 20, 30, 40];
    const gvi = computeGVI(elevation, distance);
    expect(gvi).toBe(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(computeGVI([], [])).toBe(0);
    expect(computeGVI([100], [0])).toBe(0);
  });

  it('returns positive GVI for variable terrain', () => {
    // Alternating up and down
    const elevation = [100, 105, 100, 110, 95, 108, 97];
    const distance  = [0, 50, 100, 150, 200, 250, 300];
    const gvi = computeGVI(elevation, distance, 50);
    expect(gvi).toBeGreaterThan(0);
  });

  it('steady climb has lower GVI than rolling terrain', () => {
    // Steady 5% climb
    const steadyElev = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
    const steadyDist = Array.from({ length: 20 }, (_, i) => i * 100);

    // Rolling: alternating +10m / -5m
    const rollingElev = [100];
    const rollingDist = [0];
    for (let i = 1; i < 20; i++) {
      rollingElev.push(rollingElev[i - 1] + (i % 2 === 0 ? -5 : 10));
      rollingDist.push(i * 100);
    }

    const steadyGVI = computeGVI(steadyElev, steadyDist, 100);
    const rollingGVI = computeGVI(rollingElev, rollingDist, 100);

    expect(rollingGVI).toBeGreaterThan(steadyGVI);
  });

  it('filters out segments shorter than 0.5m', () => {
    // Two points with 0 distance delta (noise) — should be filtered
    const elevation = [100, 101, 101, 105];
    const distance  = [0, 10, 10, 20]; // second segment has 0 distance
    const gvi = computeGVI(elevation, distance, 10);
    // Should still compute without error
    expect(gvi).toBeGreaterThanOrEqual(0);
  });
});
