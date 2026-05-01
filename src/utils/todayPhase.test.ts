import { describe, it, expect } from 'vitest';
import { computePhasePosition } from './todayPhase';
import type { TrainingPlanTemplate } from '../types/training';

const fixture: TrainingPlanTemplate = {
  id: 'test',
  name: 'Test plan',
  description: '',
  duration: 8,
  methodology: 'polarized',
  goal: 'general_fitness',
  fitnessLevel: 'intermediate',
  category: 'foundation',
  hoursPerWeek: { min: 6, max: 10 },
  weeklyTSS: { min: 300, max: 500 },
  phases: [
    { weeks: [1, 2, 3], phase: 'base', focus: '' },
    { weeks: [4], phase: 'recovery', focus: '' },
    { weeks: [5, 6, 7], phase: 'build', focus: '' },
    { weeks: [8], phase: 'taper', focus: '' },
  ],
  weekTemplates: {},
  expectedGains: {},
  targetAudience: '',
};

describe('computePhasePosition', () => {
  it('returns null for missing template', () => {
    expect(computePhasePosition(null, 1)).toBeNull();
    expect(computePhasePosition(undefined, 1)).toBeNull();
  });

  it('returns null for missing currentWeek', () => {
    expect(computePhasePosition(fixture, null)).toBeNull();
    expect(computePhasePosition(fixture, undefined)).toBeNull();
  });

  it('week 1 → base, weekInPhase=1, weeksInPhase=3, remaining=2', () => {
    const pos = computePhasePosition(fixture, 1)!;
    expect(pos.phase).toBe('base');
    expect(pos.weekInPhase).toBe(1);
    expect(pos.weeksInPhase).toBe(3);
    expect(pos.weeksRemaining).toBe(2);
  });

  it('week 2 → base, weekInPhase=2, remaining=1', () => {
    const pos = computePhasePosition(fixture, 2)!;
    expect(pos.weekInPhase).toBe(2);
    expect(pos.weeksRemaining).toBe(1);
  });

  it('week 4 → recovery, weeksInPhase=1, remaining=0', () => {
    const pos = computePhasePosition(fixture, 4)!;
    expect(pos.phase).toBe('recovery');
    expect(pos.weeksInPhase).toBe(1);
    expect(pos.weeksRemaining).toBe(0);
  });

  it('week 8 → taper', () => {
    const pos = computePhasePosition(fixture, 8)!;
    expect(pos.phase).toBe('taper');
    expect(pos.weekInPhase).toBe(1);
  });

  it('week outside any phase returns null', () => {
    expect(computePhasePosition(fixture, 99)).toBeNull();
  });
});
