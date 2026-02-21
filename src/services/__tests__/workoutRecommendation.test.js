import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWorkoutRecommendation,
  getWorkoutRecommendations,
  analyzeTrainingNeeds,
  getRaceProximity,
  detectZoneGaps,
  getFormStatus,
} from '../workoutRecommendation';

// Mock the workout library
vi.mock('../../data/workoutLibrary', () => {
  const mockWorkouts = {
    recovery_spin: {
      id: 'recovery_spin',
      name: 'Recovery Spin',
      category: 'recovery',
      duration: 30,
      targetTSS: 20,
    },
    easy_recovery_ride: {
      id: 'easy_recovery_ride',
      name: 'Easy Recovery Ride',
      category: 'recovery',
      duration: 45,
      targetTSS: 30,
    },
    foundation_miles: {
      id: 'foundation_miles',
      name: 'Foundation Miles',
      category: 'endurance',
      duration: 60,
      targetTSS: 55,
    },
    endurance_base_build: {
      id: 'endurance_base_build',
      name: 'Endurance Base Build',
      category: 'endurance',
      duration: 90,
      targetTSS: 70,
    },
    long_endurance_ride: {
      id: 'long_endurance_ride',
      name: 'Long Endurance Ride',
      category: 'endurance',
      duration: 180,
      targetTSS: 140,
    },
    traditional_sst: {
      id: 'traditional_sst',
      name: 'Traditional SST',
      category: 'sweet_spot',
      duration: 65,
      targetTSS: 85,
    },
    three_by_ten_sst: {
      id: 'three_by_ten_sst',
      name: '3x10 Sweet Spot',
      category: 'sweet_spot',
      duration: 60,
      targetTSS: 80,
    },
    two_by_twenty_ftp: {
      id: 'two_by_twenty_ftp',
      name: '2x20 FTP',
      category: 'threshold',
      duration: 70,
      targetTSS: 90,
    },
    five_by_four_vo2: {
      id: 'five_by_four_vo2',
      name: '5x4 VO2max',
      category: 'vo2max',
      duration: 65,
      targetTSS: 95,
    },
    four_by_eight_vo2: {
      id: 'four_by_eight_vo2',
      name: '4x8 VO2max',
      category: 'vo2max',
      duration: 75,
      targetTSS: 105,
    },
  };

  return {
    getWorkoutById: vi.fn((id) => mockWorkouts[id] || null),
    getWorkoutsByCategory: vi.fn((category) => {
      return Object.values(mockWorkouts).filter(w => w.category === category);
    }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActivity({ daysAgo = 0, movingTimeMin = 60, avgWatts = null, tss = null } = {}) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    start_date: date.toISOString(),
    moving_time: movingTimeMin * 60,
    average_watts: avgWatts,
    training_stress_score: tss,
    name: 'Test Ride',
  };
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── getRaceProximity ─────────────────────────────────────────────────────────

describe('getRaceProximity', () => {
  it('returns null phase when no race goals', () => {
    const result = getRaceProximity([]);
    expect(result.phase).toBeNull();
    expect(result.nextRace).toBeNull();
  });

  it('returns race_week for race within 7 days', () => {
    const result = getRaceProximity([{ name: 'Crit', race_date: futureDate(5) }]);
    expect(result.phase).toBe('race_week');
    expect(result.daysUntilRace).toBe(5);
  });

  it('returns taper for race 8-14 days out', () => {
    const result = getRaceProximity([{ name: 'TT', race_date: futureDate(10) }]);
    expect(result.phase).toBe('taper');
  });

  it('returns final_build for race 15-28 days out', () => {
    const result = getRaceProximity([{ name: 'RR', race_date: futureDate(20) }]);
    expect(result.phase).toBe('final_build');
  });

  it('returns build for race 29-56 days out', () => {
    const result = getRaceProximity([{ name: 'GF', race_date: futureDate(40) }]);
    expect(result.phase).toBe('build');
  });

  it('returns base for race > 56 days out', () => {
    const result = getRaceProximity([{ name: 'Tour', race_date: futureDate(90) }]);
    expect(result.phase).toBe('base');
  });

  it('picks the closest future race', () => {
    const result = getRaceProximity([
      { name: 'Far Race', race_date: futureDate(60) },
      { name: 'Close Race', race_date: futureDate(5) },
    ]);
    expect(result.nextRace.name).toBe('Close Race');
    expect(result.phase).toBe('race_week');
  });

  it('ignores past races', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const result = getRaceProximity([
      { name: 'Past Race', race_date: pastDate.toISOString().split('T')[0] },
    ]);
    expect(result.phase).toBeNull();
  });
});

// ─── detectZoneGaps ───────────────────────────────────────────────────────────

describe('detectZoneGaps', () => {
  it('detects missing Z2 when no long easy ride this week (FTP-relative)', () => {
    // FTP = 200, Z2 threshold = 150W
    const activities = [
      makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 180 }), // too hard for Z2
      makeActivity({ daysAgo: 3, movingTimeMin: 45, avgWatts: 120 }), // too short
    ];
    const result = detectZoneGaps(activities, 200);
    expect(result.missingZ2).toBe(true);
  });

  it('detects Z2 present when long easy ride exists (FTP-relative)', () => {
    // FTP = 200, Z2 threshold = 150W. Ride at 140W > 60min counts.
    const activities = [
      makeActivity({ daysAgo: 2, movingTimeMin: 90, avgWatts: 140 }),
      makeActivity({ daysAgo: 4, movingTimeMin: 60, avgWatts: 180 }),
    ];
    const result = detectZoneGaps(activities, 200);
    expect(result.missingZ2).toBe(false);
  });

  it('uses FTP-relative threshold for intensity detection', () => {
    // FTP = 300, intensity threshold = 270W
    const activities = [
      makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 250 }), // below 270
    ];
    const result = detectZoneGaps(activities, 300);
    expect(result.missingIntensity).toBe(true);
  });

  it('finds intensity when ride above 90% FTP exists', () => {
    // FTP = 300, intensity threshold = 270W. Ride at 280W counts.
    const activities = [
      makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 280 }),
    ];
    const result = detectZoneGaps(activities, 300);
    expect(result.missingIntensity).toBe(false);
  });

  it('does not flag missingZ2 with fewer than 2 rides', () => {
    const activities = [
      makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 250 }),
    ];
    const result = detectZoneGaps(activities, 200);
    expect(result.missingZ2).toBe(false);
  });

  it('ignores activities older than 7 days', () => {
    const activities = [
      makeActivity({ daysAgo: 8, movingTimeMin: 90, avgWatts: 120 }),
      makeActivity({ daysAgo: 9, movingTimeMin: 60, avgWatts: 280 }),
    ];
    const result = detectZoneGaps(activities, 200);
    expect(result.totalRides).toBe(0);
  });

  it('counts ride with no power data as Z2 if long enough', () => {
    // No average_watts means we can't confirm it was hard, treated as Z2
    const activities = [
      makeActivity({ daysAgo: 1, movingTimeMin: 90, avgWatts: null }),
      makeActivity({ daysAgo: 2, movingTimeMin: 60, avgWatts: null }),
    ];
    const result = detectZoneGaps(activities, 200);
    expect(result.missingZ2).toBe(false);
  });
});

// ─── getFormStatus ────────────────────────────────────────────────────────────

describe('getFormStatus', () => {
  it('returns fresh for TSB >= 15', () => expect(getFormStatus(20)).toBe('fresh'));
  it('returns ready for TSB 5-14', () => expect(getFormStatus(10)).toBe('ready'));
  it('returns optimal for TSB -10 to 4', () => expect(getFormStatus(0)).toBe('optimal'));
  it('returns tired for TSB -25 to -11', () => expect(getFormStatus(-15)).toBe('tired'));
  it('returns fatigued for TSB < -25', () => expect(getFormStatus(-30)).toBe('fatigued'));
  it('handles boundary at 15', () => expect(getFormStatus(15)).toBe('fresh'));
  it('handles boundary at 5', () => expect(getFormStatus(5)).toBe('ready'));
  it('handles boundary at -10', () => expect(getFormStatus(-10)).toBe('optimal'));
  it('handles boundary at -25', () => expect(getFormStatus(-25)).toBe('tired'));
});

// ─── analyzeTrainingNeeds ─────────────────────────────────────────────────────

describe('analyzeTrainingNeeds', () => {
  it('forces recovery during race week', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      raceGoals: [{ name: 'Crit', race_date: futureDate(3) }],
    });
    expect(result.needs.recovery.score).toBe(95);
    expect(result.needs.vo2max.score).toBe(0);
    expect(result.raceProximity.phase).toBe('race_week');
  });

  it('forces endurance during taper', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      raceGoals: [{ name: 'TT', race_date: futureDate(10) }],
    });
    expect(result.needs.endurance.score).toBe(70);
    expect(result.needs.intensity.score).toBe(20);
    expect(result.raceProximity.phase).toBe('taper');
  });

  it('race proximity overrides even high TSB', () => {
    // Fresh (TSB 20) but race in 3 days — should still be recovery
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      raceGoals: [{ name: 'Crit', race_date: futureDate(3) }],
    });
    expect(result.needs.recovery.score).toBeGreaterThan(result.needs.intensity.score);
  });

  it('high TSB yields intensity-focused scores when no race', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
    });
    expect(result.needs.intensity.score).toBeGreaterThanOrEqual(80);
    expect(result.needs.vo2max.score).toBeGreaterThanOrEqual(70);
    expect(result.needs.recovery.score).toBeLessThanOrEqual(15);
  });

  it('very low TSB yields recovery-focused scores', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: -30, ctl: 50, atl: 80 },
    });
    expect(result.needs.recovery.score).toBeGreaterThanOrEqual(90);
    expect(result.needs.intensity.score).toBeLessThanOrEqual(20);
  });

  it('neutral TSB yields balanced scores', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
    });
    expect(result.needs.endurance.score).toBeGreaterThanOrEqual(60);
    expect(result.needs.threshold.score).toBeGreaterThanOrEqual(50);
  });

  it('boosts endurance when Z2 gap detected', () => {
    const baseResult = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      activities: [],
      ftp: 200,
    });

    const gapResult = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      activities: [
        makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 180 }),
        makeActivity({ daysAgo: 3, movingTimeMin: 60, avgWatts: 190 }),
      ],
      ftp: 200,
    });

    expect(gapResult.needs.endurance.score).toBeGreaterThan(baseResult.needs.endurance.score);
    expect(gapResult.gaps.missingZ2).toBe(true);
  });

  it('boosts intensity when intensity gap detected and form is favorable', () => {
    // TSB 8 → "ready" bracket (base intensity=65), +15 gap boost → 80
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 8, ctl: 60, atl: 52 },
      activities: [
        makeActivity({ daysAgo: 1, movingTimeMin: 90, avgWatts: 120 }),
        makeActivity({ daysAgo: 3, movingTimeMin: 60, avgWatts: 130 }),
      ],
      ftp: 200,
    });

    expect(result.gaps.missingIntensity).toBe(true);
    // Intensity base (65) + gap boost (15) = 80
    expect(result.needs.intensity.score).toBeGreaterThanOrEqual(75);
  });

  it('does not boost intensity when fatigued even if gap exists', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: -15, ctl: 50, atl: 65 },
      activities: [
        makeActivity({ daysAgo: 1, movingTimeMin: 60, avgWatts: 130 }),
        makeActivity({ daysAgo: 3, movingTimeMin: 60, avgWatts: 130 }),
      ],
      ftp: 200,
    });

    // Intensity should still be low despite gap — form is too poor
    expect(result.needs.recovery.score).toBeGreaterThan(result.needs.intensity.score);
  });

  it('honors planned recovery day', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'recovery' }],
    });
    expect(result.needs.recovery.score).toBeGreaterThanOrEqual(80);
  });

  it('honors planned threshold day', () => {
    const result = analyzeTrainingNeeds({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'threshold' }],
    });
    expect(result.needs.threshold.score).toBeGreaterThanOrEqual(80);
  });
});

// ─── getWorkoutRecommendation ─────────────────────────────────────────────────

describe('getWorkoutRecommendation', () => {
  it('returns recovery_spin during race week', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      raceGoals: [{ name: 'Crit', race_date: futureDate(3) }],
      ftp: 250,
    });
    expect(result.primary.workout.id).toBe('recovery_spin');
    expect(result.primary.category).toBe('recovery');
    expect(result.alternatives).toHaveLength(0);
  });

  it('returns foundation_miles during taper', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      raceGoals: [{ name: 'TT', race_date: futureDate(10) }],
      ftp: 250,
    });
    expect(result.primary.workout.id).toBe('foundation_miles');
    expect(result.primary.category).toBe('endurance');
  });

  it('race proximity overrides all other scoring', () => {
    // Even with TSB 20 (fresh) and no Z2 gap, race week forces recovery
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      activities: [],
      raceGoals: [{ name: 'Race', race_date: futureDate(5) }],
      ftp: 250,
    });
    expect(result.primary.category).toBe('recovery');
  });

  it('returns high intensity when fresh and no race', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      ftp: 250,
    });
    // Should recommend intensity, threshold, or vo2max
    expect(['threshold', 'vo2max', 'intensity']).toContain(result.primary.category);
    expect(result.primary.score).toBeGreaterThanOrEqual(70);
  });

  it('returns recovery when deeply fatigued', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: -30, ctl: 50, atl: 80 },
      ftp: 200,
    });
    expect(result.primary.category).toBe('recovery');
  });

  it('provides alternatives from different categories', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    // Alternatives should be different categories from primary
    for (const alt of result.alternatives) {
      expect(alt.category).not.toBe(result.primary.category);
    }
  });

  it('filters by timeAvailable', () => {
    const longResult = getWorkoutRecommendation({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      ftp: 200,
      timeAvailable: 120,
    });

    const shortResult = getWorkoutRecommendation({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      ftp: 200,
      timeAvailable: 30,
    });

    // Short time filter should exclude longer workouts
    if (shortResult.primary) {
      expect(shortResult.primary.workout.duration).toBeLessThanOrEqual(45);
    }
  });

  it('handles empty activities gracefully', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      activities: [],
      ftp: 200,
    });
    expect(result.primary).not.toBeNull();
    expect(result.analysis.gaps.missingZ2).toBe(false); // fewer than 2 rides
  });

  it('handles no race goals gracefully', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 0, ctl: 50, atl: 50 },
      raceGoals: [],
      ftp: 200,
    });
    expect(result.primary).not.toBeNull();
    expect(result.analysis.raceProximity.phase).toBeNull();
  });

  it('handles completely empty input', () => {
    const result = getWorkoutRecommendation();
    expect(result.primary).not.toBeNull();
    expect(result.analysis).toBeDefined();
  });

  it('includes analysis in response', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 5, ctl: 60, atl: 55 },
      ftp: 200,
    });
    expect(result.analysis).toBeDefined();
    expect(result.analysis.needs).toBeDefined();
    expect(result.analysis.raceProximity).toBeDefined();
    expect(result.analysis.gaps).toBeDefined();
    expect(result.analysis.formStatus).toBe('ready');
  });

  it('returns planned workout when one is scheduled for today', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'recovery', workout_id: 'recovery_spin', name: 'Recovery Spin' }],
      ftp: 250,
    });
    expect(result.primary.workout.id).toBe('recovery_spin');
    expect(result.primary.source).toBe('plan');
    expect(result.primary.category).toBe('recovery');
  });

  it('planned workout overrides TSB-based recommendation', () => {
    // TSB 20 (fresh) would normally suggest intensity, but plan says recovery
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'recovery', workout_id: 'recovery_spin', name: 'Recovery Spin' }],
      ftp: 250,
    });
    expect(result.primary.workout.id).toBe('recovery_spin');
    expect(result.primary.source).toBe('plan');
  });

  it('returns planned rest when rest day is scheduled', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'rest', name: 'Rest Day' }],
      ftp: 250,
    });
    expect(result.primary).toBeNull();
    expect(result.plannedRest).toBe(true);
  });

  it('skips completed planned workouts', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'recovery', workout_id: 'recovery_spin', completed: true }],
      ftp: 250,
    });
    // Should fall through to normal recommendation since planned workout is completed
    expect(result.primary.source).not.toBe('plan');
  });

  it('skips skipped planned workouts', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'recovery', workout_id: 'recovery_spin', skipped_reason: 'sick' }],
      ftp: 250,
    });
    // Should fall through to normal recommendation
    expect(result.primary.source).not.toBe('plan');
  });

  it('synthesizes workout from plan data when workout_id not in library', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      plannedWorkouts: [{
        scheduled_date: todayStr(),
        workout_type: 'endurance',
        workout_id: 'custom_workout_xyz',
        name: 'Custom Long Ride',
        duration_minutes: 120,
        target_tss: 100,
      }],
      ftp: 250,
    });
    expect(result.primary.source).toBe('plan');
    expect(result.primary.workout.name).toBe('Custom Long Ride');
    expect(result.primary.workout.duration).toBe(120);
    expect(result.primary.category).toBe('endurance');
  });

  it('synthesizes workout when no workout_id provided', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      plannedWorkouts: [{
        id: 'pw_123',
        scheduled_date: todayStr(),
        workout_type: 'threshold',
        name: 'Tempo Intervals',
        duration_minutes: 60,
      }],
      ftp: 250,
    });
    expect(result.primary.source).toBe('plan');
    expect(result.primary.workout.name).toBe('Tempo Intervals');
    expect(result.primary.category).toBe('threshold');
  });

  it('race proximity still overrides planned workouts', () => {
    const result = getWorkoutRecommendation({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      plannedWorkouts: [{ scheduled_date: todayStr(), workout_type: 'threshold', workout_id: 'two_by_twenty_ftp' }],
      raceGoals: [{ name: 'Crit', race_date: futureDate(3) }],
      ftp: 250,
    });
    // Race week should still force recovery
    expect(result.primary.category).toBe('recovery');
  });

  it('primary reason is always a non-empty string', () => {
    const scenarios = [
      { trainingMetrics: { tsb: 20 }, ftp: 200 },
      { trainingMetrics: { tsb: -30 }, ftp: 200 },
      { trainingMetrics: { tsb: 0 }, ftp: 200 },
      { trainingMetrics: { tsb: 10 }, raceGoals: [{ name: 'R', race_date: futureDate(3) }], ftp: 200 },
    ];
    for (const input of scenarios) {
      const result = getWorkoutRecommendation(input);
      if (result.primary) {
        expect(result.primary.reason).toBeTruthy();
        expect(typeof result.primary.reason).toBe('string');
      }
    }
  });
});

// ─── getWorkoutRecommendations (multi-category) ──────────────────────────────

describe('getWorkoutRecommendations', () => {
  it('returns single recovery category during race week', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 20, ctl: 80, atl: 60 },
      raceGoals: [{ name: 'Race', race_date: futureDate(3) }],
      ftp: 250,
    });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].category).toBe('recovery');
  });

  it('returns multiple categories for normal training', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
    });
    expect(result.categories.length).toBeGreaterThan(1);
  });

  it('categories are sorted by score descending', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
    });
    for (let i = 1; i < result.categories.length; i++) {
      expect(result.categories[i - 1].score).toBeGreaterThanOrEqual(result.categories[i].score);
    }
  });

  it('returns at most 3 categories', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
    });
    expect(result.categories.length).toBeLessThanOrEqual(3);
  });

  it('each category has workouts array', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
    });
    for (const cat of result.categories) {
      expect(Array.isArray(cat.workouts)).toBe(true);
      expect(cat.workouts.length).toBeGreaterThan(0);
    }
  });

  it('applies time filtering to all categories', () => {
    const result = getWorkoutRecommendations({
      trainingMetrics: { tsb: 10, ctl: 70, atl: 60 },
      ftp: 250,
      timeAvailable: 30,
    });
    for (const cat of result.categories) {
      for (const w of cat.workouts) {
        expect(w.duration).toBeLessThanOrEqual(45); // 30 + 15
      }
    }
  });
});
