/**
 * The canonical speed model — and specifically the property that used to be
 * false: a requested ride time and the ride time the UI displays must agree.
 *
 * Before routeTargets owned this, target-distance calculation was keyed
 * `recovery/endurance/intervals/hills` while the RB2 generate form offers
 * `endurance/tempo/threshold/recovery/long_ride/commute`. Four of the six fell
 * through to a 19 km/h default while personalizedETA used 25 km/h × its own
 * multiplier, so asking for a 90-minute tempo ride produced a route the app
 * then labelled ~65 minutes.
 */
import { describe, it, expect } from 'vitest';
import {
  RIDE_GOAL_INTENSITY,
  DEFAULT_RIDE_GOAL,
  rideGoalIntensity,
  flatProfileSpeedKmh,
  flatSpeedKmh,
  targetDistanceKmForTime,
} from '../routeTargets.js';
import { calculatePersonalizedETA } from '../personalizedETA.js';

/** The goals the RB2 generate form offers (useGenerateForm GOAL_OPTIONS). */
const FORM_GOALS = ['endurance', 'tempo', 'threshold', 'recovery', 'long_ride', 'commute'];

const INTENSITY = RIDE_GOAL_INTENSITY as Record<string, number>;

/** A perfectly flat profile, so only the flat-speed model is under test. */
function flatProfile(distanceKm: number) {
  return [
    { distance: 0, elevation: 100 },
    { distance: distanceKm, elevation: 100 },
  ];
}

describe('ride goal vocabulary', () => {
  it('resolves every goal the generate form can produce', () => {
    for (const goal of FORM_GOALS) {
      expect(INTENSITY[goal], `missing goal: ${goal}`).toBeGreaterThan(0);
    }
  });

  it('falls back to endurance for unknown or absent goals', () => {
    const fallback = INTENSITY[DEFAULT_RIDE_GOAL];
    expect(rideGoalIntensity('not_a_goal')).toBe(fallback);
    expect(rideGoalIntensity(undefined)).toBe(fallback);
    expect(rideGoalIntensity(null)).toBe(fallback);
  });

  it('is case-insensitive', () => {
    expect(rideGoalIntensity('Tempo')).toBe(RIDE_GOAL_INTENSITY.tempo);
  });
});

describe('flatProfileSpeedKmh', () => {
  it('uses profile defaults with no rider data', () => {
    expect(flatProfileSpeedKmh({ routeProfile: 'road' })).toBe(25);
    expect(flatProfileSpeedKmh({ routeProfile: 'gravel' })).toBe(20);
    expect(flatProfileSpeedKmh({ routeProfile: 'mtb' })).toBe(16);
  });

  it('prefers the rider measured speed over the default', () => {
    const speedProfile = { road_speed: 31, average_speed: 29 };
    expect(flatProfileSpeedKmh({ routeProfile: 'road', speedProfile })).toBe(31);
  });

  it('blends Strava performance metrics toward the default by confidence', () => {
    const blended = flatProfileSpeedKmh({
      routeProfile: 'road',
      performanceMetrics: { averageSpeed: 35, confidence: 0.5 },
    });
    expect(blended).toBeCloseTo(35 * 0.5 + 25 * 0.5, 5);
  });

  it('ignores performance metrics with no confidence', () => {
    expect(
      flatProfileSpeedKmh({
        routeProfile: 'road',
        performanceMetrics: { averageSpeed: 35, confidence: 0 },
      }),
    ).toBe(25);
  });
});

describe('flatSpeedKmh', () => {
  it('folds the goal intensity into the base speed', () => {
    expect(flatSpeedKmh({ goal: 'tempo', routeProfile: 'road' })).toBeCloseTo(
      25 * RIDE_GOAL_INTENSITY.tempo,
      5,
    );
  });

  it('applies a positive speed modifier and ignores a nonsensical one', () => {
    const base = flatSpeedKmh({ goal: 'endurance' });
    expect(flatSpeedKmh({ goal: 'endurance', speedModifier: 1.1 })).toBeCloseTo(base * 1.1, 5);
    expect(flatSpeedKmh({ goal: 'endurance', speedModifier: 0 })).toBeCloseTo(base, 5);
  });
});

describe('targetDistanceKmForTime', () => {
  it('returns 0 for an unusable time', () => {
    expect(targetDistanceKmForTime(0)).toBe(0);
    expect(targetDistanceKmForTime(-30)).toBe(0);
    expect(targetDistanceKmForTime(undefined)).toBe(0);
  });
});

describe('targeting and the displayed ETA agree', () => {
  // The regression that motivated the whole model. On flat ground the two
  // must be inverses of each other for every goal the form offers.
  it.each(FORM_GOALS)('a 90-minute %s request displays as ~90 minutes', (goal) => {
    const requestedMinutes = 90;
    const distanceKm = targetDistanceKmForTime(requestedMinutes, {
      goal,
      routeProfile: 'road',
    });

    const eta = calculatePersonalizedETA({
      distanceKm,
      elevationProfile: flatProfile(distanceKm),
      routeProfile: 'road',
      trainingGoal: goal,
    }) as { totalSeconds: number };

    expect(eta.totalSeconds / 60).toBeCloseTo(requestedMinutes, 0);
  });

  it('agrees for a rider with a measured speed profile too', () => {
    const speedProfile = { road_speed: 31, average_speed: 29 };
    const distanceKm = targetDistanceKmForTime(60, {
      goal: 'endurance',
      routeProfile: 'road',
      speedProfile,
    });
    const eta = calculatePersonalizedETA({
      distanceKm,
      elevationProfile: flatProfile(distanceKm),
      speedProfile,
      routeProfile: 'road',
      trainingGoal: 'endurance',
    }) as { totalSeconds: number };

    expect(eta.totalSeconds / 60).toBeCloseTo(60, 0);
  });

  it('would have failed before the fix: tempo no longer lands 25%+ short', () => {
    // The old path targeted 19 km/h for tempo and displayed 25 × 1.05.
    const legacyTargetKm = (90 / 60) * 19;
    const legacyDisplayedMinutes = (legacyTargetKm / (25 * 1.05)) * 60;
    expect(legacyDisplayedMinutes).toBeLessThan(70); // the bug, for the record

    const distanceKm = targetDistanceKmForTime(90, { goal: 'tempo', routeProfile: 'road' });
    const eta = calculatePersonalizedETA({
      distanceKm,
      elevationProfile: flatProfile(distanceKm),
      routeProfile: 'road',
      trainingGoal: 'tempo',
    }) as { totalSeconds: number };
    expect(eta.totalSeconds / 60).toBeGreaterThan(85);
  });
});
