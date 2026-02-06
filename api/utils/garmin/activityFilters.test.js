import { shouldFilterActivityType, isIndoorActivityType, hasMinimumActivityMetrics } from './activityFilters.js';

describe('shouldFilterActivityType', () => {
  it('filters health/monitoring types', () => {
    const filtered = ['sedentary', 'sleep', 'uncategorized', 'generic', 'all_day_tracking',
      'monitoring', 'daily_summary', 'respiration', 'breathwork', 'meditation', 'nap'];

    for (const type of filtered) {
      expect(shouldFilterActivityType(type)).toBe(true);
    }
  });

  it('does not filter real workout types', () => {
    const kept = ['cycling', 'running', 'swimming', 'hiking', 'walking',
      'indoor_cycling', 'mountain_biking', 'strength_training'];

    for (const type of kept) {
      expect(shouldFilterActivityType(type)).toBe(false);
    }
  });

  it('is case-insensitive (lowercases input)', () => {
    expect(shouldFilterActivityType('SEDENTARY')).toBe(true);
    expect(shouldFilterActivityType('Sedentary')).toBe(true);
    expect(shouldFilterActivityType('sedentary')).toBe(true);
    expect(shouldFilterActivityType('SLEEP')).toBe(true);
  });

  it('handles null/undefined/empty', () => {
    expect(shouldFilterActivityType(null)).toBe(false);
    expect(shouldFilterActivityType(undefined)).toBe(false);
    expect(shouldFilterActivityType('')).toBe(false);
  });
});

describe('isIndoorActivityType', () => {
  it('identifies indoor types', () => {
    const indoor = ['indoor_cycling', 'virtual_ride', 'indoor_running', 'treadmill_running',
      'indoor_walking', 'treadmill_walking', 'indoor_rowing', 'lap_swimming',
      'indoor_cardio', 'elliptical', 'stair_climbing', 'indoor_climbing'];

    for (const type of indoor) {
      expect(isIndoorActivityType(type)).toBe(true);
    }
  });

  it('returns false for outdoor types', () => {
    const outdoor = ['cycling', 'running', 'hiking', 'open_water_swimming', 'mountain_biking'];

    for (const type of outdoor) {
      expect(isIndoorActivityType(type)).toBe(false);
    }
  });

  it('handles null/undefined', () => {
    expect(isIndoorActivityType(null)).toBe(false);
    expect(isIndoorActivityType(undefined)).toBe(false);
  });
});

describe('hasMinimumActivityMetrics', () => {
  it('accepts activity with sufficient duration', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 120 })).toBe(true);
    expect(hasMinimumActivityMetrics({ movingDurationInSeconds: 300 })).toBe(true);
    expect(hasMinimumActivityMetrics({ elapsedDurationInSeconds: 150 })).toBe(true);
  });

  it('accepts activity with sufficient distance', () => {
    expect(hasMinimumActivityMetrics({ distanceInMeters: 100 })).toBe(true);
    expect(hasMinimumActivityMetrics({ distance: 500 })).toBe(true);
  });

  it('rejects trivial activities', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 30, distanceInMeters: 10 })).toBe(false);
    expect(hasMinimumActivityMetrics({})).toBe(false);
  });

  it('uses OR logic (either metric is enough)', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 200, distanceInMeters: 0 })).toBe(true);
    expect(hasMinimumActivityMetrics({ durationInSeconds: 0, distanceInMeters: 500 })).toBe(true);
  });
});
