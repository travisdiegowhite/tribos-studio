import { describe, it, expect } from 'vitest';
import {
  runFlatSpeedKmh,
  runDurationSeconds,
  isRunProfile,
  sportOfProfile,
  profileFromSavedRoute,
  sportOfSavedRoute,
} from '../runProfiles';
import { flatSpeedKmh, flatProfileSpeedKmh, targetDistanceKmForTime } from '../routeTargets.js';
import { calculatePersonalizedETA } from '../personalizedETA.js';
import { K_CLIMB } from '../../../api/utils/runLoad.js';

const FAST_RIDER = { road_speed: 32, average_speed: 30 };

describe('run profiles', () => {
  it('names the run profiles and their sport', () => {
    expect(isRunProfile('run')).toBe(true);
    expect(isRunProfile('trail_run')).toBe(true);
    expect(isRunProfile('walking')).toBe(false);
    expect(sportOfProfile('trail_run')).toBe('running');
    expect(sportOfProfile('gravel')).toBe('cycling');
  });

  it('restores a saved route onto its profile and sport', () => {
    expect(profileFromSavedRoute({ surface_type: 'trail_run', sport: 'running' })).toBe('trail_run');
    // Saved before migration 135: the surface still says run.
    expect(profileFromSavedRoute({ surface_type: 'run' })).toBe('run');
    expect(profileFromSavedRoute({ surface_type: 'paved', sport: 'running' })).toBe('run');
    expect(profileFromSavedRoute({ surface_type: 'gravel', sport: 'cycling' })).toBe('gravel');
    expect(profileFromSavedRoute({ surface_type: 'mtb' })).toBe('mountain');
    expect(profileFromSavedRoute({ surface_type: 'paved' })).toBeNull();
    expect(sportOfSavedRoute({ surface_type: 'run' })).toBe('running');
    expect(sportOfSavedRoute({ surface_type: 'road', sport: null })).toBe('cycling');
  });
});

describe('run speed', () => {
  it('derives easy pace from threshold pace', () => {
    // 4:00/km threshold × 1.25 easy = 5:00/km = 12 km/h.
    expect(runFlatSpeedKmh({ profile: 'run', goal: 'endurance', thresholdPaceSec: 240 })).toBeCloseTo(12, 5);
    // Tempo is faster than easy, recovery slower.
    const tempo = runFlatSpeedKmh({ profile: 'run', goal: 'tempo', thresholdPaceSec: 240 });
    const recovery = runFlatSpeedKmh({ profile: 'run', goal: 'recovery', thresholdPaceSec: 240 });
    expect(tempo).toBeGreaterThan(12);
    expect(recovery).toBeLessThan(12);
  });

  it('defaults without a threshold, slower on trail, and scales by goal', () => {
    expect(runFlatSpeedKmh({ profile: 'run' })).toBe(10);
    expect(runFlatSpeedKmh({ profile: 'trail_run' })).toBe(8.5);
    expect(runFlatSpeedKmh({ profile: 'run', goal: 'tempo' })).toBeGreaterThan(10);
  });

  it('never reads the ride-built speed profile for a run', () => {
    const run = flatSpeedKmh({ goal: 'endurance', routeProfile: 'run', speedProfile: FAST_RIDER });
    expect(run).toBe(10);
    expect(flatProfileSpeedKmh({ routeProfile: 'run', speedProfile: FAST_RIDER })).toBe(10);
    expect(
      flatSpeedKmh({ routeProfile: 'run', performanceMetrics: { averageSpeed: 30, confidence: 0.8 } }),
    ).toBe(10);
    // An hour of easy running at a 4:00/km threshold is 12 km.
    expect(targetDistanceKmForTime(60, { routeProfile: 'run', thresholdPaceSec: 240 })).toBeCloseTo(12, 5);
  });

  it('leaves ride speeds alone', () => {
    expect(flatProfileSpeedKmh({ routeProfile: 'road', speedProfile: FAST_RIDER })).toBe(32);
  });
});

describe('run ETA', () => {
  it('prices climb with K_CLIMB, the same constant run load uses', () => {
    const flat = runDurationSeconds({ distance_m: 10000, elevation_gain_m: 0, speedKmh: 10 });
    const hilly = runDurationSeconds({ distance_m: 10000, elevation_gain_m: 100, speedKmh: 10 });
    expect(flat).toBeCloseTo(3600, 5);
    expect(hilly - flat).toBeCloseTo(((K_CLIMB * 100) / 1000 / 10) * 3600, 5);
  });

  it('calculatePersonalizedETA takes the run branch for run profiles', () => {
    const eta = calculatePersonalizedETA({
      distanceKm: 10,
      elevationProfile: [
        { distance: 0, elevation: 100 },
        { distance: 5, elevation: 200 },
        { distance: 10, elevation: 100 },
      ],
      speedProfile: FAST_RIDER,
      routeProfile: 'run',
      trainingGoal: 'endurance',
      thresholdPaceSec: 240,
    }) as { totalSeconds: number; isPersonalized: boolean };
    // 10 km + 8 × 100 m climb = 10.8 equivalent km at 12 km/h = 54 min; the
    // descent earns no bonus and the rider's 32 km/h is ignored.
    expect(eta.totalSeconds).toBe(Math.round((10.8 / 12) * 3600));
    expect(eta.isPersonalized).toBe(true);
  });
});
