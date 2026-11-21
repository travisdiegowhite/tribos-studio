/**
 * Every cycling library workout's `targetTSS` is the planned RSS of the
 * session it prescribes: its structure, stretched to its listed length the way
 * the calendar shows it, scored with the actual-load formula.
 *
 * Until 2026-11 these were hand-typed and ran up to 2× their own structure
 * (three_by_ten_sst said 80 for a session that scores 56), so an athlete who
 * rode a session exactly as written still "missed" its planned load.
 */
import { describe, it, expect } from 'vitest';
import { WORKOUT_LIBRARY } from '../workoutLibrary';
import { structureLoad, fitStructureToDuration } from '../../lib/training/plannedWorkoutShape';

describe('workout library planned load', () => {
  const structured = Object.values(WORKOUT_LIBRARY).filter(
    (w) => w.structure && w.structure.main.length > 0 && (w.targetTSS ?? 0) > 0,
  );

  it('covers the structured cycling workouts', () => {
    expect(structured.length).toBeGreaterThan(20);
  });

  it.each(structured.map((w) => [w.id, w] as const))('%s targetTSS matches its structure', (_id, w) => {
    const derived = structureLoad(fitStructureToDuration(w.structure, w.duration));
    expect(Math.abs((w.targetTSS ?? 0) - derived)).toBeLessThanOrEqual(Math.max(2, derived * 0.05));
  });
});
