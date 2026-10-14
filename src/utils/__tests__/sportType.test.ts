import { describe, it, expect } from 'vitest';
import {
  getActivitySport,
  isRunningActivity,
  isCyclingActivity,
  isPowerSport,
  getActivityNoun,
} from '../sportType';
import { sportTypeOfActivity } from '../../../api/utils/sportTypes.js';
import {
  getSportTypeFromActivityType,
  isRunningActivity as isRunningType,
  isOtherActivity,
} from '../../types/training';

// Rows as the importers actually write them (sport_type, type).
const ROWS: Array<[string | null, string | null, 'cycling' | 'running' | 'other']> = [
  ['Ride', 'Ride', 'cycling'],
  ['ROAD_BIKING', 'Ride', 'cycling'],
  ['GRAVEL_CYCLING', 'GravelRide', 'cycling'],
  ['E_BIKE_FITNESS', 'Workout', 'cycling'],
  ['cycling', 'Ride', 'cycling'],
  ['Run', 'Run', 'running'],
  ['TRAIL_RUNNING', 'TrailRun', 'running'],
  ['TREADMILL_RUNNING', 'Run', 'running'],
  [null, 'TreadmillRun', 'running'],
  ['running', 'Run', 'running'],
  ['LAP_SWIMMING', 'Swim', 'other'],
  ['STRENGTH_TRAINING', 'WeightTraining', 'other'],
  [null, 'Workout', 'other'],
];

describe('browser sport helpers', () => {
  it('agree with the server classifier on every importer spelling', () => {
    for (const [sport_type, type, expected] of ROWS) {
      const row = { sport_type, type };
      expect(getActivitySport(row), `${sport_type}/${type}`).toBe(expected);
      expect(getActivitySport(row)).toBe(sportTypeOfActivity(row));
    }
  });

  it('files Garmin ROAD_BIKING as cycling (was "other")', () => {
    expect(isCyclingActivity({ sport_type: 'ROAD_BIKING', type: null })).toBe(true);
    expect(isPowerSport({ sport_type: 'ROAD_BIKING', type: null })).toBe(true);
  });

  it('never treats a run as a power sport, even with footpod watts', () => {
    const run = { sport_type: 'RUNNING', type: 'Run', average_watts: 250, device_watts: true };
    expect(isRunningActivity(run)).toBe(true);
    expect(isPowerSport(run)).toBe(false);
  });

  it('trusts power on an unclassified activity only if the device measured it', () => {
    expect(isPowerSport({ type: 'Workout', device_watts: true })).toBe(true);
    expect(isPowerSport({ type: 'Workout', average_watts: 150 })).toBe(false);
  });

  it('picks the sport noun', () => {
    expect(getActivityNoun({ sport_type: 'TRAIL_RUNNING' })).toBe('run');
    expect(getActivityNoun({ sport_type: 'ROAD_BIKING' }, 'plural')).toBe('rides');
    expect(getActivityNoun(null)).toBe('activity');
    expect(getActivitySport(undefined)).toBe('other');
  });

  it('keeps the string helpers in types/training on the same classifier', () => {
    expect(getSportTypeFromActivityType('TRAIL_RUNNING')).toBe('running');
    expect(getSportTypeFromActivityType('ROAD_BIKING')).toBe('cycling');
    expect(isRunningType('TreadmillRun')).toBe(true);
    expect(isOtherActivity('Swim')).toBe(true);
  });
});
