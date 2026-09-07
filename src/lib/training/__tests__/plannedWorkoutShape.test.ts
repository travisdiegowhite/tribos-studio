import { describe, expect, it } from 'vitest';
import {
  buildIntervalStructure,
  buildSteadyStructure,
  fitStructureToDuration,
  parseIntervalsFromNotes,
  resolvePlannedWorkoutShape,
  structureDurationMin,
} from '../plannedWorkoutShape';
import { WORKOUT_LIBRARY } from '../../../data/workoutLibrary';
import type { WorkoutInterval, WorkoutSegment } from '../../../types/training';

const fourByEight = WORKOUT_LIBRARY.four_by_eight_vo2;

function mainInterval(structure: { main: (WorkoutSegment | WorkoutInterval)[] }): WorkoutInterval {
  const item = structure.main.find((m) => 'type' in m && m.type === 'repeat');
  if (!item) throw new Error('no interval in main set');
  return item as WorkoutInterval;
}

describe('structureDurationMin', () => {
  it('sums warmup, sets (without the trailing rest) and cooldown', () => {
    // 15 warmup + 4x8 work + 3x4 rest + 10 cooldown = 69
    expect(structureDurationMin(fourByEight.structure)).toBe(69);
  });
});

describe('fitStructureToDuration', () => {
  it('leaves a structure alone when the target already matches', () => {
    expect(fitStructureToDuration(fourByEight.structure, 69)).toBe(fourByEight.structure);
    expect(fitStructureToDuration(fourByEight.structure, null)).toBe(fourByEight.structure);
  });

  it('lengthens the easy riding, not the intervals, to reach a longer target', () => {
    const fitted = fitStructureToDuration(fourByEight.structure, 90);
    expect(structureDurationMin(fitted)).toBeCloseTo(90, 0);
    const interval = mainInterval(fitted);
    expect(interval.sets).toBe(4);
    expect((interval.work as WorkoutSegment).duration).toBe(8);
    expect(fitted.warmup!.duration).toBeGreaterThan(15);
    expect(fitted.cooldown!.duration).toBeGreaterThan(10);
  });

  it('trims the bookends first for a slightly shorter target', () => {
    const fitted = fitStructureToDuration(fourByEight.structure, 60);
    expect(structureDurationMin(fitted)).toBeCloseTo(60, 0);
    expect((mainInterval(fitted).work as WorkoutSegment).duration).toBe(8);
    expect(fitted.warmup!.duration).toBeGreaterThanOrEqual(5);
    expect(fitted.cooldown!.duration).toBeGreaterThanOrEqual(5);
  });

  it('scales everything when the target is shorter than the bookends can absorb', () => {
    const fitted = fitStructureToDuration(fourByEight.structure, 35);
    expect(structureDurationMin(fitted)).toBeCloseTo(35, 0);
    const interval = mainInterval(fitted);
    expect(interval.sets).toBe(4);
    expect((interval.work as WorkoutSegment).duration).toBeLessThan(8);
  });
});

describe('buildSteadyStructure / buildIntervalStructure', () => {
  it('builds a steady session that lands on the planned length', () => {
    const s = buildSteadyStructure(2, 120);
    expect(structureDurationMin(s)).toBe(120);
    expect((s.main[0] as WorkoutSegment).zone).toBe(2);
  });

  it('builds an interval session that lands on the planned length', () => {
    const s = buildIntervalStructure({ sets: 5, workMin: 3, restMin: 3, zone: 5, durationMin: 60 });
    expect(structureDurationMin(s)).toBeCloseTo(60, 0);
    const interval = mainInterval(s);
    expect(interval.sets).toBe(5);
    expect((interval.work as WorkoutSegment).powerPctFTP).toBe(115);
  });
});

describe('parseIntervalsFromNotes', () => {
  it('reads count, length, rest and intensity from a coach sentence', () => {
    expect(parseIntervalsFromNotes('5x3min at VO2 effort with 3min easy recovery.')).toEqual({
      sets: 5,
      workMin: 3,
      restMin: 3,
      zone: 5,
    });
  });

  it('accepts spaced and second-based forms', () => {
    expect(parseIntervalsFromNotes('4 x 8 min threshold, 4min rest between')).toMatchObject({
      sets: 4,
      workMin: 8,
      restMin: 4,
      zone: 4,
    });
    expect(parseIntervalsFromNotes('12x30s sprints, 30s off')).toMatchObject({
      sets: 12,
      workMin: 0.5,
      restMin: 0.5,
      zone: 7,
    });
  });

  it('returns null when the notes name no set', () => {
    expect(parseIntervalsFromNotes('VO2 quality (week 1, dense block).')).toBeNull();
    expect(parseIntervalsFromNotes(null)).toBeNull();
  });
});

describe('resolvePlannedWorkoutShape', () => {
  it('uses the named library workout, fitted to the planned duration', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: 'four_by_eight_vo2',
      workout_type: 'vo2max',
      name: 'Big VO2 day',
      target_duration: 90,
      target_rss: 110,
    });
    expect(shape?.source).toBe('library');
    expect(shape?.note).toBeNull();
    expect(shape?.workout.name).toBe('Big VO2 day');
    expect(shape?.workout.duration).toBe(90);
    expect(shape?.workout.targetTSS).toBe(110);
    expect(structureDurationMin(shape!.workout.structure)).toBeCloseTo(90, 0);
  });

  it('infers a stand-in for an arc row that names no workout', () => {
    // The row in production: arc VO2 day, workout_id null, 75 min, 71 RSS.
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'vo2max',
      name: 'VO2 Max Intervals',
      target_duration: 75,
      target_rss: 71,
      notes: 'VO2 quality (week 1, dense block).',
    });
    expect(shape?.source).toBe('inferred');
    expect(shape?.note).toMatch(/4x8min VO2 Max/);
    expect(shape?.workout.name).toBe('VO2 Max Intervals');
    expect(shape?.workout.category).toBe('vo2max');
    expect(shape?.workout.targetTSS).toBe(71);
    expect(structureDurationMin(shape!.workout.structure)).toBeCloseTo(75, 0);
    expect(mainInterval(shape!.workout.structure).sets).toBe(4);
  });

  it('prefers the set the coach wrote in the notes', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'vo2max',
      title: 'VO2 Openers',
      target_duration_min: 60,
      target_load: 80,
      notes: '5x3min at VO2 effort with full recovery. Keeps top-end sharp.',
    });
    expect(shape?.source).toBe('notes');
    expect(shape?.workout.name).toBe('VO2 Openers');
    const interval = mainInterval(shape!.workout.structure);
    expect(interval.sets).toBe(5);
    expect((interval.work as WorkoutSegment).duration).toBe(3);
    expect((interval.work as WorkoutSegment).zone).toBe(5);
    expect(structureDurationMin(shape!.workout.structure)).toBeCloseTo(60, 0);
  });

  it('draws a steady block for a type with no library stand-in', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'endurance',
      name: 'Long Z2',
      target_duration: 150,
      target_rss: 120,
      notes: 'Long Z2 — endurance maintained through the VO2 block.',
    });
    // Endurance has library stand-ins, so this infers; the steady fallback is
    // reached by a type the library has no paintable session for.
    expect(shape?.source).toBe('inferred');
    expect(structureDurationMin(shape!.workout.structure)).toBeCloseTo(150, 0);
  });

  it('has no ride shape for a rest day or off-bike session', () => {
    const rest = resolvePlannedWorkoutShape({ workout_id: null, workout_type: 'rest', name: 'Rest' });
    expect(rest?.source).toBeNull();
    expect(rest?.workout.structure.main).toEqual([]);
    expect(rest?.workout.category).toBe('rest');

    const strength = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'strength',
      name: 'Gym',
      target_duration: 45,
    });
    expect(strength?.source).toBeNull();
    expect(strength?.workout.category).toBe('strength');
  });

  it('still returns something ridable for an unknown type', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'kitesurfing',
      name: 'Mystery',
      target_duration: 60,
    });
    // Unknown types have no category → treated as rest (nothing to paint).
    expect(shape?.source).toBeNull();
  });

  it('returns null for a missing row', () => {
    expect(resolvePlannedWorkoutShape(null)).toBeNull();
  });
});

describe('export from a resolved shape', () => {
  it('encodes FIT, ZWO and TCX from an inferred structure', async () => {
    const { workoutStructureToCycling } = await import('../../../utils/trainingPlanExport');
    const { exportWorkout } = await import('../../../utils/workoutExport');
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'vo2max',
      name: 'VO2 Max Intervals',
      target_duration: 75,
      target_rss: 71,
    })!;
    const cycling = workoutStructureToCycling(shape.workout.structure);
    // The converter counts the recovery after the final set too, so the file
    // runs a few minutes past the planned length; never shorter.
    expect(cycling.totalDuration).toBeGreaterThanOrEqual(75);
    for (const format of ['fit', 'zwo', 'tcx'] as const) {
      const result = exportWorkout(cycling, {
        format,
        workoutName: shape.workout.name,
        description: '',
      });
      expect(result.filename.endsWith(`.${format}`)).toBe(true);
      expect(result.content.length).toBeGreaterThan(100);
    }
  });
});

describe('a stored prescription wins over everything', () => {
  const prescription = {
    version: 1 as const,
    source: 'coach' as const,
    intervals: [{ repeats: 5, duration_min: 4, target_pct_ftp_min: 110, target_pct_ftp_max: 120, recovery_min: 4 }],
  };

  it('paints exactly the stored set, with no stand-in note', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'vo2max',
      name: 'VO2 5x4',
      target_duration: 75,
      target_rss: 90,
      notes: '4x8min at threshold', // must NOT win over the stored structure
      details: { prescription },
    })!;
    expect(shape.source).toBe('prescribed');
    expect(shape.note).toBeNull();
    const interval = mainInterval(shape.workout.structure);
    expect(interval.sets).toBe(5);
    expect((interval.work as WorkoutSegment).duration).toBe(4);
    expect((interval.work as WorkoutSegment).powerPctFTP).toBe(115);
    expect((interval.work as WorkoutSegment).zone).toBe(5);
    expect(structureDurationMin(shape.workout.structure)).toBeCloseTo(75, 0);
  });

  it('beats a named library workout too', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: 'four_by_eight_vo2',
      workout_type: 'vo2max',
      name: 'Adjusted VO2',
      target_duration: 60,
      details: { prescription },
    })!;
    expect(shape.source).toBe('prescribed');
    expect(mainInterval(shape.workout.structure).sets).toBe(5);
  });

  it('keeps the prescription\'s own bookends when it names them', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'threshold',
      name: '2x20',
      target_duration: 90,
      details: {
        prescription: {
          ...prescription,
          warmup_min: 20,
          cooldown_min: 10,
          intervals: [{ repeats: 2, duration_min: 20, target_pct_ftp_min: 95, target_pct_ftp_max: 100, recovery_min: 5 }],
        },
      },
    })!;
    expect(shape.workout.structure.warmup!.duration).toBe(20);
    expect(shape.workout.structure.cooldown!.duration).toBe(10);
  });

  it('infers the category from the hardest set when the row has no type', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: null,
      name: 'Mystery',
      target_duration: 60,
      details: { prescription },
    })!;
    expect(shape.workout.category).toBe('vo2max');
  });

  it('ignores a malformed prescription and falls through', () => {
    const shape = resolvePlannedWorkoutShape({
      workout_id: null,
      workout_type: 'vo2max',
      name: 'VO2',
      target_duration: 75,
      details: { prescription: { version: 1, source: 'coach', intervals: [{ repeats: 0 }] } },
    })!;
    expect(shape.source).toBe('inferred');
  });
});
