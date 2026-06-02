import { describe, it, expect } from 'vitest';
import { getAnyWorkoutById, getCyclingWorkouts, getRunningWorkouts } from '../workoutLookup';

describe('workoutLookup', () => {
  it('resolves a cycling workout id', () => {
    const w = getAnyWorkoutById('recovery_spin');
    expect(w?.id).toBe('recovery_spin');
    expect(w?.sportType).not.toBe('running');
  });

  it('resolves a running workout id', () => {
    const w = getAnyWorkoutById('run_recovery_jog');
    expect(w?.id).toBe('run_recovery_jog');
    expect(w?.sportType).toBe('running');
  });

  it('returns null for unknown or empty ids', () => {
    expect(getAnyWorkoutById('does_not_exist')).toBeNull();
    expect(getAnyWorkoutById(null)).toBeNull();
    expect(getAnyWorkoutById(undefined)).toBeNull();
  });

  it('enumerates both libraries (cycling and running)', () => {
    expect(getCyclingWorkouts().length).toBeGreaterThan(0);
    expect(getRunningWorkouts().length).toBeGreaterThan(0);
    expect(getRunningWorkouts().every((w) => w.sportType === 'running')).toBe(true);
  });
});
