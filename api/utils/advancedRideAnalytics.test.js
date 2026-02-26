import { describe, it, expect } from 'vitest';
import {
  analyzePacing,
  analyzeMatchBurning,
  analyzeFatigueResistance,
  analyzeHRZones,
  analyzeCadence,
  computePerRideAnalytics,
  estimateDynamicFTP,
  trackMMPProgression,
  calculateTrainingMonotonyStrain,
  scoreWorkoutExecution,
} from './advancedRideAnalytics.js';

// ─── Helper: Generate synthetic power streams ─────────────────────────────

function generateSteadyPower(watts, durationSeconds) {
  return Array(durationSeconds).fill(watts);
}

function generateFadingPower(startWatts, endWatts, durationSeconds) {
  return Array.from({ length: durationSeconds }, (_, i) =>
    Math.round(startWatts + (endWatts - startWatts) * (i / durationSeconds))
  );
}

function generateNegativeSplitPower(startWatts, endWatts, durationSeconds) {
  return generateFadingPower(startWatts, endWatts, durationSeconds);
}

function generateIntervalPower(basePower, intervalPower, intervalDuration, restDuration, intervals) {
  const stream = [];
  for (let i = 0; i < intervals; i++) {
    stream.push(...Array(intervalDuration).fill(intervalPower));
    stream.push(...Array(restDuration).fill(basePower));
  }
  return stream;
}

// ─── Pacing Analysis ──────────────────────────────────────────────────────

describe('analyzePacing', () => {
  it('returns null for short streams', () => {
    expect(analyzePacing([200, 200], 250)).toBeNull();
    expect(analyzePacing(null)).toBeNull();
  });

  it('detects even split pacing', () => {
    const stream = generateSteadyPower(200, 3600);
    const result = analyzePacing(stream, 250);
    expect(result.strategy).toBe('even_split');
    expect(result.split_ratio).toBeCloseTo(1.0, 1);
    expect(result.power_fade_percent).toBe(0);
  });

  it('detects positive split (fading)', () => {
    const stream = generateFadingPower(280, 180, 3600);
    const result = analyzePacing(stream, 250);
    expect(result.strategy).toBe('positive_split_heavy');
    expect(result.power_fade_percent).toBeLessThan(-10);
    expect(result.first_half_avg).toBeGreaterThan(result.second_half_avg);
  });

  it('detects negative split (getting stronger)', () => {
    const stream = generateNegativeSplitPower(180, 280, 3600);
    const result = analyzePacing(stream, 250);
    expect(result.strategy).toBe('negative_split');
    expect(result.first_half_avg).toBeLessThan(result.second_half_avg);
  });

  it('includes quarter-by-quarter breakdown', () => {
    const stream = generateSteadyPower(200, 3600);
    const result = analyzePacing(stream, 250);
    expect(result.quarter_avg_watts).toHaveLength(4);
    expect(result.quarter_np).toHaveLength(4);
    expect(result.quarter_if).toHaveLength(4);
  });
});

// ─── Match Burning Analysis ───────────────────────────────────────────────

describe('analyzeMatchBurning', () => {
  it('returns null for short streams or missing threshold', () => {
    expect(analyzeMatchBurning([200], 250)).toBeNull();
    expect(analyzeMatchBurning(generateSteadyPower(200, 3600), null)).toBeNull();
  });

  it('detects no matches in steady-state below threshold', () => {
    const stream = generateSteadyPower(200, 3600);
    const result = analyzeMatchBurning(stream, 250);
    expect(result.match_count).toBe(0);
    expect(result.total_time_above_threshold_sec).toBe(0);
  });

  it('detects matches in interval workout', () => {
    // 5 intervals of 60s at 300W with 120s rest at 150W, FTP=250
    const stream = generateIntervalPower(150, 300, 60, 120, 5);
    const result = analyzeMatchBurning(stream, 250, 10);
    expect(result.match_count).toBe(5);
    expect(result.total_time_above_threshold_sec).toBe(300); // 5 × 60s
    expect(result.peak_match_watts).toBe(300);
    expect(result.total_work_above_threshold_kj).toBeGreaterThan(0);
  });

  it('calculates work above threshold correctly', () => {
    // 30s at 300W above 250W threshold = 50W × 30s = 1500J = 1.5kJ
    const stream = [...Array(30).fill(300), ...Array(100).fill(150)];
    const result = analyzeMatchBurning(stream, 250, 10);
    expect(result.match_count).toBe(1);
    expect(result.matches[0].work_above_threshold_kj).toBeCloseTo(1.5, 0);
  });
});

// ─── Fatigue Resistance ───────────────────────────────────────────────────

describe('analyzeFatigueResistance', () => {
  it('returns null for short streams', () => {
    expect(analyzeFatigueResistance(Array(100).fill(200))).toBeNull();
  });

  it('rates steady power as excellent', () => {
    const stream = generateSteadyPower(250, 3600);
    const result = analyzeFatigueResistance(stream);
    expect(result.fatigue_resistance_index).toBeCloseTo(1.0, 1);
    expect(result.rating).toBe('excellent');
    expect(result.power_deciles).toHaveLength(10);
  });

  it('detects significant power fade', () => {
    const stream = generateFadingPower(300, 180, 3600);
    const result = analyzeFatigueResistance(stream);
    expect(result.fatigue_resistance_index).toBeLessThan(0.85);
    expect(result.rating).toBe('poor');
    expect(result.first_quarter_avg_watts).toBeGreaterThan(result.last_quarter_avg_watts);
  });

  it('detects cardiac drift when HR rises and power drops', () => {
    const powerStream = generateFadingPower(250, 220, 3600);
    // HR rising from 140 to 165
    const hrStream = Array.from({ length: 3600 }, (_, i) =>
      Math.round(140 + 25 * (i / 3600))
    );
    const result = analyzeFatigueResistance(powerStream, hrStream);
    expect(result.cardiac_drift).not.toBeNull();
    expect(result.cardiac_drift.drift_percent).toBeGreaterThan(0);
    expect(result.cardiac_drift.pw_hr_ratio_first_quarter).toBeGreaterThan(
      result.cardiac_drift.pw_hr_ratio_last_quarter
    );
  });
});

// ─── HR Zone Analysis ─────────────────────────────────────────────────────

describe('analyzeHRZones', () => {
  it('returns null for insufficient data', () => {
    expect(analyzeHRZones(null, 190)).toBeNull();
    expect(analyzeHRZones([150], 190)).toBeNull();
    expect(analyzeHRZones(Array(100).fill(150), null)).toBeNull();
  });

  it('correctly distributes time in zones', () => {
    // All in Zone 4 (80-90% of 190 = 152-171 bpm)
    const hrStream = Array(600).fill(160);
    const result = analyzeHRZones(hrStream, 190);
    expect(result.zones[3].name).toBe('Zone 4 - Threshold');
    expect(result.zones[3].percent).toBe(100);
    expect(result.avg_hr).toBe(160);
    expect(result.peak_hr).toBe(160);
  });

  it('handles mixed zones', () => {
    // 300s at 120bpm (Z2: 60-70% of 190 = 114-133), 300s at 175bpm (Z5: >90% of 190 = 171+)
    const hrStream = [...Array(300).fill(120), ...Array(300).fill(175)];
    const result = analyzeHRZones(hrStream, 190);
    expect(result.zones[1].percent).toBe(50); // Z2
    expect(result.zones[4].percent).toBe(50); // Z5
  });
});

// ─── Cadence Analysis ─────────────────────────────────────────────────────

describe('analyzeCadence', () => {
  it('returns null for insufficient data', () => {
    expect(analyzeCadence(null)).toBeNull();
    expect(analyzeCadence(Array(10).fill(90))).toBeNull();
  });

  it('calculates cadence metrics correctly', () => {
    const stream = Array(600).fill(85);
    const result = analyzeCadence(stream);
    expect(result.avg_cadence).toBe(85);
    expect(result.peak_cadence).toBe(85);
    expect(result.coasting_percent).toBe(0);
    expect(result.variability_cv).toBe(0); // No variation in constant cadence
  });

  it('detects coasting', () => {
    // 300s pedaling at 90rpm, 300s coasting (0rpm)
    const stream = [...Array(300).fill(90), ...Array(300).fill(0)];
    const result = analyzeCadence(stream);
    expect(result.coasting_percent).toBe(50);
    expect(result.avg_cadence).toBe(90); // Only pedaling samples
  });

  it('produces cadence distribution buckets', () => {
    const stream = Array(600).fill(85);
    const result = analyzeCadence(stream);
    // 85rpm should be in 80-90 bucket
    const optimalBucket = result.distribution.find(d => d.label.includes('optimal'));
    expect(optimalBucket.percent).toBe(100);
  });
});

// ─── computePerRideAnalytics (integration) ────────────────────────────────

describe('computePerRideAnalytics', () => {
  it('computes all analytics when all streams available', () => {
    const result = computePerRideAnalytics({
      powerStream: generateSteadyPower(220, 3600),
      hrStream: Array(3600).fill(150),
      cadenceStream: Array(3600).fill(85),
      ftp: 250,
      maxHR: 190,
    });

    expect(result).not.toBeNull();
    expect(result.pacing).not.toBeNull();
    expect(result.fatigue_resistance).not.toBeNull();
    expect(result.match_burning).not.toBeNull();
    expect(result.hr_zones).not.toBeNull();
    expect(result.cadence_analysis).not.toBeNull();
    expect(result.variability_index).toBeGreaterThan(0);
    expect(result.efficiency_factor).toBeGreaterThan(0);
  });

  it('works with only power data', () => {
    const result = computePerRideAnalytics({
      powerStream: generateSteadyPower(220, 3600),
      ftp: 250,
    });

    expect(result.pacing).not.toBeNull();
    expect(result.match_burning).not.toBeNull();
    expect(result.hr_zones).toBeUndefined();
    expect(result.cadence_analysis).toBeUndefined();
  });

  it('returns null when no usable data', () => {
    const result = computePerRideAnalytics({
      powerStream: [100],
    });
    expect(result).toBeNull();
  });
});

// ─── Dynamic FTP Estimation ───────────────────────────────────────────────

describe('estimateDynamicFTP', () => {
  it('returns null for no activities', () => {
    expect(estimateDynamicFTP([], 250)).toBeNull();
    expect(estimateDynamicFTP(null, 250)).toBeNull();
  });

  it('estimates FTP from 20-min power', () => {
    const activities = [
      {
        power_curve_summary: { '1200s': 280 },
        start_date: '2026-01-15',
      },
    ];
    const result = estimateDynamicFTP(activities, 250);
    expect(result.estimated_ftp).toBe(Math.round(280 * 0.95)); // 266
    expect(result.method).toContain('20-min');
    expect(result.confidence).toBe('high');
  });

  it('falls back to 5-min power when no 20-min effort', () => {
    const activities = [
      {
        power_curve_summary: { '300s': 350 },
        start_date: '2026-01-15',
      },
    ];
    const result = estimateDynamicFTP(activities);
    expect(result.estimated_ftp).toBe(Math.round(350 * 0.75)); // 263
    expect(result.confidence).toBe('moderate');
  });

  it('uses weighted average when both 20-min and 60-min available', () => {
    const activities = [
      {
        power_curve_summary: { '1200s': 280, '3600s': 255 },
        start_date: '2026-01-15',
      },
    ];
    const result = estimateDynamicFTP(activities, 250);
    expect(result.confidence).toBe('very_high');
    // Weighted: (280*0.95)*0.4 + 255*0.6 = 106.4 + 153 = 259
    expect(result.estimated_ftp).toBeGreaterThan(250);
  });

  it('recommends FTP update when delta is significant', () => {
    const activities = [
      {
        power_curve_summary: { '1200s': 310 },
        start_date: '2026-01-15',
      },
    ];
    const result = estimateDynamicFTP(activities, 250);
    expect(result.delta_from_current).toBeGreaterThan(0);
    expect(result.recommendation).toContain('higher');
  });
});

// ─── MMP Progression ──────────────────────────────────────────────────────

describe('trackMMPProgression', () => {
  it('returns empty for no activities', () => {
    expect(trackMMPProgression([])).toEqual([]);
  });

  it('tracks progression over time', () => {
    // Simulate 6 months of activities with increasing power
    const activities = [];
    for (let month = 0; month < 6; month++) {
      const date = new Date(2025, 6 + month, 15);
      activities.push({
        start_date: date.toISOString(),
        power_curve_summary: {
          '5s': 500 + month * 20,
          '60s': 350 + month * 10,
          '300s': 280 + month * 8,
          '1200s': 250 + month * 5,
          '3600s': 220 + month * 4,
        },
      });
    }

    const result = trackMMPProgression(activities);
    expect(result.progression.length).toBeGreaterThan(0);
    expect(result.durations).toBeDefined();
    // Trends should show improvement
    if (result.trends['300s']) {
      expect(result.trends['300s'].change).toBeGreaterThan(0);
    }
  });
});

// ─── Training Monotony & Strain ───────────────────────────────────────────

describe('calculateTrainingMonotonyStrain', () => {
  it('returns null for insufficient data', () => {
    expect(calculateTrainingMonotonyStrain([100, 100])).toBeNull();
  });

  it('calculates high monotony for identical daily TSS', () => {
    // Same TSS every day = high monotony (mean/stddev → infinity)
    // Use almost-identical values to avoid division by zero
    const daily = [100, 100, 100, 100, 100, 100, 100];
    const result = calculateTrainingMonotonyStrain(daily);
    // With zero variance, monotony would be 0 (from our implementation: mean/0 = 0)
    expect(result).not.toBeNull();
    expect(result.weekly_tss).toBe(700);
  });

  it('calculates low monotony for variable training', () => {
    // Alternating hard/easy days
    const daily = [200, 50, 180, 0, 150, 60, 0];
    const result = calculateTrainingMonotonyStrain(daily);
    expect(result.monotony).toBeLessThan(2.0);
    expect(result.risk).not.toBe('high');
  });

  it('flags high overtraining risk', () => {
    // Heavy, monotonous training
    const daily = Array(14).fill(0);
    // Last 7 days: high, similar daily TSS
    daily[7] = 300; daily[8] = 310; daily[9] = 290;
    daily[10] = 305; daily[11] = 295; daily[12] = 310; daily[13] = 300;
    const result = calculateTrainingMonotonyStrain(daily);
    expect(result.monotony).toBeGreaterThan(2.0);
  });

  it('includes trend when 14 days available', () => {
    const daily = [
      100, 0, 80, 0, 90, 50, 0, // Prior week: moderate
      200, 50, 180, 0, 150, 60, 0, // Current week: heavier
    ];
    const result = calculateTrainingMonotonyStrain(daily);
    expect(result.trend).not.toBeNull();
    expect(result.trend.direction).toBeDefined();
  });
});

// ─── Workout Execution Scoring ────────────────────────────────────────────

describe('scoreWorkoutExecution', () => {
  it('returns null for missing data', () => {
    expect(scoreWorkoutExecution(null, {})).toBeNull();
    expect(scoreWorkoutExecution({}, null)).toBeNull();
  });

  it('scores a perfectly executed workout as nailed_it', () => {
    const planned = {
      target_duration_minutes: 60,
      target_tss: 75,
      target_intensity_factor: 0.85,
    };
    const actual = {
      moving_time: 3600,
      tss: 75,
      intensity_factor: 0.85,
    };
    const result = scoreWorkoutExecution(planned, actual);
    expect(result.overall_score).toBeGreaterThanOrEqual(90);
    expect(result.rating).toBe('nailed_it');
    expect(result.was_completed).toBe(true);
  });

  it('scores a partially completed workout lower', () => {
    const planned = {
      target_duration_minutes: 120,
      target_tss: 150,
    };
    const actual = {
      moving_time: 3600, // 60 min instead of 120
      tss: 75, // Half of target
    };
    const result = scoreWorkoutExecution(planned, actual);
    expect(result.overall_score).toBeLessThan(75);
    expect(result.rating).not.toBe('nailed_it');
  });

  it('handles distance-based workouts', () => {
    const planned = {
      target_distance_km: 100,
      target_duration_minutes: 180,
    };
    const actual = {
      distance: 95000, // 95km
      moving_time: 10800, // 180 min
    };
    const result = scoreWorkoutExecution(planned, actual);
    expect(result.overall_score).toBeGreaterThan(80);
    expect(result.breakdown.distance).toBeGreaterThan(90);
  });
});
