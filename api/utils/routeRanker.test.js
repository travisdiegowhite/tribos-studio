import { describe, it, expect } from 'vitest';
import { rankRoutes, scoreRoute, workoutTypeToGoal } from './routeRanker.js';

describe('workoutTypeToGoal', () => {
  it('maps endurance to endurance', () => {
    expect(workoutTypeToGoal('endurance')).toBe('endurance');
  });

  it('maps recovery to recovery', () => {
    expect(workoutTypeToGoal('recovery')).toBe('recovery');
  });

  it('maps interval-style workouts to intervals', () => {
    expect(workoutTypeToGoal('threshold')).toBe('intervals');
    expect(workoutTypeToGoal('tempo')).toBe('intervals');
    expect(workoutTypeToGoal('vo2max')).toBe('intervals');
    expect(workoutTypeToGoal('sweet_spot')).toBe('intervals');
  });

  it('maps climbing to hills', () => {
    expect(workoutTypeToGoal('climbing')).toBe('hills');
  });

  it('returns null for unknown or missing types', () => {
    expect(workoutTypeToGoal(null)).toBeNull();
    expect(workoutTypeToGoal('mystery')).toBeNull();
  });
});

describe('scoreRoute', () => {
  const ctx = (overrides = {}) => ({
    preferredGoal: 'endurance',
    targetDurationMinutes: 60,    // → ~25 km target
    climbFlagged: false,
    recentlyUsedIds: new Set(),
    ...overrides,
  });

  it('+10 when training_goal matches', () => {
    const route = { id: 'r1', distance_km: 25, training_goal: 'endurance' };
    const result = scoreRoute(route, ctx());
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.reasons).toContain('matches endurance goal');
  });

  it('does not add goal bonus when goal differs', () => {
    const route = { id: 'r1', distance_km: 25, training_goal: 'intervals' };
    const result = scoreRoute(route, ctx());
    expect(result.score).toBeLessThan(10);
  });

  it('awards distance proximity up to +5', () => {
    const route = { id: 'r1', distance_km: 25, training_goal: 'intervals' }; // no goal match
    const result = scoreRoute(route, ctx({ preferredGoal: 'endurance' }));
    expect(result.score).toBeGreaterThan(0); // small proximity
    expect(result.score).toBeLessThan(6);
  });

  it('+1 recency boost when route used in last 30 days', () => {
    const route = { id: 'r-recent', distance_km: 100, training_goal: null };
    const baseline = scoreRoute(route, ctx({ recentlyUsedIds: new Set() }));
    const boosted = scoreRoute(route, ctx({ recentlyUsedIds: new Set(['r-recent']) }));
    expect(boosted.score - baseline.score).toBeCloseTo(1);
  });

  it('hills route wins for climb-flagged workout', () => {
    const route = { id: 'r1', distance_km: 25, training_goal: 'hills' };
    const result = scoreRoute(route, ctx({ climbFlagged: true, preferredGoal: null }));
    expect(result.score).toBeGreaterThanOrEqual(10);
  });
});

describe('rankRoutes', () => {
  const routes = [
    { id: 'a', name: 'A', distance_km: 25, training_goal: 'endurance' },
    { id: 'b', name: 'B', distance_km: 80, training_goal: 'endurance' },
    { id: 'c', name: 'C', distance_km: 30, training_goal: 'intervals' },
    { id: 'd', name: 'D', distance_km: 5, training_goal: 'recovery' },
  ];

  it('returns top 3 by score', () => {
    const ranked = rankRoutes(routes, { workout_type: 'endurance', target_duration: 60 }, new Set(), 3);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].route.id).toBe('a'); // best match: goal + distance
  });

  it('honors custom limit', () => {
    const ranked = rankRoutes(routes, { workout_type: 'endurance', target_duration: 60 }, new Set(), 1);
    expect(ranked).toHaveLength(1);
  });

  it('does not crash on missing workout', () => {
    const ranked = rankRoutes(routes, null, new Set(), 3);
    expect(ranked).toHaveLength(3);
  });
});
