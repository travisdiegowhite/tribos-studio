import { describe, it, expect } from 'vitest';
import {
  extractWorkoutRequirements,
  scoreSegmentMatch,
  mapPowerPctToZone,
} from './workoutSegmentMatcher.js';

// ─── Helper: Create mock segment with profile ──────────────────────────────

function createMockSegment(overrides = {}) {
  const { profile, ...segOverrides } = overrides;
  return {
    id: 'seg-1',
    display_name: 'Test Segment',
    terrain_type: 'flat',
    obstruction_score: 80,
    max_uninterrupted_seconds: 1200, // 20 min
    topology: 'out_and_back',
    is_repeatable: true,
    ride_count: 10,
    confidence_score: 75,
    distance_meters: 5000,
    avg_gradient: 1.2,
    training_segment_profiles: {
      typical_power_zone: 'sweet_spot',
      relevance_score: 60,
      consistency_score: 80,
      mean_avg_power: 240,
      mean_normalized_power: 250,
      zone_distribution: { sweet_spot: 0.6, threshold: 0.2, tempo: 0.2 },
      frequency_tier: 'regular',
      ...profile,
    },
    ...segOverrides,
  };
}

function createMockWorkout(overrides = {}) {
  return {
    id: 'test_workout',
    category: 'sweet_spot',
    terrainType: 'flat',
    structure: {
      warmup: { duration: 10, zone: 2, powerPctFTP: 60 },
      main: [
        {
          type: 'repeat',
          sets: 3,
          work: { duration: 10, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
          rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
        },
      ],
      cooldown: { duration: 5, zone: 1, powerPctFTP: 45 },
    },
    ...overrides,
  };
}

// ─── mapPowerPctToZone ──────────────────────────────────────────────────────

describe('mapPowerPctToZone', () => {
  it('maps recovery zone correctly', () => {
    expect(mapPowerPctToZone(45)).toBe('recovery');
    expect(mapPowerPctToZone(50)).toBe('recovery');
  });

  it('maps endurance zone correctly', () => {
    expect(mapPowerPctToZone(55)).toBe('endurance');
    expect(mapPowerPctToZone(65)).toBe('endurance');
    expect(mapPowerPctToZone(74)).toBe('endurance');
  });

  it('maps tempo zone correctly', () => {
    expect(mapPowerPctToZone(75)).toBe('tempo');
    expect(mapPowerPctToZone(85)).toBe('tempo');
  });

  it('maps sweet_spot zone correctly', () => {
    expect(mapPowerPctToZone(87)).toBe('sweet_spot');
    expect(mapPowerPctToZone(90)).toBe('sweet_spot');
    expect(mapPowerPctToZone(94)).toBe('sweet_spot');
  });

  it('maps threshold zone correctly', () => {
    expect(mapPowerPctToZone(95)).toBe('threshold');
    expect(mapPowerPctToZone(100)).toBe('threshold');
    expect(mapPowerPctToZone(104)).toBe('threshold');
  });

  it('maps vo2max zone correctly', () => {
    expect(mapPowerPctToZone(105)).toBe('vo2max');
    expect(mapPowerPctToZone(115)).toBe('vo2max');
  });

  it('maps anaerobic zone correctly', () => {
    expect(mapPowerPctToZone(120)).toBe('anaerobic');
    expect(mapPowerPctToZone(150)).toBe('anaerobic');
  });

  it('handles edge cases', () => {
    expect(mapPowerPctToZone(0)).toBe('recovery');
    expect(mapPowerPctToZone(null)).toBe('recovery');
    expect(mapPowerPctToZone(undefined)).toBe('recovery');
  });
});

// ─── extractWorkoutRequirements ─────────────────────────────────────────────

describe('extractWorkoutRequirements', () => {
  it('extracts requirements from simple repeat structure', () => {
    const workout = createMockWorkout();
    const req = extractWorkoutRequirements(workout);

    expect(req.longestWorkIntervalMinutes).toBe(10);
    expect(req.dominantPowerPctFTP).toBe(90);
    expect(req.targetZone).toBe('sweet_spot');
    expect(req.totalSets).toBe(3);
    expect(req.needsSteadyState).toBe(true); // 10 min >= 10
    expect(req.needsShortIntervals).toBe(false);
    expect(req.needsSprints).toBe(false);
    expect(req.isRecovery).toBe(false);
  });

  it('extracts requirements from nested repeat structure (30/30 intervals)', () => {
    const workout = createMockWorkout({
      category: 'vo2max',
      structure: {
        warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
        main: [
          {
            type: 'repeat',
            sets: 3,
            work: [
              {
                type: 'repeat',
                sets: 8,
                work: { duration: 0.5, zone: 5, powerPctFTP: 130, description: '30sec hard' },
                rest: { duration: 0.5, zone: 2, powerPctFTP: 60, description: '30sec easy' },
              },
            ],
            rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery between sets' },
          },
        ],
        cooldown: { duration: 10, zone: 1, powerPctFTP: 50 },
      },
    });

    const req = extractWorkoutRequirements(workout);

    expect(req.longestWorkIntervalMinutes).toBe(0.5);
    expect(req.dominantPowerPctFTP).toBe(130);
    // 130% FTP = 1.30 ratio, which falls in anaerobic zone (>=1.20)
    expect(req.targetZone).toBe('anaerobic');
    expect(req.totalSets).toBe(3);
    expect(req.needsSteadyState).toBe(false);
    expect(req.needsShortIntervals).toBe(true); // 0.5 min < 5, reps=24
    expect(req.needsSprints).toBe(false); // zone 5 < 6
  });

  it('extracts requirements from single steady-state segment', () => {
    const workout = createMockWorkout({
      category: 'endurance',
      structure: {
        warmup: { duration: 10, zone: 1, powerPctFTP: 50 },
        main: [
          { duration: 45, zone: 2, powerPctFTP: 65, description: 'Steady Zone 2' },
        ],
        cooldown: { duration: 5, zone: 1, powerPctFTP: 45 },
      },
    });

    const req = extractWorkoutRequirements(workout);

    expect(req.longestWorkIntervalMinutes).toBe(45);
    expect(req.dominantPowerPctFTP).toBe(65);
    expect(req.targetZone).toBe('endurance');
    expect(req.totalSets).toBe(1); // No repeats
    expect(req.needsSteadyState).toBe(true);
    expect(req.needsShortIntervals).toBe(false);
    expect(req.isRecovery).toBe(false);
  });

  it('identifies recovery workouts', () => {
    const workout = createMockWorkout({
      category: 'recovery',
      structure: {
        warmup: null,
        main: [
          { duration: 30, zone: 1, powerPctFTP: 45, description: 'Easy spin' },
        ],
        cooldown: null,
      },
    });

    const req = extractWorkoutRequirements(workout);

    expect(req.isRecovery).toBe(true);
    expect(req.targetZone).toBe('recovery');
    expect(req.longestWorkIntervalMinutes).toBe(30);
  });

  it('identifies sprint workouts', () => {
    const workout = createMockWorkout({
      category: 'anaerobic',
      structure: {
        warmup: { duration: 15, zone: 2, powerPctFTP: 60 },
        main: [
          {
            type: 'repeat',
            sets: 10,
            work: { duration: 0.5, zone: 7, powerPctFTP: 200, description: '30sec sprint' },
            rest: { duration: 4.5, zone: 1, powerPctFTP: 40, description: 'Full recovery' },
          },
        ],
        cooldown: { duration: 10, zone: 1, powerPctFTP: 45 },
      },
    });

    const req = extractWorkoutRequirements(workout);

    expect(req.needsSprints).toBe(true);
    expect(req.needsShortIntervals).toBe(true);
    expect(req.needsSteadyState).toBe(false);
  });
});

// ─── scoreSegmentMatch ──────────────────────────────────────────────────────

describe('scoreSegmentMatch', () => {
  it('scores a perfect match highly (sweet spot workout + sweet spot segment)', () => {
    const segment = createMockSegment({
      obstruction_score: 85,
      max_uninterrupted_seconds: 1200, // 20 min — enough for 10 min intervals
      topology: 'out_and_back',
      is_repeatable: true,
      profile: { typical_power_zone: 'sweet_spot', relevance_score: 80 },
    });

    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 270);

    expect(result.matchScore).toBeGreaterThanOrEqual(80);
    expect(result.powerMatch).toBe(100);
    expect(result.durationMatch).toBe(100);
    expect(result.obstructionMatch).toBe(100);
    expect(result.repeatabilityMatch).toBe(100);
  });

  it('penalizes power zone mismatch', () => {
    const segment = createMockSegment({
      profile: { typical_power_zone: 'recovery', relevance_score: 60 },
    });

    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 270);

    // recovery is 3 zones from sweet_spot: score = 20
    expect(result.powerMatch).toBe(20);
    // Overall score should be lower than a perfect match
    expect(result.matchScore).toBeLessThan(80);
  });

  it('penalizes insufficient duration for 2x20 FTP workout', () => {
    const workout = createMockWorkout({
      category: 'threshold',
      structure: {
        warmup: { duration: 10, zone: 2, powerPctFTP: 60 },
        main: [
          {
            type: 'repeat',
            sets: 2,
            work: { duration: 20, zone: 4, powerPctFTP: 100, description: '20min at FTP' },
            rest: { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
          },
        ],
        cooldown: { duration: 5, zone: 1, powerPctFTP: 45 },
      },
    });

    const segment = createMockSegment({
      max_uninterrupted_seconds: 300, // Only 5 min — way too short for 20 min
      profile: { typical_power_zone: 'threshold', relevance_score: 60 },
    });

    const requirements = extractWorkoutRequirements(workout);
    const result = scoreSegmentMatch(segment, requirements, 270);

    expect(result.durationMatch).toBe(20); // <50% of 20 min
  });

  it('scores VO2max workout higher on short repeatable segments', () => {
    const vo2Workout = createMockWorkout({
      category: 'vo2max',
      structure: {
        warmup: { duration: 15, zone: 2, powerPctFTP: 65 },
        main: [
          {
            type: 'repeat',
            sets: 5,
            work: { duration: 4, zone: 5, powerPctFTP: 115, description: '4min VO2max' },
            rest: { duration: 4, zone: 1, powerPctFTP: 50, description: 'Recovery' },
          },
        ],
        cooldown: { duration: 10, zone: 1, powerPctFTP: 50 },
      },
    });

    const repeatableSegment = createMockSegment({
      max_uninterrupted_seconds: 600, // 10 min
      topology: 'loop',
      is_repeatable: true,
      profile: { typical_power_zone: 'vo2max', relevance_score: 70 },
    });

    const pointToPointSegment = createMockSegment({
      max_uninterrupted_seconds: 600,
      topology: 'point_to_point',
      is_repeatable: false,
      profile: { typical_power_zone: 'vo2max', relevance_score: 70 },
    });

    const requirements = extractWorkoutRequirements(vo2Workout);
    const repeatableScore = scoreSegmentMatch(repeatableSegment, requirements, 270);
    const p2pScore = scoreSegmentMatch(pointToPointSegment, requirements, 270);

    expect(repeatableScore.matchScore).toBeGreaterThan(p2pScore.matchScore);
    expect(repeatableScore.repeatabilityMatch).toBe(100);
    expect(p2pScore.repeatabilityMatch).toBe(40);
  });

  it('recovery workout prefers flat segments regardless of power data', () => {
    const recoveryWorkout = createMockWorkout({
      category: 'recovery',
      structure: {
        warmup: null,
        main: [
          { duration: 30, zone: 1, powerPctFTP: 45, description: 'Easy spin' },
        ],
        cooldown: null,
      },
    });

    const flatSegment = createMockSegment({
      terrain_type: 'flat',
      obstruction_score: 50,
      profile: { typical_power_zone: 'endurance', relevance_score: 70 },
    });

    const requirements = extractWorkoutRequirements(recoveryWorkout);
    const result = scoreSegmentMatch(flatSegment, requirements, 270);

    // Recovery target zone is 'recovery', segment is 'endurance' — adjacent = 60
    expect(result.powerMatch).toBe(60);
    // 30 min duration makes needsSteadyState=true, so steady-state thresholds apply.
    // obstruction_score 50 => obs >= 45 = 40 under steady-state rules
    expect(result.obstructionMatch).toBe(40);
  });

  it('frequently-ridden segments score higher via relevance', () => {
    const workout = createMockWorkout();
    const requirements = extractWorkoutRequirements(workout);

    const frequentSegment = createMockSegment({
      profile: { typical_power_zone: 'sweet_spot', relevance_score: 90 },
    });
    const rareSegment = createMockSegment({
      profile: { typical_power_zone: 'sweet_spot', relevance_score: 10 },
    });

    const frequentResult = scoreSegmentMatch(frequentSegment, requirements, 270);
    const rareResult = scoreSegmentMatch(rareSegment, requirements, 270);

    expect(frequentResult.matchScore).toBeGreaterThan(rareResult.matchScore);
    expect(frequentResult.relevanceMatch).toBe(90);
    expect(rareResult.relevanceMatch).toBe(10);
  });

  it('generates match reasoning string', () => {
    const segment = createMockSegment();
    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 270);

    expect(typeof result.matchReasoning).toBe('string');
    expect(result.matchReasoning.length).toBeGreaterThan(0);
  });

  it('generates recommended power target when FTP is provided', () => {
    const segment = createMockSegment();
    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 270);

    expect(result.recommendedPowerTarget).not.toBeNull();
    expect(result.recommendedPowerTarget).toContain('W');
    expect(result.recommendedPowerTarget).toContain('FTP');
  });

  it('returns null power target when FTP is 0', () => {
    const segment = createMockSegment();
    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 0);

    expect(result.recommendedPowerTarget).toBeNull();
  });

  it('handles segment with no profile data gracefully', () => {
    const segment = createMockSegment({
      profile: null,
    });
    // Override: set profile to null
    segment.training_segment_profiles = null;

    const requirements = extractWorkoutRequirements(createMockWorkout());
    const result = scoreSegmentMatch(segment, requirements, 270);

    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);
    expect(result.powerMatch).toBe(50); // Neutral when no profile
    expect(result.relevanceMatch).toBe(0);
  });
});
