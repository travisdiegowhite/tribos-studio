import { describe, it, expect } from 'vitest';
import { plannedLoadFor, prescriptionStructureLoad, TYPE_RSS_PER_HOUR, loadTypeFor } from './plannedLoad.js';
import { TYPE_TSS_PER_HOUR } from '../../src/lib/training/constants';

describe('TYPE_RSS_PER_HOUR mirrors src/lib/training/constants.ts', () => {
  it('matches the mid column for every type', () => {
    const browser = Object.fromEntries(Object.entries(TYPE_TSS_PER_HOUR).map(([k, v]) => [k, v.mid]));
    expect(TYPE_RSS_PER_HOUR).toEqual(browser);
  });
});

describe('plannedLoadFor', () => {
  it('uses the designer prediction when the row carries one (the Nov 20 sweet spot)', () => {
    // The coach asked for 90; the designer's 3×12 at 82–86% predicted 55.
    const entry = {
      type: 'workout',
      workout_type: 'sweet_spot',
      target_duration_min: 60,
      target_load: 90,
      details: { prescription: { source: 'designer', predicted_load: 55, intervals: [] } },
    };
    expect(plannedLoadFor(entry)).toBe(55);
  });

  it('scores an undesigned session from duration × the type rate', () => {
    expect(plannedLoadFor({ type: 'workout', workout_type: 'sweet_spot', target_duration_min: 60 })).toBe(76);
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', target_duration_min: 180 })).toBe(144);
  });

  it('uses run rates for a run', () => {
    // The 2026-11-20 easy run: 40 min planned → 37, not the coach's 50.
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', workout_id: 'run_easy_aerobic', target_duration_min: 40 })).toBe(37);
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', sport: 'running', target_duration_min: 90 })).toBe(83);
    // ...and cycling rates for the same type on a ride
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', sport: 'cycling', target_duration_min: 90 })).toBe(72);
  });

  it('ignores whatever target_load the row was given', () => {
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', target_duration_min: 60, target_load: 200 })).toBe(48);
  });

  it('gives strength, core, mobility and yoga no planned load', () => {
    for (const workout_type of ['strength', 'core', 'flexibility', 'mobility', 'yoga']) {
      expect(plannedLoadFor({ type: 'workout', workout_type, target_duration_min: 30 })).toBeNull();
    }
    expect(plannedLoadFor({ type: 'workout', workout_id: 'core_stability', target_duration_min: 30 })).toBeNull();
  });

  it('rest is zero, a note is nothing', () => {
    expect(plannedLoadFor({ type: 'rest' })).toBe(0);
    expect(plannedLoadFor({ type: 'note' })).toBeNull();
  });

  it('keeps a race load as given (no duration to plan from)', () => {
    expect(plannedLoadFor({ type: 'race', workout_type: 'road_race', target_load: 180 })).toBe(180);
    expect(plannedLoadFor({ type: 'race', workout_type: 'road_race' })).toBeNull();
  });

  it('falls back to the structure when the prediction is stale', () => {
    const entry = {
      type: 'workout',
      workout_type: 'threshold',
      target_duration_min: 60,
      details: {
        prescription: {
          predicted_load: 70,
          intervals: [{ repeats: 2, duration_min: 20, target_pct_ftp_min: 95, target_pct_ftp_max: 105, recovery_min: 5 }],
        },
      },
    };
    expect(plannedLoadFor(entry)).toBe(70);
    // 40 min at 100% = 66.7, 5 min at 50% = 2.1, 15 min filler at 65% = 10.6 → 79
    expect(plannedLoadFor(entry, { trustPrediction: false })).toBe(79);
  });

  it('keeps the given number only when there is no length or structure to derive one from', () => {
    expect(plannedLoadFor({ type: 'workout', workout_type: 'tempo' })).toBeNull();
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', target_load: 55 })).toBe(55);
  });

  it('resolves production aliases and unknown types', () => {
    expect(loadTypeFor('racing')).toBe('race');
    expect(loadTypeFor('openers')).toBe('tempo');
    expect(loadTypeFor('intervals')).toBe('threshold');
    expect(loadTypeFor('something_new')).toBe('endurance');
    expect(loadTypeFor(null)).toBe('endurance');
  });
});

describe('prescriptionStructureLoad', () => {
  it('scores the coach\'s own %FTP sets with recoveries and filler', () => {
    const p = {
      intervals: [{ repeats: 3, duration_min: 12, target_pct_ftp_min: 82, target_pct_ftp_max: 86, recovery_min: 4 }],
    };
    // 36 min @ 84% = 42.3; 8 min @ 50% = 3.3; 16 min @ 65% = 11.3 → 57
    expect(prescriptionStructureLoad(p, 60)).toBe(57);
  });

  it('scores a run\'s threshold-pace band as threshold/pace intensity', () => {
    const p = {
      intervals: [{ repeats: 1, duration_min: 30, target_pct_threshold_pace_min: 100, target_pct_threshold_pace_max: 100, recovery_min: 0 }],
    };
    expect(prescriptionStructureLoad(p, 30)).toBe(50);
  });

  it('handles sets of sets', () => {
    const p = {
      intervals: [{ repeats: 2, sets: 2, set_recovery_min: 10, duration_min: 5, target_pct_ftp_min: 110, target_pct_ftp_max: 110, recovery_min: 5 }],
    };
    // work 20 min @110 = 40.3; recoveries 2×5 + 10 = 20 min @50 = 8.3 → 49 (no filler)
    expect(prescriptionStructureLoad(p)).toBe(49);
  });

  it('is null with no usable band', () => {
    expect(prescriptionStructureLoad({ intervals: [{ repeats: 3, duration_min: 5 }] }, 60)).toBeNull();
    expect(prescriptionStructureLoad(null, 60)).toBeNull();
  });
});
