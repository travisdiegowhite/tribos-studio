import { describe, it, expect } from 'vitest';
import { isQualityWorkout } from './qualitySession.js';

describe('isQualityWorkout', () => {
  it('treats hard sessions as quality', () => {
    for (const t of ['threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'intervals', 'sprint', 'race', 'racing', 'race_sim']) {
      expect(isQualityWorkout({ workout_type: t })).toBe(true);
    }
  });

  it('does not treat easy sessions as quality', () => {
    for (const t of ['endurance', 'recovery', 'rest', 'tempo']) {
      expect(isQualityWorkout({ workout_type: t })).toBe(false);
    }
  });

  it('excludes tempo, matching the Today spine HARD_TYPES set', () => {
    // buildBeats.ts:55 deliberately omits tempo; the two must not diverge or a
    // session styled "planned-hard" would not be the one the coach protects.
    expect(isQualityWorkout({ workout_type: 'tempo' })).toBe(false);
  });

  it('falls back to session_type when workout_type is absent', () => {
    expect(isQualityWorkout({ session_type: 'vo2max' })).toBe(true);
    expect(isQualityWorkout({ session_type: 'recovery' })).toBe(false);
  });

  it('prefers workout_type over session_type', () => {
    expect(isQualityWorkout({ workout_type: 'recovery', session_type: 'vo2max' })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isQualityWorkout({ workout_type: 'VO2Max' })).toBe(true);
  });

  it('never throws on missing or malformed input', () => {
    expect(isQualityWorkout(null)).toBe(false);
    expect(isQualityWorkout(undefined)).toBe(false);
    expect(isQualityWorkout({})).toBe(false);
    expect(isQualityWorkout({ workout_type: null })).toBe(false);
  });

  it('ignores the never-populated is_quality column entirely', () => {
    // migration 058 added is_quality NOT NULL DEFAULT false and nothing ever
    // wrote it, so every production row says false. Deriving must override it.
    expect(isQualityWorkout({ workout_type: 'threshold', is_quality: false })).toBe(true);
  });
});
