/**
 * customWorkoutRow — turning a coach's workout back into a WorkoutDefinition.
 *
 * Every resolution path in the app was library-only, so a workout prescribed by
 * a human coach either vanished (the RB2 picker dropped any row it couldn't
 * resolve) or reached route generation with no terrain and no intervals.
 */
import { describe, it, expect } from 'vitest';
import {
  CUSTOM_WORKOUT_PREFIX,
  durationFromStructure,
  isCustomWorkoutId,
  newCustomWorkoutId,
  parseStoredStructure,
  templateOf,
  workoutDefinitionFromRow,
} from '../customWorkoutRow';

const STRUCTURE = {
  warmup: { duration: 15, zone: 2 },
  main: [
    {
      type: 'repeat',
      sets: 4,
      work: { duration: 8, zone: 4, description: 'Threshold' },
      rest: { duration: 5, zone: 1 },
    },
  ],
  cooldown: { duration: 10, zone: 1 },
};

const TEMPLATE = {
  id: 'tpl-1',
  name: "Coach's 4x8",
  description: '4x8min @ threshold, 5min easy between',
  workout_type: 'threshold',
  duration_minutes: 77,
  expected_tss: 88,
  expected_if: 0.9,
  intervals: {
    structure: STRUCTURE,
    terrainType: 'flat',
    focusArea: 'lactate_threshold',
    intensityFactor: 0.92,
  },
};

const ROW = {
  id: 'row-1',
  workout_id: 'custom:abc',
  workout_type: 'threshold',
  name: "Coach's 4x8",
  duration_minutes: 77,
  template_id: 'tpl-1',
  workout_templates: TEMPLATE,
};

describe('custom workout ids', () => {
  it('recognises its own prefix and nothing else', () => {
    expect(isCustomWorkoutId(`${CUSTOM_WORKOUT_PREFIX}x`)).toBe(true);
    expect(isCustomWorkoutId('threshold_4x8')).toBe(false);
    expect(isCustomWorkoutId(null)).toBe(false);
  });

  it('mints unique ids', () => {
    expect(newCustomWorkoutId()).not.toBe(newCustomWorkoutId());
    expect(isCustomWorkoutId(newCustomWorkoutId())).toBe(true);
  });
});

describe('templateOf', () => {
  it('accepts the object embed PostgREST returns for a to-one FK', () => {
    expect(templateOf(ROW)?.id).toBe('tpl-1');
  });

  it('also accepts a single-element array embed', () => {
    expect(templateOf({ ...ROW, workout_templates: [TEMPLATE] })?.id).toBe('tpl-1');
  });

  it('is null when there is no template', () => {
    expect(templateOf({ id: 'row-2' })).toBeNull();
    expect(templateOf(null)).toBeNull();
  });
});

describe('parseStoredStructure', () => {
  it('parses a JSON string as well as an object', () => {
    const fromString = parseStoredStructure(JSON.stringify(TEMPLATE.intervals));
    expect(fromString?.structure.main).toHaveLength(1);
    expect(fromString?.terrainType).toBe('flat');
  });

  it('rejects anything without a main block rather than half-building', () => {
    // A partial structure produces confidently wrong routing implications,
    // which is worse than admitting we have none.
    expect(parseStoredStructure({ structure: {} })).toBeNull();
    expect(parseStoredStructure({ nonsense: true })).toBeNull();
    expect(parseStoredStructure('not json')).toBeNull();
    expect(parseStoredStructure(null)).toBeNull();
  });

  it('only accepts known terrain types', () => {
    expect(parseStoredStructure({ structure: STRUCTURE, terrainType: 'mountainous' })?.terrainType)
      .toBeNull();
    expect(parseStoredStructure({ structure: STRUCTURE, terrainType: 'hilly' })?.terrainType)
      .toBe('hilly');
  });
});

describe('durationFromStructure', () => {
  it('counts warmup, every rep of the main block, and cooldown', () => {
    // 15 + 4 × (8 + 5) + 10
    expect(durationFromStructure(STRUCTURE as never)).toBe(77);
  });

  it('handles a plain segment in the main block', () => {
    expect(
      durationFromStructure({
        warmup: null,
        main: [{ duration: 40, zone: 3 }],
        cooldown: null,
      } as never),
    ).toBe(40);
  });
});

describe('workoutDefinitionFromRow', () => {
  it('rebuilds a usable WorkoutDefinition', () => {
    const def = workoutDefinitionFromRow(ROW);
    expect(def?.name).toBe("Coach's 4x8");
    expect(def?.category).toBe('threshold');
    expect(def?.duration).toBe(77);
    expect(def?.terrainType).toBe('flat');
    expect(def?.focusArea).toBe('lactate_threshold');
    expect(def?.intensityFactor).toBe(0.92);
    expect(def?.structure?.main).toHaveLength(1);
  });

  it('identifies by the template, so one session scheduled twice is one workout', () => {
    const monday = workoutDefinitionFromRow({ ...ROW, id: 'row-mon' });
    const thursday = workoutDefinitionFromRow({ ...ROW, id: 'row-thu' });
    expect(monday?.id).toBe(thursday?.id);
    expect(isCustomWorkoutId(monday!.id)).toBe(true);
  });

  it('falls back to the structure for duration when the row has none', () => {
    const def = workoutDefinitionFromRow({
      ...ROW,
      duration_minutes: null,
      target_duration: null,
      workout_templates: { ...TEMPLATE, duration_minutes: null },
    });
    expect(def?.duration).toBe(77);
  });

  it('returns null for a library-backed row so the caller uses the library', () => {
    expect(workoutDefinitionFromRow({ id: 'row-3', workout_id: 'threshold_4x8' })).toBeNull();
  });

  it('returns null when the template carries no usable structure', () => {
    expect(
      workoutDefinitionFromRow({ ...ROW, workout_templates: { id: 't', intervals: {} } }),
    ).toBeNull();
  });
});
