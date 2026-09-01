import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The calendar write goes through insertSessions now, which binds the browser
 * Supabase singleton rather than the client this function is handed. The split
 * is deliberate: the training_plans row is still written with the passed
 * client, so the stub below covers that half and this mock the other.
 */
const insertMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/calendar/calendarMutations', () => ({
  insertSessions: (...a) => insertMock(...a),
}));

import { activateTrainingPlan } from './coachPlanActivation';

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockImplementation((_u, drafts) =>
    Promise.resolve({ success: true, data: { inserted: drafts.length, skipped: 0 } }),
  );
});

// Minimal controllable Supabase stub. The builder is thenable so `await update().eq().eq()`
// and `await insert(...)` resolve; `single()` returns the created plan row. Inserts are
// captured for assertions.
function makeSupabase() {
  const calls = { inserts: [], updates: [] };
  const supabase = {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update(payload) {
          calls.updates.push({ table, payload });
          return builder;
        },
        insert(payload) {
          calls.inserts.push({ table, payload });
          return builder;
        },
        single: () => Promise.resolve({ data: { id: 'plan-1' }, error: null }),
        then: (resolve) => resolve({ data: null, error: null }),
      };
      return builder;
    },
  };
  return { supabase, calls };
}

const plan = {
  name: 'Summer Vibes Final Block',
  methodology: 'sweet_spot',
  goal: 'racing',
  duration_weeks: 3,
  start_date: '2026-06-08',
  workouts: [
    { week_number: 1, day_of_week: 1, scheduled_date: '2026-06-08', workout_type: 'sweet_spot', workout_id: 'three_by_ten_sst', name: '3x10 SST', target_tss: 80, duration_minutes: 60 },
    { week_number: 1, day_of_week: 2, scheduled_date: '2026-06-09', workout_type: 'rest', workout_id: null, name: 'Rest' },
    { week_number: 1, day_of_week: 3, scheduled_date: '2026-06-10', workout_type: 'recovery', workout_id: 'recovery_spin', name: 'Recovery Spin', target_rss: 20, duration_minutes: 30 },
  ],
};

describe('activateTrainingPlan', () => {
  it('creates the plan, counts only non-rest workouts, and dual-writes RSS+TSS', async () => {
    const { supabase, calls } = makeSupabase();

    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan });

    expect(result.success).toBe(true);
    expect(result.planId).toBe('plan-1');
    // workoutCount is now what LANDED on the calendar, not what was attempted —
    // the writer skips days the athlete has already filled, and reporting the
    // attempt would overstate what the athlete can see.
    expect(result.workoutCount).toBe(3);
    expect(result.skippedCount).toBe(0);

    // training_plans insert still reflects the non-rest total.
    const planInsert = calls.inserts.find((c) => c.table === 'training_plans');
    expect(planInsert.payload.workouts_total).toBe(2);
    expect(planInsert.payload.status).toBe('active');

    // The calendar gets every row, rest included, as entry drafts. One load
    // column, so the dual-write the old table needed does not arise.
    const [userId, drafts, options] = insertMock.mock.calls[0];
    expect(userId).toBe('u1');
    expect(drafts).toHaveLength(3);
    expect(options).toMatchObject({ source: 'coach', planId: 'plan-1' });

    expect(drafts.find((w) => w.workout_id === 'three_by_ten_sst')).toMatchObject({
      date: '2026-06-08', type: 'workout', target_load: 80, target_duration_min: 60,
    });
    expect(drafts.find((w) => w.workout_id === 'recovery_spin')).toMatchObject({
      target_load: 20,
    });
    // The rest day comes through as an entry of type rest, not a workout.
    expect(drafts.find((w) => w.title === 'Rest')).toMatchObject({ type: 'rest' });

    // The scratch fields the redistributor needs are stripped — they are not
    // columns, and a stray key would fail the insert.
    for (const d of drafts) {
      expect(d).not.toHaveProperty('_weekNumber');
      expect(d).not.toHaveProperty('_dayOfWeek');
      expect(d).not.toHaveProperty('scheduled_date');
    }
  });

  it('reports what the calendar actually took when days were already filled', async () => {
    const { supabase } = makeSupabase();
    insertMock.mockResolvedValue({ success: true, data: { inserted: 1, skipped: 2 } });

    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan });

    expect(result.workoutCount).toBe(1);
    expect(result.skippedCount).toBe(2);
  });

  it('fails the activation when the calendar write fails, rather than claiming success', async () => {
    const { supabase } = makeSupabase();
    insertMock.mockResolvedValue({ success: false, error: 'rls denied' });

    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rls denied/);
  });

  it('returns an error result for an empty plan instead of throwing', async () => {
    const { supabase } = makeSupabase();
    const result = await activateTrainingPlan(supabase, { userId: 'u1', plan: { workouts: [] } });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no workouts/i);
  });
});
