import { describe, it, expect } from 'vitest';
import {
  buildLibraryWorkoutRow,
  computeWeekNumber,
  type LibraryWorkoutLike,
} from '../plannedWorkoutFromLibrary';

const workout: LibraryWorkoutLike = {
  category: 'threshold',
  name: 'Sweet Spot 3x12',
  duration: 75,
  targetTSS: 85,
};

describe('computeWeekNumber', () => {
  it('returns week 1 for the plan start date', () => {
    const start = new Date(2026, 5, 1); // Mon Jun 1 2026
    expect(computeWeekNumber(start, new Date(2026, 5, 1))).toBe(1);
  });

  it('returns week 1 for any day in the first 7 days', () => {
    const start = new Date(2026, 5, 1);
    expect(computeWeekNumber(start, new Date(2026, 5, 7))).toBe(1);
  });

  it('rolls to week 2 on day 8', () => {
    const start = new Date(2026, 5, 1);
    expect(computeWeekNumber(start, new Date(2026, 5, 8))).toBe(2);
  });

  it('is robust to time-of-day on either date', () => {
    const start = new Date(2026, 5, 1, 23, 30);
    const target = new Date(2026, 5, 8, 6, 15);
    expect(computeWeekNumber(start, target)).toBe(2);
  });
});

describe('buildLibraryWorkoutRow', () => {
  it('dual-writes target_rss AND target_tss', () => {
    const row = buildLibraryWorkoutRow({
      workout,
      workoutId: 'sweet_spot_3x12',
      planId: 'plan-1',
      userId: 'user-1',
      planStartDate: new Date(2026, 5, 1),
      targetDate: new Date(2026, 5, 10),
    });
    expect(row.target_rss).toBe(85);
    expect(row.target_tss).toBe(85);
  });

  it('computes the correct week_number and day_of_week', () => {
    const row = buildLibraryWorkoutRow({
      workout,
      workoutId: 'sweet_spot_3x12',
      planId: 'plan-1',
      userId: 'user-1',
      planStartDate: new Date(2026, 5, 1), // Mon Jun 1
      targetDate: new Date(2026, 5, 10), // Wed Jun 10 → week 2
    });
    expect(row.week_number).toBe(2);
    expect(row.day_of_week).toBe(3); // Wednesday
    expect(row.scheduled_date).toBe('2026-06-10');
  });

  it('carries plan/user ids, workout id, type and durations', () => {
    const row = buildLibraryWorkoutRow({
      workout,
      workoutId: 'sweet_spot_3x12',
      planId: 'plan-1',
      userId: 'user-1',
      planStartDate: new Date(2026, 5, 1),
      targetDate: new Date(2026, 5, 10),
    });
    expect(row.plan_id).toBe('plan-1');
    expect(row.user_id).toBe('user-1');
    expect(row.workout_id).toBe('sweet_spot_3x12');
    expect(row.workout_type).toBe('threshold');
    expect(row.name).toBe('Sweet Spot 3x12');
    expect(row.duration_minutes).toBe(75);
    expect(row.target_duration).toBe(75);
    expect(row.completed).toBe(false);
  });

  it('falls back to a generated name and zero metrics when fields are missing', () => {
    const row = buildLibraryWorkoutRow({
      workout: { category: 'endurance' },
      workoutId: 'easy_ride',
      planId: 'plan-1',
      userId: 'user-1',
      planStartDate: new Date(2026, 5, 1),
      targetDate: new Date(2026, 5, 2),
    });
    expect(row.name).toBe('endurance Workout');
    expect(row.target_rss).toBe(0);
    expect(row.target_tss).toBe(0);
    expect(row.duration_minutes).toBe(0);
  });
});
