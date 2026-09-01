import { describe, it, expect } from 'vitest';
import {
  getSportType,
  sportTypeOfActivity,
  isCyclingType,
  isRunningType,
  isSupportedActivityType,
  SUPPORTED_ACTIVITY_TYPES,
  calculatePaceSecsPerKm,
  formatPace,
} from './sportTypes.js';

// Every distinct (sport_type, type) pair with more than a handful of rows in
// production, so this file is a record of what the importers actually emit
// rather than what they were assumed to emit.
const LIVE_PAIRS = [
  // sport_type,            type,                expected
  ['Ride', 'Ride', 'cycling'],
  ['VirtualRide', 'VirtualRide', 'cycling'],
  ['ROAD_BIKING', 'Ride', 'cycling'],
  ['cycling', 'Ride', 'cycling'],
  ['MountainBikeRide', 'Ride', 'cycling'],
  ['CYCLING', 'Ride', 'cycling'],
  ['EBikeRide', 'EBikeRide', 'cycling'],
  ['GravelRide', 'Ride', 'cycling'],
  ['GRAVEL_CYCLING', 'GravelRide', 'cycling'],
  ['MOUNTAIN_BIKING', 'MountainBikeRide', 'cycling'],
  ['VIRTUAL_RIDE', 'VirtualRide', 'cycling'],
  ['INDOOR_CYCLING', 'VirtualRide', 'cycling'],
  ['E_BIKE_FITNESS', 'Workout', 'cycling'],
  ['Run', 'Run', 'running'],
  ['RUNNING', 'Run', 'running'],
  ['TRAIL_RUNNING', 'TrailRun', 'running'],
  ['TrailRun', 'Run', 'running'],
  ['running', 'Run', 'running'],
  ['TREADMILL_RUNNING', 'Run', 'running'],
  ['INDOOR_RUNNING', 'Run', 'running'],
  ['WALKING', 'Walk', 'other'],
  ['walking', 'Walking', 'other'],
  ['STRENGTH_TRAINING', 'WeightTraining', 'other'],
  ['LAP_SWIMMING', 'Swim', 'other'],
  ['OPEN_WATER_SWIMMING', 'Swim', 'other'],
  ['HIKING', 'Hike', 'other'],
  ['hiking', 'Hiking', 'other'],
  ['training', 'Training', 'other'],
  ['mobility', 'Mobility', 'other'],
  ['generic', 'Generic', 'other'],
  ['OTHER', 'Workout', 'other'],
  ['alpine_skiing', 'Alpine_skiing', 'other'],
  ['RESORT_SKIING', 'AlpineSki', 'other'],
  ['YOGA', 'Yoga', 'other'],
  ['STAIR_CLIMBING', 'StairStepper', 'other'],
  ['INDOOR_ROWING', 'Rowing', 'other'],
  ['soccer', 'Soccer', 'other'],
  ['TRANSITION_V2', 'Workout', 'other'],
  [null, 'Ride', 'cycling'],
  [null, 'Workout', 'other'],
];

describe('sportTypeOfActivity — every pair seen in production', () => {
  for (const [sport_type, type, expected] of LIVE_PAIRS) {
    it(`${sport_type ?? '(null)'} / ${type} -> ${expected}`, () => {
      expect(sportTypeOfActivity({ sport_type, type })).toBe(expected);
    });
  }

  it('is other for an activity with neither column', () => {
    expect(sportTypeOfActivity({})).toBe('other');
    expect(sportTypeOfActivity(null)).toBe('other');
  });

  it('falls through a junk sport_type to the type column', () => {
    // sport_type carries whatever the importer sent; type is the normalised one.
    expect(sportTypeOfActivity({ sport_type: 'TRANSITION_V2', type: 'Ride' })).toBe('cycling');
    expect(sportTypeOfActivity({ sport_type: 'OTHER', type: 'Run' })).toBe('running');
  });
});

describe('getSportType', () => {
  it('reads all three vocabularies as the same sport', () => {
    for (const spelling of ['Ride', 'ROAD_BIKING', 'cycling', 'GRAVEL_CYCLING']) {
      expect(getSportType(spelling), spelling).toBe('cycling');
    }
    for (const spelling of ['Run', 'RUNNING', 'running', 'TRAIL_RUNNING']) {
      expect(getSportType(spelling), spelling).toBe('running');
    }
  });

  it('is case- and separator-insensitive', () => {
    expect(getSportType('road_biking')).toBe('cycling');
    expect(getSportType('Road Biking')).toBe('cycling');
    expect(getSportType('ROADBIKING')).toBe('cycling');
  });

  it('handles an unseen Garmin spelling rather than filing it under other', () => {
    // Garmin adds sport types faster than anyone updates a list.
    expect(getSportType('GRAVEL_CYCLING_V3')).toBe('cycling');
    expect(getSportType('GHOST_RUNNING')).toBe('running');
  });

  it('does not over-reach on the fallback', () => {
    for (const t of ['WALKING', 'YOGA', 'SOCCER', 'LAP_SWIMMING', 'STRENGTH_TRAINING']) {
      expect(getSportType(t), t).toBe('other');
    }
  });

  it('is other for empty input', () => {
    expect(getSportType(null)).toBe('other');
    expect(getSportType(undefined)).toBe('other');
    expect(getSportType('')).toBe('other');
  });
});

describe('isCyclingType / isRunningType', () => {
  it('agree with the classifier across vocabularies', () => {
    expect(isCyclingType('ROAD_BIKING')).toBe(true);
    expect(isCyclingType('Ride')).toBe(true);
    expect(isCyclingType('RUNNING')).toBe(false);
    expect(isRunningType('TRAIL_RUNNING')).toBe(true);
    expect(isRunningType('Ride')).toBe(false);
  });
});

describe('the import allowlist is deliberately NOT widened', () => {
  it('still accepts only the Strava names the webhook stores', () => {
    expect(SUPPORTED_ACTIVITY_TYPES).toEqual([
      'Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide',
      'Run', 'VirtualRun', 'TrailRun',
    ]);
  });

  it('rejects a Garmin spelling, because which payloads to STORE is a different question', () => {
    expect(isSupportedActivityType('ROAD_BIKING')).toBe(false);
    expect(isSupportedActivityType('Ride')).toBe(true);
  });
});

describe('pace helpers', () => {
  it('computes seconds per km', () => {
    expect(calculatePaceSecsPerKm(10000, 3000)).toBe(300);
  });

  it('is null on unusable input', () => {
    expect(calculatePaceSecsPerKm(0, 3000)).toBeNull();
    expect(calculatePaceSecsPerKm(10000, 0)).toBeNull();
  });

  it('formats M:SS', () => {
    expect(formatPace(300)).toBe('5:00');
    expect(formatPace(330)).toBe('5:30');
    expect(formatPace(0)).toBe('--:--');
  });
});
