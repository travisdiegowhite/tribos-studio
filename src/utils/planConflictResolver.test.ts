import { describe, it, expect } from 'vitest';
import {
  isKeyWorkout,
  resolveConflicts,
  analyzeWeeklyLoad,
  getTSBRecommendation,
} from './planConflictResolver';
import type { PlannedWorkoutDB } from '../types/training';

// Helper to create a mock planned workout
function mockWorkout(overrides: Partial<PlannedWorkoutDB> = {}): PlannedWorkoutDB {
  return {
    id: 'w-' + Math.random().toString(36).slice(2),
    plan_id: 'plan-1',
    week_number: 1,
    day_of_week: 1,
    scheduled_date: '2026-04-01',
    workout_type: 'endurance',
    workout_id: 'easy_ride',
    target_tss: 50,
    target_duration: 60,
    target_distance_km: null,
    completed: false,
    completed_at: null,
    activity_id: null,
    actual_tss: null,
    actual_duration: null,
    actual_distance_km: null,
    difficulty_rating: null,
    notes: null,
    skipped_reason: null,
    ...overrides,
  } as PlannedWorkoutDB;
}

describe('planConflictResolver', () => {
  describe('isKeyWorkout', () => {
    it('identifies threshold workouts as key', () => {
      expect(isKeyWorkout(mockWorkout({ workout_type: 'threshold', target_tss: 60 }))).toBe(true);
    });

    it('identifies VO2max workouts as key', () => {
      expect(isKeyWorkout(mockWorkout({ workout_type: 'vo2max', target_tss: 70 }))).toBe(true);
    });

    it('identifies high-TSS workouts as key', () => {
      expect(isKeyWorkout(mockWorkout({ workout_type: 'endurance', target_tss: 90 }))).toBe(true);
    });

    it('does not flag recovery as key', () => {
      expect(isKeyWorkout(mockWorkout({ workout_type: 'recovery', target_tss: 20 }))).toBe(false);
    });

    it('does not flag low-intensity endurance as key', () => {
      expect(isKeyWorkout(mockWorkout({ workout_type: 'endurance', target_tss: 40 }))).toBe(false);
    });
  });

  describe('resolveConflicts', () => {
    it('returns empty report when no overlapping dates', () => {
      const primary = [mockWorkout({ scheduled_date: '2026-04-01' })];
      const secondary = [mockWorkout({ scheduled_date: '2026-04-02', plan_id: 'plan-2' })];

      const report = resolveConflicts(primary, secondary, 'cycling', 'running', null);
      expect(report.totalConflicts).toBe(0);
    });

    it('keeps both when both are easy', () => {
      const primary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'recovery', target_tss: 20 })];
      const secondary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'endurance', target_tss: 40, plan_id: 'plan-2' })];

      const report = resolveConflicts(primary, secondary, 'cycling', 'running', null);
      expect(report.totalConflicts).toBe(1);
      expect(report.conflicts[0].action).toBe('keep_both');
    });

    it('moves secondary when both are key', () => {
      const primary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'threshold', target_tss: 85 })];
      const secondary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'vo2max', target_tss: 90, plan_id: 'plan-2' })];

      const report = resolveConflicts(primary, secondary, 'cycling', 'running', null);
      expect(report.totalConflicts).toBe(1);
      // Should try to move or downgrade
      expect(['move_secondary', 'downgrade_secondary']).toContain(report.conflicts[0].action);
    });

    it('skips secondary in deep fatigue', () => {
      const primary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'threshold', target_tss: 85 })];
      const secondary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'threshold', target_tss: 85, plan_id: 'plan-2' })];

      const report = resolveConflicts(
        primary, secondary, 'cycling', 'running',
        { ctl: 50, atl: 90, tsb: -40 } // Deep fatigue
      );
      expect(report.conflicts[0].action).toBe('skip_secondary');
    });

    it('keeps primary key + secondary easy when TSS is manageable', () => {
      const primary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'threshold', target_tss: 85 })];
      const secondary = [mockWorkout({ scheduled_date: '2026-04-01', workout_type: 'recovery', target_tss: 20, plan_id: 'plan-2' })];

      const report = resolveConflicts(primary, secondary, 'cycling', 'running', null);
      expect(report.conflicts[0].action).toBe('keep_both');
    });
  });

  describe('analyzeWeeklyLoad', () => {
    it('detects overloaded weeks', () => {
      const workouts = [
        mockWorkout({ scheduled_date: '2026-03-30', target_tss: 200 }),
        mockWorkout({ scheduled_date: '2026-03-31', target_tss: 200 }),
        mockWorkout({ scheduled_date: '2026-04-01', target_tss: 200 }),
      ];

      const analysis = analyzeWeeklyLoad(workouts, { ctl: 40, atl: 50, tsb: -10 });
      // CTL * 1.1 = 44, combined = 600, so definitely overloaded
      expect(analysis.some(a => a.isOverloaded)).toBe(true);
    });

    it('reports OK for manageable load', () => {
      const workouts = [
        mockWorkout({ scheduled_date: '2026-03-30', target_tss: 30 }),
        mockWorkout({ scheduled_date: '2026-04-01', target_tss: 30 }),
      ];

      const analysis = analyzeWeeklyLoad(workouts, { ctl: 100, atl: 90, tsb: 10 });
      // CTL * 1.1 = 110, combined = 60, well under
      expect(analysis.every(a => !a.isOverloaded)).toBe(true);
    });
  });

  describe('getTSBRecommendation', () => {
    it('recommends skipping secondary workouts in deep fatigue', () => {
      const rec = getTSBRecommendation(-35);
      expect(rec.level).toBe('deep_fatigue');
      expect(rec.secondaryPlanGuidance).toContain('Skip');
    });

    it('recommends full intensity when fresh', () => {
      const rec = getTSBRecommendation(10);
      expect(rec.level).toBe('fresh');
      expect(rec.secondaryPlanGuidance).toContain('full intensity');
    });
  });
});
