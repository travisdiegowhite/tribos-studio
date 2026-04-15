import { describe, it, expect } from 'vitest';
import {
  classifyTerrain as classifyTerrainApi,
  terrainMultiplier as terrainMultiplierApi,
  isMountainBike as isMountainBikeApi,
  applyActivityTypeMultiplier as applyActivityTypeMultiplierApi,
  filterZeroPowerPoints as filterZeroPowerPointsApi,
  estimateTSSWithSource,
} from '../../../../api/utils/fitnessSnapshots.js';
import {
  classifyTerrain,
  terrainMultiplier,
  isMountainBike,
  applyActivityTypeMultiplier,
  filterZeroPowerPoints,
  estimateTSS,
} from '../fatigue-estimation';
import type { ActivityData, CalibrationFactors } from '../types';

const defaultCal: CalibrationFactors = {
  trimp_to_tss: 0.85,
  srpe_to_tss: 0.55,
  sample_count: 0,
};

// ─── classifyTerrain (classification stays class-based for the UI chip) ──────

describe('classifyTerrain (api + ts must match)', () => {
  it('returns flat when distance is 0', () => {
    expect(classifyTerrainApi(0, 500)).toBe('flat');
    expect(classifyTerrain(0, 500)).toBe('flat');
  });

  it('returns flat when elevation is 0', () => {
    expect(classifyTerrainApi(50_000, 0)).toBe('flat');
    expect(classifyTerrain(50_000, 0)).toBe('flat');
  });

  it('classifies 10 m/km as rolling', () => {
    expect(classifyTerrainApi(10_000, 100)).toBe('rolling');
    expect(classifyTerrain(10_000, 100)).toBe('rolling');
  });

  it('classifies 20 m/km as hilly', () => {
    expect(classifyTerrainApi(10_000, 200)).toBe('hilly');
    expect(classifyTerrain(10_000, 200)).toBe('hilly');
  });

  it('classifies 50 km / 1500 m alpine day as mountainous', () => {
    expect(classifyTerrainApi(50_000, 1_500)).toBe('mountainous');
    expect(classifyTerrain(50_000, 1_500)).toBe('mountainous');
  });
});

// ─── terrainMultiplier (spec §3.1 continuous formula) ────────────────────────

describe('terrainMultiplier (api + ts, spec §3.1 formula)', () => {
  it('returns 1.0 for an empty / flat activity (no gradient, no VAM)', () => {
    const flat = { distance: 50_000, total_elevation_gain: 0, moving_time: 3_600 };
    expect(terrainMultiplierApi(flat)).toBeCloseTo(1.0, 3);

    const flatTs: ActivityData = {
      duration_seconds: 3_600, distance_m: 50_000, total_elevation_m: 0,
    };
    expect(terrainMultiplier(flatTs)).toBeCloseTo(1.0, 3);
  });

  it('returns 1.0 for null / undefined input', () => {
    expect(terrainMultiplierApi(null)).toBe(1.0);
    expect(terrainMultiplierApi(undefined)).toBe(1.0);
    expect(terrainMultiplier(null)).toBe(1.0);
    expect(terrainMultiplier(undefined)).toBe(1.0);
  });

  it('scales with gradient: 3% avg grade → 1 + 3 × 0.015 = 1.045 × vamFactor', () => {
    // 50 km, 1500 m elev, 1 h → avgGrade = 3%, vam = 1500 m/h → vamFactor=1.15
    // multiplier = 1.045 × 1.0 × 1.15 = 1.20175
    const act = { distance: 50_000, total_elevation_gain: 1_500, moving_time: 3_600 };
    expect(terrainMultiplierApi(act)).toBeCloseTo(1.045 * 1.15, 3);
  });

  it('adds steepFactor when percent_above_6_percent is provided', () => {
    const act = {
      distance: 50_000, total_elevation_gain: 0, moving_time: 3_600,
      average_gradient_percent: 0, percent_above_6_percent: 10,
    };
    // 1 + 10 × 0.002 = 1.02
    expect(terrainMultiplierApi(act)).toBeCloseTo(1.02, 3);
  });

  it('caps at 1.40 for extreme values', () => {
    const act = {
      distance: 10_000, total_elevation_gain: 2_500, moving_time: 1_800,
      average_gradient_percent: 20, percent_above_6_percent: 60,
    };
    // Raw product is well above 1.40; cap kicks in.
    expect(terrainMultiplierApi(act)).toBe(1.4);
  });

  it('respects explicit average_gradient_percent over distance/elev fallback', () => {
    const act = {
      distance: 100_000, total_elevation_gain: 0, moving_time: 3_600,
      average_gradient_percent: 5, percent_above_6_percent: 0,
    };
    // gradient only: 1 + 5 × 0.015 = 1.075; vam=0 → vamFactor=1.0
    expect(terrainMultiplierApi(act)).toBeCloseTo(1.075, 3);
  });
});

// ─── isMountainBike + applyActivityTypeMultiplier ────────────────────────────

describe('isMountainBike + applyActivityTypeMultiplier', () => {
  it('identifies MountainBikeRide from sport_type', () => {
    expect(isMountainBikeApi({ sport_type: 'MountainBikeRide' })).toBe(true);
    expect(isMountainBike({ duration_seconds: 1, sport_type: 'MountainBikeRide' })).toBe(true);
  });

  it('identifies MountainBikeRide from type', () => {
    expect(isMountainBikeApi({ type: 'MountainBikeRide' })).toBe(true);
    expect(isMountainBike({ duration_seconds: 1, type: 'MountainBikeRide' })).toBe(true);
  });

  it('returns false for Ride, GravelRide, Run, null', () => {
    for (const fn of [isMountainBikeApi]) {
      expect(fn({ type: 'Ride' })).toBe(false);
      expect(fn({ type: 'GravelRide' })).toBe(false);
      expect(fn({ type: 'Run' })).toBe(false);
      expect(fn(null)).toBe(false);
    }
  });

  it('multiplies RSS by 1.3 for MTB, passes through otherwise', () => {
    const mtb = { type: 'MountainBikeRide' };
    const ride = { type: 'Ride' };
    expect(applyActivityTypeMultiplierApi(100, mtb)).toBe(130);
    expect(applyActivityTypeMultiplierApi(100, ride)).toBe(100);

    const mtbTs: ActivityData = { duration_seconds: 1, type: 'MountainBikeRide' };
    expect(applyActivityTypeMultiplier(100, mtbTs)).toBe(130);
  });
});

// ─── filterZeroPowerPoints (spec §3.2 EP zero-power handling) ────────────────

describe('filterZeroPowerPoints (spec §3.2)', () => {
  it('returns empty for empty / missing power stream', () => {
    expect(filterZeroPowerPointsApi([], undefined)).toEqual([]);
    expect(filterZeroPowerPoints([], undefined)).toEqual([]);
    expect(filterZeroPowerPointsApi(null, undefined)).toEqual([]);
  });

  it('passes through unchanged when speed stream is absent', () => {
    const p = [100, 0, 200, 0, 150];
    expect(filterZeroPowerPointsApi(p)).toEqual(p);
    expect(filterZeroPowerPoints(p)).toEqual(p);
  });

  it('drops coasting points (power=0, speed > 5 km/h)', () => {
    // power=0 + moving fast → coasting: drop
    // power=0 + stopped       → intentional rest: keep
    // power>0                 → keep regardless of speed
    const pow = [100, 0, 0, 200, 0];
    const kmh = [25, 35, 2, 30, 4];
    expect(filterZeroPowerPointsApi(pow, kmh)).toEqual([100, 0, 200, 0]);
    expect(filterZeroPowerPoints(pow, kmh)).toEqual([100, 0, 200, 0]);
  });

  it('uses 5 km/h as the boundary — points at exactly 5 are kept', () => {
    // Strict >: speed===5 is not > 5 → point kept.
    expect(filterZeroPowerPointsApi([0], [5])).toEqual([0]);
    expect(filterZeroPowerPointsApi([0], [5.01])).toEqual([]);
  });
});

// ─── estimateTSSWithSource — D4 scoping preserved ───────────────────────────

describe('estimateTSSWithSource: D4 scoping (api)', () => {
  it('Tier 1 (device): RSS unchanged regardless of terrain', () => {
    const flat = estimateTSSWithSource(
      { tss: 100, distance: 50_000, total_elevation_gain: 0, moving_time: 3_600 },
      undefined,
    );
    const mountain = estimateTSSWithSource(
      { tss: 100, distance: 50_000, total_elevation_gain: 1_500, moving_time: 3_600 },
      undefined,
    );
    expect(flat.tss).toBe(100);
    expect(mountain.tss).toBe(100);
    expect(flat.source).toBe('device');
    expect(mountain.source).toBe('device');
  });

  it('Tier 3 (power): NP-derived RSS unchanged regardless of terrain', () => {
    const flat = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 250, distance: 30_000, total_elevation_gain: 0 },
      250,
    );
    const mountain = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 250, distance: 30_000, total_elevation_gain: 1_500 },
      250,
    );
    expect(flat.source).toBe('power');
    expect(mountain.source).toBe('power');
    expect(flat.tss).toBe(mountain.tss);
  });

  it('Tier 4 (kilojoules): mountainous scales RSS upward over flat', () => {
    const base = { moving_time: 3_600, kilojoules: 600, distance: 50_000 };
    const flat = estimateTSSWithSource({ ...base, total_elevation_gain: 0 }, undefined);
    const mountain = estimateTSSWithSource({ ...base, total_elevation_gain: 1_500 }, undefined);
    expect(flat.source).toBe('kilojoules');
    expect(mountain.source).toBe('kilojoules');
    expect(mountain.tss).toBeGreaterThan(flat.tss);
  });

  it('Tier 5 (inferred): hilly ride scales RSS upward over flat', () => {
    const base = { moving_time: 3_600, average_watts: 150, distance: 50_000 };
    const flat = estimateTSSWithSource({ ...base, total_elevation_gain: 0 }, undefined);
    const hilly = estimateTSSWithSource({ ...base, total_elevation_gain: 900 }, undefined);
    expect(flat.source).toBe('inferred');
    expect(hilly.source).toBe('inferred');
    expect(hilly.tss).toBeGreaterThan(flat.tss);
  });

  it('every tier still returns terrain_class for the UI chip', () => {
    const t1 = estimateTSSWithSource({ tss: 80, distance: 1_000, total_elevation_gain: 0 }, undefined);
    expect(t1.terrain_class).toBe('flat');

    const t3 = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 200, distance: 1_000, total_elevation_gain: 0 },
      250,
    );
    expect(t3.terrain_class).toBe('flat');

    const t4 = estimateTSSWithSource(
      { moving_time: 3_600, kilojoules: 600, distance: 1_000, total_elevation_gain: 0 },
      undefined,
    );
    expect(t4.terrain_class).toBe('flat');

    const t5 = estimateTSSWithSource({ moving_time: 3_600 }, undefined);
    expect(t5.terrain_class).toBe('flat');
  });

  it('MTB activity gets 1.3× multiplier at the power tier (no terrain stacking)', () => {
    const ride = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 250, type: 'Ride' },
      250,
    );
    const mtb = estimateTSSWithSource(
      { moving_time: 3_600, normalized_power: 250, type: 'MountainBikeRide' },
      250,
    );
    expect(ride.source).toBe('power');
    expect(mtb.source).toBe('power');
    expect(mtb.tss).toBe(Math.round(ride.tss * 1.3));
  });

  it('MTB multiplier stacks on top of terrain at the inferred tier', () => {
    const base = {
      moving_time: 3_600, average_watts: 150,
      distance: 50_000, total_elevation_gain: 900,
    };
    const ride = estimateTSSWithSource({ ...base, type: 'Ride' }, undefined);
    const mtb = estimateTSSWithSource({ ...base, type: 'MountainBikeRide' }, undefined);
    expect(ride.source).toBe('inferred');
    expect(mtb.source).toBe('inferred');
    // mtb should be ≈ 1.3 × ride (rounding-tolerant)
    const ratio = mtb.tss / ride.tss;
    expect(ratio).toBeGreaterThan(1.27);
    expect(ratio).toBeLessThan(1.33);
  });
});

// ─── estimateTSS (ts side, fatigue-estimation.ts) — D4 scoping preserved ─────

describe('estimateTSS (ts): D4 scoping', () => {
  it('power tier is unchanged regardless of terrain', () => {
    const flat: ActivityData = {
      duration_seconds: 3_600, normalized_power: 250, ftp: 250,
      distance_m: 30_000, total_elevation_m: 0,
    };
    const mountain: ActivityData = {
      duration_seconds: 3_600, normalized_power: 250, ftp: 250,
      distance_m: 30_000, total_elevation_m: 1_500,
    };
    const flatResult = estimateTSS(flat, defaultCal);
    const mountainResult = estimateTSS(mountain, defaultCal);
    expect(flatResult.source).toBe('power');
    expect(mountainResult.source).toBe('power');
    expect(flatResult.tss).toBe(mountainResult.tss);
  });

  it('inferred tier scales with gradient + VAM', () => {
    const flat: ActivityData = {
      duration_seconds: 3_600, workout_type: 'endurance',
      distance_m: 50_000, total_elevation_m: 0,
    };
    const mountain: ActivityData = {
      duration_seconds: 3_600, workout_type: 'endurance',
      distance_m: 50_000, total_elevation_m: 1_500,
    };
    const flatResult = estimateTSS(flat, defaultCal);
    const mountainResult = estimateTSS(mountain, defaultCal);
    expect(flatResult.source).toBe('inferred');
    expect(mountainResult.source).toBe('inferred');
    expect(mountainResult.tss).toBeGreaterThan(flatResult.tss);
  });

  it('method_detail still includes terrain_class for the inferred tier', () => {
    const activity: ActivityData = {
      duration_seconds: 3_600, workout_type: 'endurance',
      distance_m: 50_000, total_elevation_m: 1_500,
    };
    const result = estimateTSS(activity, defaultCal);
    expect(result.method_detail).toContain('terrain=mountainous');
  });

  it('MTB multiplier applied to inferred-tier RSS', () => {
    const base = {
      duration_seconds: 3_600, workout_type: 'endurance',
      distance_m: 50_000, total_elevation_m: 0,
    } as const;
    const ride = estimateTSS({ ...base, type: 'Ride' } as ActivityData, defaultCal);
    const mtb = estimateTSS({ ...base, type: 'MountainBikeRide' } as ActivityData, defaultCal);
    expect(ride.source).toBe('inferred');
    expect(mtb.source).toBe('inferred');
    expect(mtb.tss).toBeCloseTo(ride.tss * 1.3, 0);
  });
});
