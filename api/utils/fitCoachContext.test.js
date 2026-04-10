import { describe, it, expect } from 'vitest';
import {
  pickSamplingInterval,
  resampleDataPoints,
  computePowerZoneDistribution,
  computeAerobicDecoupling,
  detectPowerDropouts,
  computeCadenceBandsForCoach,
  buildFitCoachContext,
} from './fitCoachContext.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const FTP = 250;

const POWER_ZONES = {
  z1: { min: 0,   max: 138 }, // <55% ftp
  z2: { min: 138, max: 188 }, // 55-75%
  z3: { min: 188, max: 225 }, // 75-90%
  z4: { min: 225, max: 263 }, // 90-105%
  z5: { min: 263, max: 300 }, // 105-120%
  z6: { min: 300, max: 375 }, // 120-150%
  z7: { min: 375, max: null }, // 150%+
};

/**
 * Build 1 Hz FIT records starting at an arbitrary epoch. Each entry is a
 * (power, hr, cadence) triplet; pass null to drop a field.
 */
function makeRecords(samples, startMs = 1_700_000_000_000) {
  return samples.map(([power, hr, cadence], i) => ({
    timestamp: new Date(startMs + i * 1000).toISOString(),
    power,
    heartRate: hr,
    cadence,
  }));
}

// ─── pickSamplingInterval ──────────────────────────────────────────────────

describe('pickSamplingInterval', () => {
  it('returns 5s for short rides', () => {
    expect(pickSamplingInterval(30 * 60)).toBe(5);
    expect(pickSamplingInterval(89 * 60)).toBe(5);
  });

  it('returns 10s for 90-149 min rides', () => {
    expect(pickSamplingInterval(90 * 60)).toBe(10);
    expect(pickSamplingInterval(120 * 60)).toBe(10);
  });

  it('returns 30s for 150-239 min rides', () => {
    expect(pickSamplingInterval(150 * 60)).toBe(30);
    expect(pickSamplingInterval(200 * 60)).toBe(30);
  });

  it('returns 60s for 4hr+ rides', () => {
    expect(pickSamplingInterval(240 * 60)).toBe(60);
    expect(pickSamplingInterval(360 * 60)).toBe(60);
  });

  it('returns 5s for nonsense inputs', () => {
    expect(pickSamplingInterval(-1)).toBe(5);
    expect(pickSamplingInterval(NaN)).toBe(5);
  });
});

// ─── resampleDataPoints ────────────────────────────────────────────────────

describe('resampleDataPoints', () => {
  it('averages 1Hz power over a 5s window', () => {
    // 10 seconds of power: 200, 200, 200, 200, 200, 100, 100, 100, 100, 100
    const records = makeRecords([
      [200, 140, 90], [200, 140, 90], [200, 140, 90], [200, 140, 90], [200, 140, 90],
      [100, 130, 85], [100, 130, 85], [100, 130, 85], [100, 130, 85], [100, 130, 85],
    ]);
    const out = resampleDataPoints(records, 5);
    expect(out).toHaveLength(2);
    expect(out[0].t).toBe(0);
    expect(out[0].power).toBe(200);
    expect(out[0].hr).toBe(140);
    expect(out[0].cadence).toBe(90);
    expect(out[1].t).toBe(5);
    expect(out[1].power).toBe(100);
    expect(out[1].hr).toBe(130);
    expect(out[1].cadence).toBe(85);
  });

  it('preserves power=0 samples (dropouts must survive)', () => {
    // 5 seconds of power=0 with cadence still on
    const records = makeRecords([
      [0, 150, 92], [0, 150, 92], [0, 150, 92], [0, 150, 92], [0, 150, 92],
    ]);
    const out = resampleDataPoints(records, 5);
    expect(out).toHaveLength(1);
    expect(out[0].power).toBe(0);
    expect(out[0].cadence).toBe(92);
  });

  it('handles null HR without poisoning the HR average', () => {
    const records = makeRecords([
      [200, null, 90], [200, null, 90], [200, 140, 90], [200, 140, 90], [200, 140, 90],
    ]);
    const out = resampleDataPoints(records, 5);
    expect(out[0].power).toBe(200);
    // Only 3 of 5 HR samples are present; average = 140
    expect(out[0].hr).toBe(140);
  });

  it('returns empty array for empty input', () => {
    expect(resampleDataPoints([], 5)).toEqual([]);
    expect(resampleDataPoints(null, 5)).toEqual([]);
  });
});

// ─── computePowerZoneDistribution ──────────────────────────────────────────

describe('computePowerZoneDistribution', () => {
  it('returns null without zones', () => {
    expect(computePowerZoneDistribution([{ power: 200 }], null)).toBeNull();
  });

  it('excludes power=0 samples from the denominator (coasting)', () => {
    const resampled = [
      { t: 0, power: 200, hr: 140, cadence: 90 }, // Z3
      { t: 5, power: 200, hr: 140, cadence: 90 }, // Z3
      { t: 10, power: 0,  hr: 120, cadence: 0  }, // coast - excluded
      { t: 15, power: 0,  hr: 120, cadence: 0  }, // coast - excluded
    ];
    const dist = computePowerZoneDistribution(resampled, POWER_ZONES);
    expect(dist.pedaling_samples).toBe(2);
    expect(dist.z3).toBe(100);
    expect(dist.z1).toBe(0);
  });

  it('distributes across Z1-Z7 correctly', () => {
    const samples = [
      100, 100, // Z1
      150, 150, 150, 150, // Z2 x4
      200, 200, // Z3 x2
      240, 240, // Z4 x2
      280, // Z5 x1
      320, // Z6 x1
      400, // Z7 x1
    ];
    const resampled = samples.map((p, i) => ({ t: i * 5, power: p, hr: 150, cadence: 90 }));
    const dist = computePowerZoneDistribution(resampled, POWER_ZONES);
    // 13 total samples
    expect(dist.pedaling_samples).toBe(13);
    const sum = dist.z1 + dist.z2 + dist.z3 + dist.z4 + dist.z5 + dist.z6 + dist.z7;
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
    expect(dist.z7).toBeGreaterThan(0);
    expect(dist.z2).toBeGreaterThan(dist.z5);
  });
});

// ─── computeAerobicDecoupling ──────────────────────────────────────────────

describe('computeAerobicDecoupling', () => {
  it('returns null for short rides', () => {
    expect(computeAerobicDecoupling([])).toBeNull();
    const tiny = Array.from({ length: 50 }, (_, i) => ({ power: 200, hr: 140, cadence: 90, t: i * 5 }));
    expect(computeAerobicDecoupling(tiny)).toBeNull();
  });

  it('flags significant cardiac drift when HR rises on flat power', () => {
    // 300 samples: power flat at 200 throughout; HR steady 140 first half, 170 second half
    const records = [];
    for (let i = 0; i < 150; i++) records.push({ t: i * 5, power: 200, hr: 140, cadence: 90 });
    for (let i = 0; i < 150; i++) records.push({ t: (i + 150) * 5, power: 200, hr: 170, cadence: 90 });
    const out = computeAerobicDecoupling(records);
    expect(out).not.toBeNull();
    expect(out.decoupling_pct).toBeGreaterThan(7);
    expect(out.interpretation).toBe('significant-drift');
  });

  it('reports well-coupled when power and HR track together', () => {
    const records = [];
    for (let i = 0; i < 150; i++) records.push({ t: i * 5, power: 200, hr: 140, cadence: 90 });
    for (let i = 0; i < 150; i++) records.push({ t: (i + 150) * 5, power: 200, hr: 141, cadence: 90 });
    const out = computeAerobicDecoupling(records);
    expect(out).not.toBeNull();
    expect(out.interpretation).toBe('well-coupled');
  });
});

// ─── detectPowerDropouts ───────────────────────────────────────────────────

describe('detectPowerDropouts', () => {
  it('flags power=0 while cadence is turning over', () => {
    const resampled = [
      { t: 0, power: 200, hr: 140, cadence: 90 },
      { t: 5, power: 0, hr: 142, cadence: 92 },   // dropout
      { t: 10, power: 0, hr: 145, cadence: 91 },  // dropout
      { t: 15, power: 0, hr: 146, cadence: 90 },  // dropout
      { t: 20, power: 0, hr: 147, cadence: 90 },  // dropout
      { t: 25, power: 200, hr: 148, cadence: 90 },
    ];
    const out = detectPowerDropouts(resampled, 5);
    expect(out.total_dropouts).toBe(4);
    expect(out.dropout_seconds).toBe(20);
    expect(out.suspected_sensor_failure).toBe(true);
  });

  it('does NOT flag coasting (power=0 AND cadence=0)', () => {
    const resampled = [
      { t: 0, power: 200, hr: 140, cadence: 90 },
      { t: 5, power: 0, hr: 130, cadence: 0 }, // coasting
      { t: 10, power: 0, hr: 125, cadence: 0 }, // coasting
      { t: 15, power: 200, hr: 135, cadence: 90 },
    ];
    const out = detectPowerDropouts(resampled, 5);
    expect(out.total_dropouts).toBe(0);
    expect(out.suspected_sensor_failure).toBe(false);
  });
});

// ─── computeCadenceBandsForCoach ──────────────────────────────────────────

describe('computeCadenceBandsForCoach', () => {
  it('returns null for empty input', () => {
    expect(computeCadenceBandsForCoach([])).toBeNull();
  });

  it('bands pedaling cadence correctly', () => {
    const resampled = [
      { t: 0, power: 200, hr: 140, cadence: 65 }, // <70
      { t: 5, power: 200, hr: 140, cadence: 80 }, // 70-84
      { t: 10, power: 200, hr: 140, cadence: 90 }, // 85-94
      { t: 15, power: 200, hr: 140, cadence: 100 }, // 95+
      { t: 20, power: 0,   hr: 130, cadence: 0 }, // coasting — ignored
    ];
    const out = computeCadenceBandsForCoach(resampled);
    expect(out.below_70).toBe(25);
    expect(out.band_70_84).toBe(25);
    expect(out.band_85_94).toBe(25);
    expect(out.band_95_plus).toBe(25);
    expect(out.avg).toBe(Math.round((65 + 80 + 90 + 100) / 4));
  });
});

// ─── buildFitCoachContext (integration) ────────────────────────────────────

describe('buildFitCoachContext', () => {
  it('returns null for rides shorter than 60 seconds', () => {
    const records = makeRecords(Array(30).fill([200, 140, 90]));
    expect(buildFitCoachContext({ allDataPoints: records, ftp: FTP, powerZones: POWER_ZONES })).toBeNull();
  });

  it('assembles a full context for a realistic 30-min ride with a dropout window and cardiac drift', () => {
    // 1800 seconds: first 900s flat power 200W @ HR 140; second 900s power 200W @ HR 170
    // Inject a 20s dropout window at t=500s (power=0, cadence=90)
    const samples = [];
    for (let i = 0; i < 1800; i++) {
      const inDropout = i >= 500 && i < 520;
      const power = inDropout ? 0 : 200;
      const hr = i < 900 ? 140 : 170;
      samples.push([power, hr, 90]);
    }
    const records = makeRecords(samples);
    const ctx = buildFitCoachContext({
      allDataPoints: records,
      ftp: FTP,
      maxHR: 190,
      powerZones: POWER_ZONES,
    });

    expect(ctx).not.toBeNull();
    expect(ctx.schema_version).toBe(1);
    expect(ctx.interval_seconds).toBe(5);
    expect(ctx.duration_seconds).toBeGreaterThanOrEqual(1799);
    expect(ctx.sample_count).toBeGreaterThan(350);
    expect(ctx.sample_count).toBeLessThan(400);

    // Power zone distribution: 200W at FTP 250 is Z3 (75-90%)
    expect(ctx.power_zone_distribution).not.toBeNull();
    expect(ctx.power_zone_distribution.z3).toBeGreaterThan(90);

    // Aerobic decoupling should flag cardiac drift (HR rose from 140 to 170)
    expect(ctx.aerobic_decoupling).not.toBeNull();
    expect(ctx.aerobic_decoupling.interpretation).toBe('significant-drift');
    expect(ctx.aerobic_decoupling.decoupling_pct).toBeGreaterThan(7);

    // Dropouts should be flagged
    expect(ctx.power_dropouts.total_dropouts).toBeGreaterThan(0);
    expect(ctx.power_dropouts.suspected_sensor_failure).toBe(true);

    // Cadence was steady at 90 throughout
    expect(ctx.cadence_bands.band_85_94).toBe(100);
    expect(ctx.cadence_bands.avg).toBe(90);
  });

  it('degrades gracefully without FTP / powerZones', () => {
    const samples = Array.from({ length: 1800 }, () => [200, 140, 90]);
    const records = makeRecords(samples);
    const ctx = buildFitCoachContext({ allDataPoints: records });
    expect(ctx).not.toBeNull();
    expect(ctx.power_zone_distribution).toBeNull();
    expect(ctx.cadence_bands).not.toBeNull();
    expect(ctx.sample_count).toBeGreaterThan(0);
  });
});
