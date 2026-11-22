import { describe, it, expect } from 'vitest';
import { plannedLoadFor, prescriptionStructureLoad, libraryLoad, TYPE_RSS_PER_HOUR, loadTypeFor } from './plannedLoad.js';
import { WORKOUT_LIBRARY } from '../../src/data/workoutLibrary';
import { structureLoad, fitStructureToDuration } from '../../src/lib/training/plannedWorkoutShape';
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
    // The 2026-11-20 easy run: 40 min planned → its library load of 40, not the coach's 50.
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', workout_id: 'run_easy_aerobic', target_duration_min: 40 })).toBe(40);
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', sport: 'running', target_duration_min: 90 })).toBe(83);
    // ...and cycling rates for the same type on a ride
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', sport: 'cycling', target_duration_min: 90 })).toBe(72);
  });

  it('prices time past a typical session length as endurance riding', () => {
    // 90 min at threshold = 127.5, then 210 min at the endurance rate = 168.
    expect(plannedLoadFor({ type: 'workout', workout_type: 'intervals', target_duration_min: 300 })).toBe(296);
    // Endurance is unaffected by the cap.
    expect(plannedLoadFor({ type: 'workout', workout_type: 'endurance', target_duration_min: 240 })).toBe(192);
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

describe('library workouts are scored from their structure', () => {
  const cycling = Object.values(WORKOUT_LIBRARY).filter((w) => w.structure && w.targetTSS > 0);

  it('knows every structured cycling workout in the app library', () => {
    const missing = cycling.filter((w) => libraryLoad(w.id) == null).map((w) => w.id);
    expect(missing).toEqual([]);
  });

  it('gives the app library load at the library length', () => {
    const drift = cycling
      .filter((w) => libraryLoad(w.id, w.duration) !== w.targetTSS)
      .map((w) => `${w.id}: ${libraryLoad(w.id, w.duration)} vs ${w.targetTSS}`);
    expect(drift).toEqual([]);
  });

  it('stays near the calendar\'s fitted structure on shorter and longer days', () => {
    const far = [];
    for (const w of cycling) {
      for (const f of [0.75, 1.5, 2]) {
        const minutes = Math.round(w.duration * f);
        const drawn = structureLoad(fitStructureToDuration(w.structure, minutes));
        const server = libraryLoad(w.id, minutes);
        if (Math.abs(server - drawn) / drawn > 0.25) far.push(`${w.id} @${minutes}: ${server} vs ${drawn}`);
      }
    }
    expect(far).toEqual([]);
  });

  it('prices a 75-minute 4×8 VO2 day from its intervals, not as 75 minutes of VO2', () => {
    const entry = { type: 'workout', workout_type: 'vo2max', workout_id: 'four_by_eight_vo2', target_duration_min: 75, target_load: 105 };
    expect(plannedLoadFor(entry)).toBe(88);
    // The type table alone would say 131.
    expect(plannedLoadFor({ ...entry, workout_id: null })).toBe(131);
  });

  it('keeps a lengthened recovery spin a recovery spin', () => {
    // 30 min = 10; an hour of it is ~20, not 10 + 30 min of Z2.
    expect(libraryLoad('recovery_spin', 60)).toBeLessThan(25);
  });

  it('uses the library length when the row has none', () => {
    expect(plannedLoadFor({ type: 'workout', workout_type: 'vo2max', workout_id: 'four_by_eight_vo2' })).toBe(88);
  });

  it('still gives strength from the library no load', () => {
    expect(plannedLoadFor({ type: 'workout', workout_type: 'strength', workout_id: 'full_body_strength', target_duration_min: 60 })).toBeNull();
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
