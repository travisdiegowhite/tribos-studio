import { describe, it, expect } from 'vitest';
import {
  classifyTerrain as classifyTerrainApi,
  terrainMultiplier as terrainMultiplierApi,
  estimateTSSWithSource,
} from '../../../../api/utils/fitnessSnapshots.js';
import {
  classifyTerrain,
  terrainMultiplier,
  estimateTSS,
} from '../fatigue-estimation';
import type { ActivityData, CalibrationFactors } from '../types';

const defaultCal: CalibrationFactors = {
  trimp_to_tss: 0.85,
  srpe_to_tss: 0.55,
  sample_count: 0,
};

describe('classifyTerrain (api + ts must match)', () => {
  it('returns flat when distance is 0', () => {
    expect(classifyTerrainApi(0, 500)).toBe('flat');
    expect(classifyTerrain(0, 500)).toBe('flat');
  });

  it('returns flat when distance is missing', () => {
    expect(classifyTerrainApi(undefined as unknown as number, 500)).toBe('flat');
    expect(classifyTerrain(undefined, 500)).toBe('flat');
  });

  it('returns flat when elevation is 0', () => {
    expect(classifyTerrainApi(50_000, 0)).toBe('flat');
    expect(classifyTerrain(50_000, 0)).toBe('flat');
  });

  it('returns flat when elevation is missing', () => {
    expect(classifyTerrainApi(50_000, undefined as unknown as number)).toBe('flat');
    expect(classifyTerrain(50_000, undefined)).toBe('flat');
  });

  // distance/elev ratios in m/km (using 1 km / 10 km distances for clean math)
  it('classifies just-below-8 m/km as flat', () => {
    expect(classifyTerrainApi(1_000, 7.99)).toBe('flat');
    expect(classifyTerrain(1_000, 7.99)).toBe('flat');
  });

  it('classifies exactly 8 m/km as rolling', () => {
    expect(classifyTerrainApi(1_000, 8)).toBe('rolling');
    expect(classifyTerrain(1_000, 8)).toBe('rolling');
  });

  it('classifies 10 m/km as rolling', () => {
    expect(classifyTerrainApi(10_000, 100)).toBe('rolling');
    expect(classifyTerrain(10_000, 100)).toBe('rolling');
  });

  it('classifies just-below-15 m/km as rolling', () => {
    expect(classifyTerrainApi(1_000, 14.99)).toBe('rolling');
    expect(classifyTerrain(1_000, 14.99)).toBe('rolling');
  });

  it('classifies exactly 15 m/km as hilly', () => {
    expect(classifyTerrainApi(1_000, 15)).toBe('hilly');
    expect(classifyTerrain(1_000, 15)).toBe('hilly');
  });

  it('classifies 20 m/km as hilly', () => {
    expect(classifyTerrainApi(10_000, 200)).toBe('hilly');
    expect(classifyTerrain(10_000, 200)).toBe('hilly');
  });

  it('classifies just-below-25 m/km as hilly', () => {
    expect(classifyTerrainApi(1_000, 24.99)).toBe('hilly');
    expect(classifyTerrain(1_000, 24.99)).toBe('hilly');
  });

  it('classifies exactly 25 m/km as mountainous', () => {
    expect(classifyTerrainApi(1_000, 25)).toBe('mountainous');
    expect(classifyTerrain(1_000, 25)).toBe('mountainous');
  });

  it('classifies 50 km / 1,500 m alpine day as mountainous', () => {
    expect(classifyTerrainApi(50_000, 1_500)).toBe('mountainous');
    expect(classifyTerrain(50_000, 1_500)).toBe('mountainous');
  });
});

describe('terrainMultiplier (api + ts must match)', () => {
  it('returns documented multipliers for each class', () => {
    for (const fn of [terrainMultiplierApi, terrainMultiplier]) {
      expect(fn('flat')).toBe(1.00);
      expect(fn('rolling')).toBe(1.05);
      expect(fn('hilly')).toBe(1.10);
      expect(fn('mountainous')).toBe(1.15);
    }
  });

  it('returns 1.00 for null / undefined / unknown input', () => {
    for (const fn of [terrainMultiplierApi, terrainMultiplier]) {
      expect(fn(null)).toBe(1.00);
      expect(fn(undefined)).toBe(1.00);
      // @ts-expect-error — deliberately testing bad input
      expect(fn('bogus')).toBe(1.00);
    }
  });
});

// ─── estimateTSSWithSource (api side) — scoping + terrain_class on every tier ─

describe('estimateTSSWithSource: tier scoping', () => {
  it('Tier 1 (device): returns stored TSS unchanged regardless of terrain', () => {
    const flat = estimateTSSWithSource(
      { tss: 100, distance: 50_000, total_elevation_gain: 0 },
      undefined,
    );
    const mountain = estimateTSSWithSource(
      { tss: 100, distance: 50_000, total_elevation_gain: 1_500 },
      undefined,
    );
    expect(flat.tss).toBe(100);
    expect(mountain.tss).toBe(100);
    expect(flat.source).toBe('device');
    expect(mountain.source).toBe('device');
    expect(flat.terrain_class).toBe('flat');
    expect(mountain.terrain_class).toBe('mountainous');
  });

  it('Tier 3 (power): NP/FTP TSS is unchanged regardless of terrain', () => {
    const flat = estimateTSSWithSource(
      {
        moving_time: 3_600,
        normalized_power: 250,
        distance: 30_000,
        total_elevation_gain: 0,
      },
      250, // ftp — gives IF=1.0, expected TSS≈100
    );
    const mountain = estimateTSSWithSource(
      {
        moving_time: 3_600,
        normalized_power: 250,
        distance: 30_000,
        total_elevation_gain: 1_500, // mountainous
      },
      250,
    );
    expect(flat.source).toBe('power');
    expect(mountain.source).toBe('power');
    expect(flat.tss).toBe(mountain.tss);
    expect(flat.tss).toBe(100);
    expect(mountain.terrain_class).toBe('mountainous');
  });

  it('Tier 4 (kilojoules): mountain ride scales by 1.15 vs flat', () => {
    // 1h ride, 600 kJ, no FTP → avgPower=~167W, IF=~0.833 → TSS≈69.4
    const base = {
      moving_time: 3_600,
      kilojoules: 600,
      distance: 50_000,
    };
    const flat = estimateTSSWithSource(
      { ...base, total_elevation_gain: 0 },
      undefined,
    );
    const mountain = estimateTSSWithSource(
      { ...base, total_elevation_gain: 1_500 }, // 30 m/km → mountainous
      undefined,
    );
    expect(flat.source).toBe('kilojoules');
    expect(mountain.source).toBe('kilojoules');
    expect(flat.terrain_class).toBe('flat');
    expect(mountain.terrain_class).toBe('mountainous');

    // mountain TSS should be ~1.15x flat TSS (±1 from rounding)
    expect(mountain.tss).toBeGreaterThan(flat.tss);
    const ratio = mountain.tss / flat.tss;
    expect(ratio).toBeGreaterThan(1.14);
    expect(ratio).toBeLessThan(1.16);
  });

  it('Tier 4 (kilojoules with FTP): mountain ride scales by 1.15 vs flat', () => {
    const base = {
      moving_time: 3_600,
      kilojoules: 600,
      distance: 50_000,
    };
    const flat = estimateTSSWithSource(
      { ...base, total_elevation_gain: 0 },
      200, // with FTP
    );
    const mountain = estimateTSSWithSource(
      { ...base, total_elevation_gain: 1_500 },
      200,
    );
    expect(flat.source).toBe('kilojoules');
    expect(mountain.source).toBe('kilojoules');
    const ratio = mountain.tss / flat.tss;
    expect(ratio).toBeGreaterThan(1.14);
    expect(ratio).toBeLessThan(1.16);
  });

  it('Tier 5 (inferred): hilly ride scales by 1.10 vs flat', () => {
    // No kJ, no power, no NP — falls to Tier 5
    const base = {
      moving_time: 3_600,
      average_watts: 150,
      distance: 50_000,
    };
    const flat = estimateTSSWithSource(
      { ...base, total_elevation_gain: 0 },
      undefined,
    );
    const hilly = estimateTSSWithSource(
      { ...base, total_elevation_gain: 900 }, // 18 m/km → hilly
      undefined,
    );
    expect(flat.source).toBe('inferred');
    expect(hilly.source).toBe('inferred');
    expect(flat.terrain_class).toBe('flat');
    expect(hilly.terrain_class).toBe('hilly');
    expect(hilly.tss).toBeGreaterThan(flat.tss);
  });

  it('Tier 5 (inferred): returns terrain_class even when multiplier is 1.0', () => {
    const result = estimateTSSWithSource(
      { moving_time: 3_600, average_watts: 150, distance: 50_000, total_elevation_gain: 0 },
      undefined,
    );
    expect(result.terrain_class).toBe('flat');
    expect(result.source).toBe('inferred');
  });

  it('every tier returns terrain_class in the result', () => {
    // device
    const t1 = estimateTSSWithSource({ tss: 80 }, undefined);
    expect(t1.terrain_class).toBe('flat');

    // running → hr tier (isRunningActivity check)
    const t2 = estimateTSSWithSource(
      { type: 'Run', moving_time: 3_600, distance: 10_000 },
      undefined,
    );
    expect(t2.terrain_class).toBeDefined();

    // power
    const t3 = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 200 },
      250,
    );
    expect(t3.terrain_class).toBe('flat');

    // kilojoules
    const t4 = estimateTSSWithSource(
      { moving_time: 3_600, kilojoules: 600 },
      undefined,
    );
    expect(t4.terrain_class).toBe('flat');

    // inferred
    const t5 = estimateTSSWithSource(
      { moving_time: 3_600 },
      undefined,
    );
    expect(t5.terrain_class).toBe('flat');
  });
});

// ─── estimateTSS (ts side, fatigue-estimation.ts) — terrain scoping ──────────

describe('estimateTSS (client/ts): tier scoping', () => {
  it('power tier is unchanged regardless of terrain', () => {
    const flat: ActivityData = {
      duration_seconds: 3_600,
      normalized_power: 250,
      ftp: 250,
      distance_m: 30_000,
      total_elevation_m: 0,
    };
    const mountain: ActivityData = {
      duration_seconds: 3_600,
      normalized_power: 250,
      ftp: 250,
      distance_m: 30_000,
      total_elevation_m: 1_500,
    };
    const flatResult = estimateTSS(flat, defaultCal);
    const mountainResult = estimateTSS(mountain, defaultCal);
    expect(flatResult.source).toBe('power');
    expect(mountainResult.source).toBe('power');
    expect(flatResult.tss).toBe(mountainResult.tss);
    expect(mountainResult.terrain_class).toBe('mountainous');
  });

  it('inferred tier scales by 1.15 for mountainous terrain', () => {
    // 1h endurance ride, 1,500 m of climbing over 50 km
    const flat: ActivityData = {
      duration_seconds: 3_600,
      workout_type: 'endurance',
      total_elevation_m: 0,
      distance_m: 50_000,
    };
    const mountain: ActivityData = {
      duration_seconds: 3_600,
      workout_type: 'endurance',
      total_elevation_m: 1_500, // 30 m/km → mountainous
      distance_m: 50_000,
    };
    const flatResult = estimateTSS(flat, defaultCal);
    const mountainResult = estimateTSS(mountain, defaultCal);
    expect(flatResult.source).toBe('inferred');
    expect(mountainResult.source).toBe('inferred');
    expect(flatResult.terrain_class).toBe('flat');
    expect(mountainResult.terrain_class).toBe('mountainous');

    // flat: 48 TSS/hr + 0 bonus = 48, × 1.00 = 48
    // mountain: 48 + 50 bonus = 98, × 1.15 = 112.7
    expect(flatResult.tss).toBeCloseTo(48, 0);
    expect(mountainResult.tss).toBeCloseTo(112.7, 1);
  });

  it('inferred tier: elevation bonus still applies pre-multiplier', () => {
    // Existing test from fatigue-estimation.test.ts — no distance_m,
    // so terrain stays flat and multiplier is 1.0; elevation bonus alone
    // produces the delta.
    const flat: ActivityData = {
      duration_seconds: 3_600,
      workout_type: 'endurance',
      total_elevation_m: 0,
    };
    const hillyNoDistance: ActivityData = {
      duration_seconds: 3_600,
      workout_type: 'endurance',
      total_elevation_m: 900,
    };
    const flatResult = estimateTSS(flat, defaultCal);
    const hillyResult = estimateTSS(hillyNoDistance, defaultCal);
    // Without distance_m, terrain classifier returns 'flat' (safe default)
    // → multiplier 1.0 → delta is just the elevation bonus (30).
    expect(hillyResult.terrain_class).toBe('flat');
    expect(hillyResult.tss - flatResult.tss).toBeCloseTo(30, 0);
  });

  it('method_detail includes terrain for inferred tier', () => {
    const activity: ActivityData = {
      duration_seconds: 3_600,
      workout_type: 'endurance',
      total_elevation_m: 1_500,
      distance_m: 50_000,
    };
    const result = estimateTSS(activity, defaultCal);
    expect(result.method_detail).toContain('terrain=mountainous');
  });
});
