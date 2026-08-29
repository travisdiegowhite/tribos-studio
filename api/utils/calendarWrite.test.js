/**
 * The server's calendar writers.
 *
 * Two properties are worth pinning here, and both are security or correctness
 * rather than behaviour:
 *
 *   1. EVERY statement filters on user_id. This module runs on the
 *      service-role client, where RLS does not apply, so that filter IS the
 *      boundary — an unscoped `.eq('id', ...)` would happily rewrite another
 *      athlete's row.
 *   2. A swap parks a row before exchanging dates. `UNIQUE (user_id, date,
 *      slot)` makes two plain updates collide with themselves, which is the
 *      failure the old table's park/move/restore-with-rollback existed to
 *      avoid — smaller here, but not gone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { rows: [], ops: [], failNext: undefined };

vi.mock('./supabaseAdmin.js', () => {
  const makeBuilder = (table) => {
    const op = { table, op: 'select', payload: null, filters: {}, inIds: null };
    const settle = () => {
      if (state.failNext) {
        const message = state.failNext;
        state.failNext = undefined;
        return { data: null, error: { message } };
      }
      if (op.op === 'select') {
        if (op.inIds) return { data: state.rows.filter((r) => op.inIds.includes(r.id)), error: null };
        const date = op.filters.date;
        return { data: state.rows.filter((r) => date === undefined || r.date === date), error: null };
      }
      return { data: { id: op.filters.id ?? 'new-id', ...(op.payload ?? {}) }, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (col, val) => { op.filters[col] = val; return builder; },
      in: (col, vals) => { if (col === 'id') op.inIds = vals; return builder; },
      insert: (payload) => { op.op = 'insert'; op.payload = payload; state.ops.push(op); return builder; },
      update: (payload) => { op.op = 'update'; op.payload = payload; state.ops.push(op); return builder; },
      delete: () => { op.op = 'delete'; state.ops.push(op); return builder; },
      single: () => Promise.resolve(settle()),
      maybeSingle: () => Promise.resolve(settle()),
      then: (resolve) => {
        if (op.op === 'select') state.ops.push(op);
        return Promise.resolve(settle()).then(resolve);
      },
    };
    return builder;
  };
  return { getSupabaseAdmin: () => ({ from: (table) => makeBuilder(table) }) };
});

const { updateEntry, moveEntry, deleteEntry, createEntry, swapEntries, nextFreeSlot } =
  await import('./calendarWrite.js');

const USER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';

beforeEach(() => {
  state.rows = [];
  state.ops = [];
  state.failNext = undefined;
});

const writes = () => state.ops.filter((o) => ['insert', 'update', 'delete'].includes(o.op));

describe('every write is scoped to the athlete', () => {
  it('scopes update, move, delete and create', async () => {
    state.rows = [{ id: 'w1', date: '2026-09-01', slot: 0 }];

    await updateEntry(USER, 'w1', { title: 'Renamed' });
    await moveEntry(USER, 'w1', '2026-09-05');
    await deleteEntry(USER, 'w1');
    await createEntry(USER, '2026-09-06', { title: 'New' });

    expect(writes().length).toBeGreaterThanOrEqual(4);
    for (const w of writes()) {
      const scoped = w.filters.user_id === USER || w.payload?.user_id === USER;
      expect(scoped).toBe(true);
      expect(w.filters.user_id).not.toBe(OTHER);
    }
  });

  it('refuses without a user rather than writing unscoped', async () => {
    expect((await updateEntry('', 'w1', { title: 'x' })).success).toBe(false);
    expect((await deleteEntry('', 'w1')).success).toBe(false);
    expect((await moveEntry('', 'w1', '2026-09-05')).success).toBe(false);
    expect(state.ops).toHaveLength(0);
  });
});

describe('updateEntry', () => {
  it('drops fields a server writer is not allowed to set', async () => {
    await updateEntry(USER, 'w1', {
      title: 'Fine',
      user_id: OTHER,
      id: 'nope',
      status: 'done',
      pinned: true,
    });
    const payload = writes()[0].payload;
    expect(payload.title).toBe('Fine');
    expect(payload.user_id).toBeUndefined();
    expect(payload.id).toBeUndefined();
    // status has its own path, and pinning is the athlete's act — neither is
    // reachable through a blanket patch.
    expect(payload.status).toBeUndefined();
    expect(payload.pinned).toBeUndefined();
  });

  it('writes nothing when the patch has nothing writable in it', async () => {
    const r = await updateEntry(USER, 'w1', { user_id: OTHER });
    expect(r.success).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('reports a failure instead of throwing', async () => {
    state.failNext = 'rls denied';
    const r = await updateEntry(USER, 'w1', { title: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('rls denied');
  });
});

describe('slot allocation', () => {
  it('is 0 on an empty day and the next free slot on an occupied one', async () => {
    state.rows = [];
    expect(await nextFreeSlot((await import('./supabaseAdmin.js')).getSupabaseAdmin(), USER, '2026-09-01')).toBe(0);

    state.rows = [{ id: 'a', date: '2026-09-01', slot: 0 }];
    expect(await nextFreeSlot((await import('./supabaseAdmin.js')).getSupabaseAdmin(), USER, '2026-09-01')).toBe(1);
  });

  it('does not treat an entry as its own obstacle when it moves onto its own day', async () => {
    state.rows = [{ id: 'a', date: '2026-09-01', slot: 0 }];
    const admin = (await import('./supabaseAdmin.js')).getSupabaseAdmin();
    expect(await nextFreeSlot(admin, USER, '2026-09-01', 'a')).toBe(0);
  });
});

describe('swapEntries', () => {
  beforeEach(() => {
    state.rows = [
      { id: 'a', date: '2026-09-01', slot: 0 },
      { id: 'b', date: '2026-09-03', slot: 0 },
    ];
  });

  it('parks one row before exchanging, so the unique key cannot collide', async () => {
    const r = await swapEntries(USER, 'a', 'b');
    expect(r.success).toBe(true);

    const updates = writes();
    expect(updates).toHaveLength(3);
    // The park is a slot no real entry can hold — allocation runs upward from 0.
    expect(updates[0].payload).toEqual({ slot: -1 });
    expect(updates[0].filters.id).toBe('a');
    // Then each takes the other's day.
    expect(updates[1].payload).toEqual({ date: '2026-09-01', slot: 0 });
    expect(updates[1].filters.id).toBe('b');
    expect(updates[2].payload).toEqual({ date: '2026-09-03', slot: 0 });
    expect(updates[2].filters.id).toBe('a');
  });

  it('refuses when one of the two is no longer on the calendar', async () => {
    state.rows = [{ id: 'a', date: '2026-09-01', slot: 0 }];
    const r = await swapEntries(USER, 'a', 'gone');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no longer on the calendar/);
    expect(writes()).toHaveLength(0);
  });

  it('refuses to swap an entry with itself', async () => {
    const r = await swapEntries(USER, 'a', 'a');
    expect(r.success).toBe(false);
    expect(writes()).toHaveLength(0);
  });
});

describe('createEntry', () => {
  it('stacks onto an occupied day rather than colliding — that is a double day', async () => {
    state.rows = [{ id: 'x', date: '2026-09-01', slot: 0 }];
    const r = await createEntry(USER, '2026-09-01', { title: 'Second thing' }, { source: 'coach' });
    expect(r.success).toBe(true);
    expect(writes()[0].payload.slot).toBe(1);
  });

  it('leaves a server-created entry UNPINNED — pinning is the athlete\'s act', async () => {
    await createEntry(USER, '2026-09-01', { title: 'Coach session' });
    expect(writes()[0].payload.pinned).toBe(false);
  });

  it('requires a title', async () => {
    expect((await createEntry(USER, '2026-09-01', { title: '' })).success).toBe(false);
    expect(state.ops).toHaveLength(0);
  });
});
