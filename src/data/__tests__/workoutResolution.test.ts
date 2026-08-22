import { describe, expect, it } from 'vitest';
import {
  inferWorkoutForType,
  resolvePlannedWorkout,
  workoutCategoryForPlanType,
} from '../workoutResolution';

describe('workoutCategoryForPlanType', () => {
  it('maps plan workout types onto library categories', () => {
    expect(workoutCategoryForPlanType('vo2max')).toBe('vo2max');
    expect(workoutCategoryForPlanType('long_ride')).toBe('endurance');
    expect(workoutCategoryForPlanType('hill_repeats')).toBe('climbing');
    expect(workoutCategoryForPlanType('intervals')).toBe('threshold');
  });

  it('maps the arc sequencer session vocabulary too', () => {
    expect(workoutCategoryForPlanType('z2')).toBe('endurance');
    expect(workoutCategoryForPlanType('vo2')).toBe('vo2max');
    expect(workoutCategoryForPlanType('race_sim')).toBe('racing');
  });

  it('has nothing to paint for rest days or unknown types', () => {
    expect(workoutCategoryForPlanType('rest')).toBeNull();
    expect(workoutCategoryForPlanType('kitesurfing')).toBeNull();
    expect(workoutCategoryForPlanType(null)).toBeNull();
  });
});

describe('inferWorkoutForType', () => {
  it('matches a 75min VO2 day to the library 4x8', () => {
    // The exact case from the arc: workout_type 'vo2max', 75 minutes.
    expect(inferWorkoutForType('vo2max', 75)?.id).toBe('four_by_eight_vo2');
  });

  it('picks a shorter VO2 session for a shorter day', () => {
    expect(inferWorkoutForType('vo2max', 55)?.id).toBe('forty_twenty_intervals');
  });

  it('always returns something paintable', () => {
    const workout = inferWorkoutForType('threshold', 70);
    expect(workout?.structure).toBeTruthy();
    expect(workout?.category).toBe('threshold');
  });

  it('falls back to the type default when the row gives no duration', () => {
    // WORKOUT_TYPES.recovery.defaultDuration is 30min.
    expect(inferWorkoutForType('recovery', null)?.id).toBe('recovery_spin');
    expect(inferWorkoutForType('recovery', 0)?.id).toBe('recovery_spin');
  });

  it('returns null for rest days', () => {
    expect(inferWorkoutForType('rest', 0)).toBeNull();
  });
});

describe('resolvePlannedWorkout', () => {
  it('prefers the workout the plan actually named', () => {
    const resolved = resolvePlannedWorkout({
      workout_id: 'recovery_spin',
      workout_type: 'vo2max',
      target_duration: 75,
    });
    expect(resolved).toEqual({
      workout: expect.objectContaining({ id: 'recovery_spin' }),
      inferred: false,
    });
  });

  it('infers a shape for an arc row that names no library workout', () => {
    const resolved = resolvePlannedWorkout({
      workout_id: null,
      workout_type: 'vo2max',
      target_duration: 75,
      duration_minutes: 75,
    });
    expect(resolved?.workout.id).toBe('four_by_eight_vo2');
    expect(resolved?.inferred).toBe(true);
  });

  it('falls back to duration_minutes when target_duration is absent', () => {
    const resolved = resolvePlannedWorkout({
      workout_type: 'vo2max',
      duration_minutes: 55,
    });
    expect(resolved?.workout.id).toBe('forty_twenty_intervals');
  });

  it('reads the arc session_type when workout_type says nothing useful', () => {
    const resolved = resolvePlannedWorkout({
      workout_type: null,
      session_type: 'vo2',
      target_duration: 75,
    });
    expect(resolved?.workout.id).toBe('four_by_eight_vo2');
    expect(resolved?.inferred).toBe(true);
  });

  it('resolves an unresolvable id by type rather than giving up', () => {
    // The Today Spine used to deep-link a plan row uuid as the workout id.
    const resolved = resolvePlannedWorkout({
      workout_id: '3f9c8b1e-0000-4000-8000-000000000000',
      workout_type: 'vo2max',
      target_duration: 75,
    });
    expect(resolved?.workout.id).toBe('four_by_eight_vo2');
    expect(resolved?.inferred).toBe(true);
  });

  it('has nothing for a rest day', () => {
    expect(resolvePlannedWorkout({ workout_type: 'rest', duration_minutes: 0 })).toBeNull();
    expect(resolvePlannedWorkout(null)).toBeNull();
  });
});

// The end-to-end shape the route builder actually paints: a 75-minute
// `vo2max` arc row, scaled onto a route, must come out as four hard blocks.
describe('the reported case: a 75min VO2 day on a 55km route', () => {
  it('paints four VO2 work blocks plus warmup and cooldown', async () => {
    const { generateCuesFromWorkoutStructure } = await import('../../utils/intervalCues.js');
    const resolved = resolvePlannedWorkout({
      workout_id: null,
      workout_type: 'vo2max',
      target_duration: 75,
      duration_minutes: 75,
    });

    // A straight 55km route sampled every ~1km (lat degree ≈ 111km).
    const coordinates = Array.from({ length: 56 }, (_, i) => [-105.27, 40.0 + i / 111]);
    const cues = generateCuesFromWorkoutStructure(
      { coordinates, distance: 55 },
      resolved!.workout,
    ) as Array<{ zone: number | null; startDistance: number; endDistance: number }>;

    expect(cues.length).toBeGreaterThan(0);
    expect(cues.filter((c) => c.zone === 5)).toHaveLength(4);
    // Zone 2 warmup first, zone 1 cooldown last, and full route coverage.
    expect(cues[0].zone).toBe(2);
    expect(cues[cues.length - 1].zone).toBe(1);
    expect(cues[0].startDistance).toBe(0);
    expect(cues[cues.length - 1].endDistance).toBeCloseTo(55, 0);
  });
});
