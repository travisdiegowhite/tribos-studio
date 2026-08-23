import { describe, it, expect } from 'vitest';
import { supersedePriorPlans } from './supersedePlans.js';

/**
 * Records every filter applied so the tests can assert on the *shape* of each
 * statement — the original bug was a statement that ran and matched nothing, so
 * "it didn't throw" proves nothing here.
 */
function makeSupabase({ activePlans = [{ id: 'old-1' }], results = {} } = {}) {
  const ops = [];
  const supabase = {
    from(table) {
      const op = { table, filters: [], op: null, payload: null };
      const push = (kind, ...args) => { op.filters.push([kind, ...args]); return builder; };
      const builder = {
        select() { op.op = op.op || 'select'; return builder; },
        delete(opts) { op.op = 'delete'; op.opts = opts; ops.push(op); return builder; },
        update(payload, opts) { op.op = 'update'; op.payload = payload; op.opts = opts; ops.push(op); return builder; },
        eq: (...a) => push('eq', ...a),
        in: (...a) => push('in', ...a),
        gte: (...a) => push('gte', ...a),
        is: (...a) => push('is', ...a),
        or: (...a) => push('or', ...a),
        then(resolve) {
          if (op.op === 'select') { ops.push(op); return resolve({ data: activePlans, error: null }); }
          const r = results[`${op.op}:${op.table}`] ?? { error: null, count: 1 };
          return resolve(r);
        },
      };
      return builder;
    },
  };
  return { supabase, ops };
}

const ARGS = { userId: 'u1', fromDate: '2026-08-21' };

describe('supersedePriorPlans', () => {
  it('deletes untouched machine fill and detaches everything else', async () => {
    const { supabase, ops } = makeSupabase({
      results: { 'delete:planned_workouts': { error: null, count: 30 }, 'update:planned_workouts': { error: null, count: 6 } },
    });

    const r = await supersedePriorPlans(supabase, ARGS);

    expect(r.success).toBe(true);
    expect(r.deleted).toBe(30);
    expect(r.detached).toBe(6);
    expect(r.planIds).toEqual(['old-1']);
  });

  it('DETACHES rather than deletes — plan_id goes NULL, the row survives', async () => {
    // The whole point: a session the athlete moved by hand must stay on the
    // calendar when the plan that seeded it retires.
    const { supabase, ops } = makeSupabase();
    await supersedePriorPlans(supabase, ARGS);

    const detach = ops.find((o) => o.op === 'update' && o.table === 'planned_workouts');
    expect(detach.payload).toEqual({ plan_id: null, source: 'manual' });
  });

  it('scopes the delete to untouched machine fill only', async () => {
    const { supabase, ops } = makeSupabase();
    await supersedePriorPlans(supabase, ARGS);

    const del = ops.find((o) => o.op === 'delete');
    const flat = JSON.stringify(del.filters);

    // Only generated rows...
    expect(del.filters).toContainEqual(['in', 'source', ['arc', 'coach_static']]);
    // ...that nobody has touched...
    for (const col of ['activity_id', 'original_scheduled_date', 'original_workout_id', 'adjustment_reason']) {
      expect(del.filters).toContainEqual(['is', col, null]);
    }
    // ...aren't done...
    expect(flat).toContain('completed.is.null,completed.eq.false');
    // ...are in the future...
    expect(del.filters).toContainEqual(['gte', 'scheduled_date', '2026-08-21']);
    // ...and belong to this athlete and these plans.
    expect(del.filters).toContainEqual(['eq', 'user_id', 'u1']);
    expect(del.filters).toContainEqual(['in', 'plan_id', ['old-1']]);
  });

  it('never touches past or completed rows', async () => {
    const { supabase, ops } = makeSupabase();
    await supersedePriorPlans(supabase, ARGS);

    for (const o of ops.filter((x) => x.table === 'planned_workouts')) {
      expect(o.filters).toContainEqual(['gte', 'scheduled_date', '2026-08-21']);
      expect(JSON.stringify(o.filters)).toContain('completed.is.null,completed.eq.false');
    }
  });

  it("marks the plan 'superseded', not 'completed'", async () => {
    const { supabase, ops } = makeSupabase();
    await supersedePriorPlans(supabase, ARGS);

    const planUpdate = ops.find((o) => o.op === 'update' && o.table === 'training_plans');
    expect(planUpdate.payload.status).toBe('superseded');
    expect(planUpdate.payload.ended_at).toBeTruthy();
  });

  it('reports a failed delete instead of swallowing it', async () => {
    // The 2026-08-22 outage: the delete did nothing and nobody found out.
    const { supabase } = makeSupabase({
      results: { 'delete:planned_workouts': { error: { message: 'permission denied' }, count: null } },
    });

    const r = await supersedePriorPlans(supabase, ARGS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('permission denied');
  });

  it('reports a failed detach', async () => {
    const { supabase } = makeSupabase({
      results: { 'update:planned_workouts': { error: { message: 'boom' }, count: null } },
    });
    const r = await supersedePriorPlans(supabase, ARGS);
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom');
  });

  it('is a no-op when there are no prior plans', async () => {
    const { supabase, ops } = makeSupabase({ activePlans: [] });
    const r = await supersedePriorPlans(supabase, ARGS);

    expect(r).toEqual({ success: true, planIds: [], deleted: 0, detached: 0 });
    expect(ops.filter((o) => o.table === 'planned_workouts')).toHaveLength(0);
  });

  it('skips plans named in exceptPlanIds', async () => {
    const { supabase, ops } = makeSupabase({ activePlans: [{ id: 'old-1' }, { id: 'keep-me' }] });
    const r = await supersedePriorPlans(supabase, { ...ARGS, exceptPlanIds: ['keep-me'] });

    expect(r.planIds).toEqual(['old-1']);
    const del = ops.find((o) => o.op === 'delete');
    expect(del.filters).toContainEqual(['in', 'plan_id', ['old-1']]);
  });

  it('validates its inputs', async () => {
    const { supabase } = makeSupabase();
    expect((await supersedePriorPlans(supabase, { fromDate: '2026-08-21' })).error).toBe('Missing user');
    expect((await supersedePriorPlans(supabase, { userId: 'u1' })).error).toBe('Missing fromDate');
  });
});
