/**
 * normalizeWorkoutParse — the gate between what the model proposes and what
 * gets stored.
 *
 * A half-built structure would produce confidently wrong routing implications
 * downstream (`deriveRoutingImplications` reads the main set to decide whether
 * the route needs a sustained uninterrupted stretch), so anything unusable is
 * rejected rather than partially trusted.
 */
import { describe, it, expect } from 'vitest';
import {
  WORKOUT_PARSE_TOOLS,
  normalizeWorkoutParse,
} from './workoutParseTool.js';

const MAIN = [
  { type: 'repeat', sets: 4, work: { duration: 8, zone: 4 }, rest: { duration: 5, zone: 1 } },
];

const VALID = {
  name: '4x8 Threshold',
  category: 'threshold',
  terrainType: 'flat',
  structure: { warmup: { duration: 15, zone: 2 }, main: MAIN, cooldown: { duration: 10, zone: 1 } },
};

describe('the tool schema', () => {
  it('exposes exactly one tool the model can fill in', () => {
    expect(WORKOUT_PARSE_TOOLS).toHaveLength(1);
    expect(WORKOUT_PARSE_TOOLS[0].name).toBe('record_workout');
    expect(WORKOUT_PARSE_TOOLS[0].input_schema.required).toContain('terrainType');
  });
});

describe('normalizeWorkoutParse', () => {
  it('accepts a well-formed interval session', () => {
    const r = normalizeWorkoutParse(VALID);
    expect(r.ok).toBe(true);
    expect(r.workout.structure.main[0].sets).toBe(4);
    expect(r.workout.structure.main[0].work.duration).toBe(8);
    expect(r.workout.terrainType).toBe('flat');
  });

  it('accepts a plain steady block as the main set', () => {
    const r = normalizeWorkoutParse({
      ...VALID,
      structure: { main: [{ duration: 60, zone: 2 }] },
    });
    expect(r.ok).toBe(true);
    expect(r.workout.structure.main[0].duration).toBe(60);
    expect(r.workout.structure.warmup).toBeNull();
  });

  it('refuses a description with no readable main set', () => {
    expect(normalizeWorkoutParse({ ...VALID, structure: { main: [] } }).ok).toBe(false);
    expect(normalizeWorkoutParse({ ...VALID, structure: {} }).ok).toBe(false);
    expect(normalizeWorkoutParse({ ...VALID, structure: { main: [{}] } }).ok).toBe(false);
  });

  it('refuses an unnamed workout', () => {
    expect(normalizeWorkoutParse({ ...VALID, name: '   ' }).ok).toBe(false);
  });

  it('refuses non-object input', () => {
    expect(normalizeWorkoutParse(null).ok).toBe(false);
    expect(normalizeWorkoutParse('4x8').ok).toBe(false);
  });

  it('falls back rather than trusting an unknown category or terrain', () => {
    const r = normalizeWorkoutParse({ ...VALID, category: 'sufferfest', terrainType: 'alpine' });
    expect(r.workout.category).toBe('endurance');
    expect(r.workout.terrainType).toBe('rolling');
  });

  it('keeps sub-minute efforts, which coach shorthand is full of', () => {
    const r = normalizeWorkoutParse({
      ...VALID,
      structure: {
        main: [
          { type: 'repeat', sets: 10, work: { duration: 0.5, zone: 6 }, rest: { duration: 0.5 } },
        ],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.workout.structure.main[0].work.duration).toBe(0.5);
  });

  it('allows a repeat with no stated recovery', () => {
    // Over-unders and similar have no rest segment; that is not a parse failure.
    const r = normalizeWorkoutParse({
      ...VALID,
      structure: { main: [{ type: 'repeat', sets: 3, work: { duration: 10, zone: 3.5 } }] },
    });
    expect(r.ok).toBe(true);
    expect(r.workout.structure.main[0].rest.duration).toBe(0);
  });

  it('defaults a repeat with no set count to one rather than dropping it', () => {
    const r = normalizeWorkoutParse({
      ...VALID,
      structure: { main: [{ type: 'repeat', work: { duration: 20, zone: 4 } }] },
    });
    expect(r.workout.structure.main[0].sets).toBe(1);
  });

  it('only accepts zones the app understands', () => {
    const r = normalizeWorkoutParse({
      ...VALID,
      structure: { main: [{ duration: 20, zone: 9 }] },
    });
    expect(r.workout.structure.main[0].zone).toBeNull();
    const ss = normalizeWorkoutParse({
      ...VALID,
      structure: { main: [{ duration: 20, zone: 3.5 }] },
    });
    expect(ss.workout.structure.main[0].zone).toBe(3.5);
  });

  it('drops out-of-range numbers instead of storing nonsense', () => {
    const r = normalizeWorkoutParse({
      ...VALID,
      intensityFactor: 9,
      estimatedTSS: -5,
      structure: { main: [{ duration: 20, zone: 3, powerPctFTP: 9000 }] },
    });
    expect(r.workout.intensityFactor).toBeNull();
    expect(r.workout.estimatedTSS).toBeNull();
    expect(r.workout.structure.main[0].powerPctFTP).toBeUndefined();
  });

  it('refuses a segment with no usable duration', () => {
    expect(
      normalizeWorkoutParse({ ...VALID, structure: { main: [{ duration: 0, zone: 2 }] } }).ok,
    ).toBe(false);
  });
});
