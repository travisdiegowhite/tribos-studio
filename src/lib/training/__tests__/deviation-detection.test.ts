import { describe, it, expect } from 'vitest';
import { analyzeDeviation } from '../deviation-detection';
import { DEFAULT_CALIBRATION } from '../constants';
import type {
  ActivityData,
  CalibrationFactors,
  DailyLoad,
  ProjectionState,
  PlannedWorkoutRef,
} from '../types';

const defaultCal: CalibrationFactors = { ...DEFAULT_CALIBRATION };

const currentState: ProjectionState = { ctl: 50, atl: 50, tsb: 0 };

const planned: PlannedWorkoutRef = {
  date: '2026-03-23',
  tss: 40,
  type: 'endurance',
  is_quality: false,
  label: 'Easy ride',
};

const upcomingSchedule: DailyLoad[] = [
  { date: '2026-03-23', tss: 40, is_quality: false },
  { date: '2026-03-24', tss: 35, is_quality: false },
  { date: '2026-03-25', tss: 90, is_quality: true },
  { date: '2026-03-26', tss: 35, is_quality: false },
  { date: '2026-03-27', tss: 40, is_quality: false },
];

describe('analyzeDeviation', () => {
  it('returns no deviation for activity within thresholds', () => {
    const activity: ActivityData = {
      duration_seconds: 3600,
      normalized_power: 160,
      ftp: 250,
      workout_type: 'endurance',
    };
    // This gives a low TSS (~40) matching the plan
    const result = analyzeDeviation(activity, planned, currentState, upcomingSchedule, defaultCal);
    expect(result.has_deviation).toBe(false);
  });

  it('detects deviation for significantly higher TSS', () => {
    const activity: ActivityData = {
      duration_seconds: 3600,
      normalized_power: 230,
      ftp: 250,
      workout_type: 'tempo',
    };
    // NP=230, FTP=250, IF=0.92, TSS ≈ 84.6 — delta of ~45 over planned 40
    const result = analyzeDeviation(activity, planned, currentState, upcomingSchedule, defaultCal);
    expect(result.has_deviation).toBe(true);
    expect(result.severity_score).toBeGreaterThan(0);
    expect(result.tss_estimate).toBeDefined();
    expect(result.tss_estimate!.source).toBe('power');
  });

  it('includes adjustment options when quality session exists', () => {
    const activity: ActivityData = {
      duration_seconds: 3600,
      normalized_power: 240,
      ftp: 250,
      workout_type: 'threshold',
    };
    const result = analyzeDeviation(activity, planned, currentState, upcomingSchedule, defaultCal);

    expect(result.has_deviation).toBe(true);
    expect(result.adjustment_options).toBeDefined();
    expect(result.adjustment_options!.planned).toBeDefined();
    expect(result.impact).toBeDefined();
  });

  it('returns deviation without options when no quality session upcoming', () => {
    const noQualitySchedule: DailyLoad[] = [
      { date: '2026-03-23', tss: 40, is_quality: false },
      { date: '2026-03-24', tss: 35, is_quality: false },
      { date: '2026-03-25', tss: 40, is_quality: false },
    ];
    const activity: ActivityData = {
      duration_seconds: 3600,
      normalized_power: 240,
      ftp: 250,
    };
    const result = analyzeDeviation(activity, planned, currentState, noQualitySchedule, defaultCal);

    expect(result.has_deviation).toBe(true);
    expect(result.adjustment_options).toBeUndefined();
    expect(result.impact).toBeUndefined();
  });

  it('classifies type_substitution for different workout type', () => {
    const activity: ActivityData = {
      duration_seconds: 3600,
      normalized_power: 230,
      ftp: 250,
      workout_type: 'threshold', // planned was endurance
    };
    const result = analyzeDeviation(activity, planned, currentState, upcomingSchedule, defaultCal);

    if (result.has_deviation) {
      expect(result.deviation_type).toBe('type_substitution');
    }
  });

  it('severity_score is bounded 0–10', () => {
    // Very large deviation
    const activity: ActivityData = {
      duration_seconds: 7200,
      normalized_power: 260,
      ftp: 250,
    };
    const result = analyzeDeviation(activity, planned, currentState, upcomingSchedule, defaultCal);

    if (result.has_deviation && result.severity_score !== undefined) {
      expect(result.severity_score).toBeGreaterThanOrEqual(0);
      expect(result.severity_score).toBeLessThanOrEqual(10);
    }
  });
});
