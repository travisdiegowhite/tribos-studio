/**
 * The adapter is a seam, and seams are where every failure this week lived.
 *
 * A wrong field map here does not throw — it renders the wrong number on the
 * athlete's calendar, silently. So each mapping is asserted by name rather
 * than by a shape snapshot, and the derived fields are asserted against the
 * behaviour they replace.
 */

import { describe, it, expect } from 'vitest';
import { toPlannedWorkoutShape, toPlannedWorkoutShapes } from './plannedWorkoutAdapter';
import type { CalendarEntryRow } from './getCalendarRange';

const entry = (over: Partial<CalendarEntryRow> = {}): CalendarEntryRow => ({
  id: 'e1',
  user_id: 'u1',
  date: '2026-10-24',
  slot: 0,
  type: 'workout',
  title: 'CX Skills + Threshold',
  workout_id: null,
  workout_type: 'threshold',
  target_load: 90,
  target_duration_min: 75,
  target_distance_km: null,
  actual_load: null,
  actual_duration_min: null,
  actual_distance_km: null,
  status: 'planned',
  completed_at: null,
  skipped_reason: null,
  activity_id: null,
  notes: null,
  coach_rationale: null,
  details: null,
  provenance: null,
  source: 'coach',
  plan_id: null,
  generation_id: null,
  pinned: false,
  ...over,
});

describe('field mapping', () => {
  it('maps every field the calendar renders', () => {
    const w = toPlannedWorkoutShape(entry());
    expect(w.scheduled_date).toBe('2026-10-24');
    expect(w.name).toBe('CX Skills + Threshold');
    expect(w.workout_type).toBe('threshold');
    expect(w.target_duration).toBe(75);
    expect(w.id).toBe('e1');
  });

  it('fills BOTH rss and tss from target_load', () => {
    // Callers read `target_rss ?? target_tss`. Populating only one would make
    // a legacy reader silently show 0 — the class of bug CLAUDE.md documents.
    const w = toPlannedWorkoutShape(entry({ target_load: 90 }));
    expect(w.target_rss).toBe(90);
    expect(w.target_tss).toBe(90);
  });

  it('maps actual load and duration the same way', () => {
    const w = toPlannedWorkoutShape(entry({ actual_load: 84, actual_duration_min: 71 }));
    expect(w.actual_rss).toBe(84);
    expect(w.actual_tss).toBe(84);
    expect(w.actual_duration).toBe(71);
  });

  it('turns status into the boolean the grid checks', () => {
    expect(toPlannedWorkoutShape(entry({ status: 'done' })).completed).toBe(true);
    expect(toPlannedWorkoutShape(entry({ status: 'planned' })).completed).toBe(false);
    // A skipped or missed session is NOT completed — it must not count toward
    // the week's done tally.
    expect(toPlannedWorkoutShape(entry({ status: 'skipped' })).completed).toBe(false);
    expect(toPlannedWorkoutShape(entry({ status: 'missed' })).completed).toBe(false);
  });

  it('lifts the move markers out of provenance', () => {
    const w = toPlannedWorkoutShape(entry({
      provenance: {
        original_date: '2026-10-22',
        original_workout_id: 'sst_3x12',
        adjustment_reason: 'Moved for the Hustle.',
      },
    }));
    expect(w.original_scheduled_date).toBe('2026-10-22');
    expect(w.original_workout_id).toBe('sst_3x12');
    expect(w.adjustment_reason).toBe('Moved for the Hustle.');
  });

  it('tolerates a null or empty provenance rather than throwing', () => {
    expect(toPlannedWorkoutShape(entry({ provenance: null }).valueOf() as CalendarEntryRow)
      .original_scheduled_date).toBeNull();
    expect(toPlannedWorkoutShape(entry({ provenance: { original_date: '' } }))
      .original_scheduled_date).toBeNull();
  });

  it('carries entry type and pinned through, so races and edits stay identifiable', () => {
    const race = toPlannedWorkoutShape(entry({ type: 'race', title: 'The Hustle CX' }));
    expect(race.entry_type).toBe('race');
    expect(toPlannedWorkoutShape(entry({ pinned: true })).pinned).toBe(true);
  });
});

describe('derived fields', () => {
  it('derives day_of_week in UTC so a DST boundary cannot shift it', () => {
    // 2026-11-01 is the US DST end. Local-time arithmetic drifts here.
    expect(toPlannedWorkoutShape(entry({ date: '2026-11-01' })).day_of_week).toBe(0); // Sunday
    expect(toPlannedWorkoutShape(entry({ date: '2026-11-02' })).day_of_week).toBe(1); // Monday
  });

  it('returns a NULL week_number with no plan, rather than inventing one', () => {
    // The old model measured each row's week from its own plan's start, so
    // three plans' "Week 4" collided in one bucket. Absent a plan there is no
    // honest answer, and TrainingCalendar keys its stats by Monday date anyway.
    expect(toPlannedWorkoutShape(entry()).week_number).toBeNull();
  });

  it('derives week_number from the plan start when there is one', () => {
    const w = toPlannedWorkoutShape(entry({ date: '2026-08-29' }), '2026-08-21');
    expect(w.week_number).toBe(2);
    expect(toPlannedWorkoutShape(entry({ date: '2026-08-21' }), '2026-08-21').week_number).toBe(1);
  });

  it('does not fall over on an unparseable plan start', () => {
    expect(toPlannedWorkoutShape(entry(), 'not-a-date').week_number).toBeNull();
  });
});

describe('toPlannedWorkoutShapes', () => {
  it('maps a range and preserves order', () => {
    const out = toPlannedWorkoutShapes([
      entry({ id: 'a', date: '2026-10-24' }),
      entry({ id: 'b', date: '2026-10-31', type: 'race', title: 'Boulder Reservoir' }),
    ]);
    expect(out.map((w) => w.id)).toEqual(['a', 'b']);
    expect(out[1].entry_type).toBe('race');
  });

  it('handles an empty range', () => {
    expect(toPlannedWorkoutShapes([])).toEqual([]);
  });
});
