/**
 * getPrescriptionFor — picking the workout the route is actually for.
 *
 * Two defects motivated this. The lookup only ever asked for *today's* first
 * incomplete workout, so building a route for Saturday's threshold session
 * described today's recovery spin instead. And "today" was
 * `new Date().toISOString().slice(0,10)` — a UTC date — so a rider west of UTC
 * got tomorrow's workout from early afternoon onward.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface QueryCall {
  filters: Record<string, unknown>;
  single: boolean;
}

const calls: QueryCall[] = [];
/** Rows the mocked query layer will match against, in insertion order. */
let rows: Array<Record<string, unknown>> = [];

function makeQuery() {
  const filters: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  const chain = (k: string) => (col: string, val: unknown) => {
    if (k === 'eq') filters[col] = val;
    return q;
  };
  q.select = () => q;
  q.eq = chain('eq');
  q.order = () => q;
  q.limit = () => q;
  q.maybeSingle = () => {
    calls.push({ filters: { ...filters }, single: true });
    const match = rows.find((r) =>
      Object.entries(filters).every(([col, val]) => r[col] === val),
    );
    return Promise.resolve({ data: match ?? null, error: null });
  };
  return q;
}

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => makeQuery() },
}));

vi.mock('../weather', () => ({ getWeatherData: vi.fn() }));

import { EnhancedContextCollector } from '../enhancedContext';

const USER = 'user-1';

beforeEach(() => {
  calls.length = 0;
  rows = [];
});

describe('getPrescriptionFor resolution order', () => {
  it('prefers the exact row the rider clicked', async () => {
    rows = [
      { id: 'row-sat', user_id: USER, scheduled_date: '2026-08-29', workout_id: 'threshold_4x8', name: 'Saturday threshold', completed: false },
      { id: 'row-today', user_id: USER, scheduled_date: '2026-08-22', workout_id: 'recovery_spin', name: 'Recovery spin', completed: false },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      plannedWorkoutId: 'row-sat',
      scheduledDate: '2026-08-29',
      localDate: '2026-08-22',
    });

    expect(p?.plannedWorkoutId).toBe('row-sat');
    expect(p?.name).toBe('Saturday threshold');
  });

  it('falls back to date + workout id when there is no row id', async () => {
    rows = [
      { id: 'row-sat', user_id: USER, scheduled_date: '2026-08-29', workout_id: 'threshold_4x8', name: 'Saturday threshold', completed: false },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      scheduledDate: '2026-08-29',
      workoutId: 'threshold_4x8',
      localDate: '2026-08-22',
    });

    expect(p?.plannedWorkoutId).toBe('row-sat');
  });

  it('falls back to that date alone', async () => {
    rows = [
      { id: 'row-sat', user_id: USER, scheduled_date: '2026-08-29', workout_id: 'something_else', name: 'Saturday session', completed: false },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      scheduledDate: '2026-08-29',
      workoutId: 'not-scheduled',
      localDate: '2026-08-22',
    });

    expect(p?.plannedWorkoutId).toBe('row-sat');
  });

  it("falls back to the rider's own today when nothing is specified", async () => {
    rows = [
      { id: 'row-today', user_id: USER, scheduled_date: '2026-08-22', workout_id: 'recovery_spin', name: 'Recovery spin', completed: false },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      localDate: '2026-08-22',
    });

    expect(p?.plannedWorkoutId).toBe('row-today');
  });

  it("uses the rider's local date, not a UTC one", async () => {
    // The regression: late on Aug 22 in a UTC-7 zone, `toISOString()` already
    // reads Aug 23, so the old lookup fetched tomorrow's session.
    rows = [
      { id: 'row-22', user_id: USER, scheduled_date: '2026-08-22', name: 'Today', completed: false, workout_id: 'a' },
      { id: 'row-23', user_id: USER, scheduled_date: '2026-08-23', name: 'Tomorrow', completed: false, workout_id: 'b' },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      localDate: '2026-08-22',
    });

    expect(p?.name).toBe('Today');
    expect(calls.some((c) => c.filters.scheduled_date === '2026-08-22')).toBe(true);
  });

  it('only asks for incomplete workouts on the date paths', async () => {
    rows = [];
    await EnhancedContextCollector.getPrescriptionFor({ userId: USER, localDate: '2026-08-22' });
    expect(calls.every((c) => c.filters.completed === false)).toBe(true);
  });

  it('returns null without a user', async () => {
    expect(await EnhancedContextCollector.getPrescriptionFor({ userId: '' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when nothing resolves', async () => {
    rows = [];
    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      plannedWorkoutId: 'missing',
      scheduledDate: '2026-08-29',
      localDate: '2026-08-22',
    });
    expect(p).toBeNull();
  });
});

describe('a workout that is not in the library', () => {
  it('carries the structure from the embedded template', async () => {
    // This is the coach-supplied case. It used to return terrainType: null and
    // structure: null, so the routing-implications machinery never fired.
    rows = [
      {
        id: 'row-custom',
        user_id: USER,
        scheduled_date: '2026-08-22',
        workout_id: 'custom:abc',
        workout_type: 'threshold',
        name: "Coach's 4x8",
        duration_minutes: 75,
        completed: false,
        description: '4x8min @ threshold, 5min easy',
        template_id: 'tpl-1',
        workout_templates: {
          id: 'tpl-1',
          name: "Coach's 4x8",
          workout_type: 'threshold',
          duration_minutes: 75,
          intervals: {
            terrainType: 'flat',
            focusArea: 'lactate_threshold',
            intensityFactor: 0.92,
            structure: {
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
            },
          },
        },
      },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      localDate: '2026-08-22',
    });

    expect(p?.libraryEntryFound).toBe(false);
    expect(p?.terrainType).toBe('flat');
    expect(p?.focusArea).toBe('lactate_threshold');
    expect(p?.intensityRI).toBe(0.92);
    expect(p?.structure?.main).toHaveLength(1);
    expect(p?.description).toBe('4x8min @ threshold, 5min easy');
  });

  it('stays null-structured when the template has nothing usable', async () => {
    // A half-built structure would produce confidently wrong routing
    // implications, so it is rejected rather than partially trusted.
    rows = [
      {
        id: 'row-bare',
        user_id: USER,
        scheduled_date: '2026-08-22',
        workout_id: 'custom:bare',
        workout_type: 'endurance',
        name: 'Coach ride',
        completed: false,
        template_id: 'tpl-bare',
        workout_templates: { id: 'tpl-bare', intervals: { nonsense: true } },
      },
    ];

    const p = await EnhancedContextCollector.getPrescriptionFor({
      userId: USER,
      localDate: '2026-08-22',
    });

    expect(p?.libraryEntryFound).toBe(false);
    expect(p?.structure).toBeNull();
    expect(p?.terrainType).toBeNull();
  });
});
