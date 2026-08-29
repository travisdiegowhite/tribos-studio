import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The global test setup mocks `src/lib/supabase`, so these tests drive that
 * mock directly and assert on the payloads and filters the mutations build.
 */
const state: {
  rows: Array<Record<string, unknown>>;
  ops: Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, ...unknown[]]> }>;
  failNext?: string;
} = { rows: [], ops: [] };

vi.mock('../supabase', () => {
  const makeBuilder = (table: string) => {
    const op: { table: string; op: string; payload?: unknown; filters: Array<[string, ...unknown[]]> } = {
      table, op: 'select', filters: [],
    };
    const push = (kind: string, ...args: unknown[]) => { op.filters.push([kind, ...args]); return builder; };
    const settle = () => {
      if (state.failNext) {
        const message = state.failNext;
        state.failNext = undefined;
        return { data: null, error: { message } };
      }
      if (op.op === 'select') {
        const date = op.filters.find((f) => f[0] === 'eq' && f[1] === 'date')?.[2];
        const id = op.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
        const ids = op.filters.find((f) => f[0] === 'in' && f[1] === 'id')?.[2] as string[] | undefined;
        const from = op.filters.find((f) => f[0] === 'gte' && f[1] === 'date')?.[2] as string | undefined;
        const to = op.filters.find((f) => f[0] === 'lte' && f[1] === 'date')?.[2] as string | undefined;
        const notType = op.filters.find((f) => f[0] === 'neq' && f[1] === 'type')?.[2];
        if (ids) return { data: state.rows.filter((r) => ids.includes(r.id as string)), error: null };
        if (id) return { data: state.rows.find((r) => r.id === id) ?? null, error: null };
        if (from || to) {
          return {
            data: state.rows.filter(
              (r) =>
                (!from || (r.date as string) >= from) &&
                (!to || (r.date as string) <= to) &&
                (notType === undefined || r.type !== notType),
            ),
            error: null,
          };
        }
        return {
          data: state.rows.filter(
            (r) => r.date === date && (notType === undefined || r.type !== notType),
          ),
          error: null,
        };
      }
      return { data: { ...(op.payload as object ?? {}) }, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => { op.op = 'insert'; op.payload = payload; state.ops.push(op); return builder; },
      update: (payload: unknown) => { op.op = 'update'; op.payload = payload; state.ops.push(op); return builder; },
      delete: () => { op.op = 'delete'; state.ops.push(op); return builder; },
      eq: (...a: unknown[]) => push('eq', ...a),
      neq: (...a: unknown[]) => push('neq', ...a),
      gte: (...a: unknown[]) => push('gte', ...a),
      lte: (...a: unknown[]) => push('lte', ...a),
      in: (...a: unknown[]) => push('in', ...a),
      order: () => builder,
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (resolve: (v: unknown) => unknown) => {
        if (op.op === 'select') state.ops.push(op);
        return Promise.resolve(resolve(settle()));
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

const {
  createEntry, updateEntry, moveEntry, deleteEntry, setEntryStatus, nextFreeSlot, swapEntries,
  insertSessions, upsertSessionOnDate, linkEntryToActivity,
  countUpcomingClearable, clearUpcomingEntries,
} = await import('./calendarMutations');

beforeEach(() => {
  state.rows = [];
  state.ops = [];
  state.failNext = undefined;
  let n = 0;
  vi.stubGlobal('crypto', { randomUUID: () => (n === 0 ? (n++, 'new-id') : `new-id-${n++}`) });
});

const lastOp = (op: string) => [...state.ops].reverse().find((o) => o.op === op)!;

describe('nextFreeSlot', () => {
  it('is 0 on an empty day', async () => {
    expect(await nextFreeSlot('u1', '2026-08-24')).toBe(0);
  });

  it('takes the next free slot on an occupied day', async () => {
    state.rows = [{ id: 'a', date: '2026-08-24', slot: 0 }];
    expect(await nextFreeSlot('u1', '2026-08-24')).toBe(1);
  });

  it('fills a hole left by an earlier move rather than appending', async () => {
    // Slot 1 was vacated; a new entry should reuse it, not become slot 2.
    state.rows = [
      { id: 'a', date: '2026-08-24', slot: 0 },
      { id: 'c', date: '2026-08-24', slot: 2 },
    ];
    expect(await nextFreeSlot('u1', '2026-08-24')).toBe(1);
  });
});

describe('createEntry', () => {
  it('requires no plan and pins athlete-created entries', async () => {
    const r = await createEntry('u1', '2026-08-24', { title: 'Endurance Ride', target_load: 70 });
    expect(r.success).toBe(true);
    const payload = lastOp('insert').payload as Record<string, unknown>;
    expect(payload.plan_id).toBeNull();
    expect(payload.pinned).toBe(true);
    expect(payload.slot).toBe(0);
    expect(payload.status).toBe('planned');
  });

  it('allocates slot 1 when the day is already taken', async () => {
    state.rows = [{ id: 'a', date: '2026-08-24', slot: 0 }];
    await createEntry('u1', '2026-08-24', { title: 'Evening Spin' });
    expect((lastOp('insert').payload as Record<string, unknown>).slot).toBe(1);
  });

  it('does NOT pin generator output, so a refill may still replace it', async () => {
    await createEntry('u1', '2026-08-24', { title: 'Arc Session', source: 'arc' });
    expect((lastOp('insert').payload as Record<string, unknown>).pinned).toBe(false);
  });

  it('validates its inputs', async () => {
    expect((await createEntry('', '2026-08-24', { title: 'x' })).error).toBe('Not signed in');
    expect((await createEntry('u1', '', { title: 'x' })).error).toBe('A valid date is required');
    expect((await createEntry('u1', '2026-08-24', { title: '  ' })).error).toBe('A title is required');
  });
});

describe('moveEntry', () => {
  it('takes the next free slot on the destination and pins the entry', async () => {
    state.rows = [
      { id: 'e1', date: '2026-08-24', slot: 0, provenance: null },
      { id: 'other', date: '2026-08-26', slot: 0 },
    ];
    const r = await moveEntry('u1', 'e1', '2026-08-26');
    expect(r.success).toBe(true);
    const payload = lastOp('update').payload as Record<string, unknown>;
    expect(payload.date).toBe('2026-08-26');
    expect(payload.slot).toBe(1);
    expect(payload.pinned).toBe(true);
  });

  it('records where it came from', async () => {
    state.rows = [{ id: 'e1', date: '2026-08-24', slot: 0, provenance: null }];
    await moveEntry('u1', 'e1', '2026-08-27');
    const prov = (lastOp('update').payload as Record<string, Record<string, unknown>>).provenance;
    expect(prov.original_date).toBe('2026-08-24');
  });

  it('keeps the FIRST origin across repeated moves', async () => {
    state.rows = [{ id: 'e1', date: '2026-08-25', slot: 0, provenance: { original_date: '2026-08-24' } }];
    await moveEntry('u1', 'e1', '2026-08-27');
    const prov = (lastOp('update').payload as Record<string, Record<string, unknown>>).provenance;
    expect(prov.original_date).toBe('2026-08-24');
  });

  it('is a no-op when the date has not changed', async () => {
    state.rows = [{ id: 'e1', date: '2026-08-24', slot: 0, provenance: null }];
    const r = await moveEntry('u1', 'e1', '2026-08-24');
    expect(r.success).toBe(true);
    expect(state.ops.find((o) => o.op === 'update')).toBeUndefined();
  });

  it('reports a missing entry instead of writing', async () => {
    const r = await moveEntry('u1', 'gone', '2026-08-26');
    expect(r.success).toBe(false);
    expect(r.error).toBe('That entry no longer exists');
  });
});

describe('setEntryStatus', () => {
  it("stamps completed_at when marking done, and clears it otherwise", async () => {
    state.rows = [{ id: 'e1', date: '2026-08-24', slot: 0 }];
    await setEntryStatus('u1', 'e1', 'done');
    expect((lastOp('update').payload as Record<string, unknown>).completed_at).toBeTruthy();

    await setEntryStatus('u1', 'e1', 'planned');
    expect((lastOp('update').payload as Record<string, unknown>).completed_at).toBeNull();
  });

  it('records a skip reason only when skipping', async () => {
    await setEntryStatus('u1', 'e1', 'skipped', { skippedReason: 'sick' });
    expect((lastOp('update').payload as Record<string, unknown>).skipped_reason).toBe('sick');

    await setEntryStatus('u1', 'e1', 'done');
    expect((lastOp('update').payload as Record<string, unknown>).skipped_reason).toBeUndefined();
  });
});

describe('ownership scoping', () => {
  it('every write is scoped to the athlete, never to a plan', async () => {
    state.rows = [{ id: 'e1', date: '2026-08-24', slot: 0, provenance: null }];
    await updateEntry('u1', 'e1', { title: 'Renamed' });
    await moveEntry('u1', 'e1', '2026-08-26');
    await deleteEntry('u1', 'e1');
    await setEntryStatus('u1', 'e1', 'done');

    const writes = state.ops.filter((o) => o.op !== 'select');
    expect(writes.length).toBeGreaterThan(0);
    for (const op of writes) {
      expect(op.filters).toContainEqual(['eq', 'user_id', 'u1']);
      expect(op.filters.some((f) => f[1] === 'plan_id')).toBe(false);
    }
  });

  it('surfaces a database error rather than reporting success', async () => {
    state.failNext = 'permission denied';
    const r = await createEntry('u1', '2026-08-24', { title: 'x' });
    expect(r.success).toBe(false);
    // The underlying message survives, wrapped with which step failed — a bare
    // "permission denied" would not say whether the read or the insert broke.
    expect(r.error).toContain('permission denied');
    expect(r.error).toContain('Could not read slots');
  });
});

/**
 * THE GESTURE THIS REBUILD EXISTS FOR.
 *
 * "Long ride to Sunday, threshold to Saturday" is the most common edit an
 * athlete makes to a week, and until now the calendar could not do it. On
 * `planned_workouts`, `UNIQUE (plan_id, scheduled_date)` made a two-row swap
 * collide with itself, so it needed a three-write park/move/restore with
 * rollback — 80 lines in the drop handler, mirrored in api/coach.js and two
 * other call sites. Through the coach it counted as two edits, tripped the
 * multi-entry rule, and landed in an approval queue with no accept button;
 * that is the request that sat unresolvable while the athlete's weekend stayed
 * wrong.
 *
 * On `(user_id, date, slot)` it is two updates plus a park, and the park is
 * needed only because a row briefly holds a slot the other one wants.
 */
describe('swapEntries', () => {
  const A = { id: 'a', date: '2026-08-29', slot: 0, provenance: null };
  const B = { id: 'b', date: '2026-08-30', slot: 0, provenance: null };

  it('exchanges the two dates', async () => {
    state.rows = [{ ...A }, { ...B }];
    const r = await swapEntries('u1', 'a', 'b');
    expect(r.success).toBe(true);

    const updates = state.ops.filter((o) => o.op === 'update');
    const bMove = updates.find((o) => o.filters.some((f) => f[1] === 'id' && f[2] === 'b'));
    const aMove = updates.filter((o) => o.filters.some((f) => f[1] === 'id' && f[2] === 'a')).pop();
    expect(bMove!.payload).toMatchObject({ date: '2026-08-29', slot: 0 });
    expect(aMove!.payload).toMatchObject({ date: '2026-08-30', slot: 0 });
  });

  it('parks one row first so the two never contend for the same slot', async () => {
    state.rows = [{ ...A }, { ...B }];
    await swapEntries('u1', 'a', 'b');
    const first = state.ops.filter((o) => o.op === 'update')[0];
    expect(first.payload).toEqual({ slot: -1 });
  });

  it('pins both — a swap is a decision about both days', async () => {
    state.rows = [{ ...A }, { ...B }];
    await swapEntries('u1', 'a', 'b');
    const moves = state.ops.filter(
      (o) => o.op === 'update' && (o.payload as { date?: string }).date
    );
    expect(moves).toHaveLength(2);
    for (const m of moves) expect((m.payload as { pinned: boolean }).pinned).toBe(true);
  });

  it('records where each entry began, and keeps the FIRST origin across repeats', async () => {
    state.rows = [
      { ...A, provenance: { original_date: '2026-08-24' } },
      { ...B },
    ];
    await swapEntries('u1', 'a', 'b');
    const aMove = state.ops
      .filter((o) => o.op === 'update' && o.filters.some((f) => f[2] === 'a'))
      .pop();
    expect((aMove!.payload as { provenance: { original_date: string } }).provenance.original_date)
      .toBe('2026-08-24');
  });

  it('swaps two entries on the SAME day by exchanging slots', async () => {
    state.rows = [
      { id: 'a', date: '2026-08-29', slot: 0, provenance: null },
      { id: 'b', date: '2026-08-29', slot: 1, provenance: null },
    ];
    const r = await swapEntries('u1', 'a', 'b');
    expect(r.success).toBe(true);
    const aMove = state.ops
      .filter((o) => o.op === 'update' && o.filters.some((f) => f[2] === 'a'))
      .pop();
    expect(aMove!.payload).toMatchObject({ date: '2026-08-29', slot: 1 });
  });

  it('never requires a plan — no call site passes one', async () => {
    state.rows = [{ ...A }, { ...B }];
    await swapEntries('u1', 'a', 'b');
    for (const op of state.ops) {
      expect(JSON.stringify(op.payload ?? {})).not.toContain('plan_id');
    }
  });

  it('scopes every write to the athlete', async () => {
    state.rows = [{ ...A }, { ...B }];
    await swapEntries('u1', 'a', 'b');
    for (const op of state.ops.filter((o) => o.op === 'update')) {
      expect(op.filters.some((f) => f[1] === 'user_id' && f[2] === 'u1')).toBe(true);
    }
  });

  it('refuses the degenerate cases instead of writing', async () => {
    expect((await swapEntries('', 'a', 'b')).success).toBe(false);
    expect((await swapEntries('u1', 'a', 'a')).success).toBe(false);
    expect((await swapEntries('u1', 'a', '')).success).toBe(false);
    expect(state.ops.filter((o) => o.op === 'update')).toHaveLength(0);
  });

  it('reports a missing entry rather than half-swapping', async () => {
    state.rows = [{ ...A }];
    const r = await swapEntries('u1', 'a', 'b');
    expect(r.success).toBe(false);
    expect(r.error).toContain('no longer exists');
    expect(state.ops.filter((o) => o.op === 'update')).toHaveLength(0);
  });
});

/**
 * The bulk writers, which replaced six hand-rolled `planned_workouts` insert
 * arrays across the activation paths. What matters about them is not that they
 * write, but WHAT THEY REFUSE TO WRITE OVER: activating a plan must never bury
 * a race or a session the athlete put there themselves.
 */
describe('insertSessions', () => {
  const draft = (date: string, title = 'Endurance') => ({ date, title, target_load: 70 });

  it('writes a whole block in one insert, unpinned and stamped with the plan', async () => {
    const r = await insertSessions('u1', [draft('2026-10-01'), draft('2026-10-02')], {
      source: 'plan',
      planId: 'plan-1',
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ inserted: 2, skipped: 0 });

    const rows = lastOp('insert').payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // A generator wrote these, so the athlete has not decided about them.
    expect(rows.every((row) => row.pinned === false)).toBe(true);
    // The plan is provenance on the row, not ownership of it.
    expect(rows.every((row) => row.plan_id === 'plan-1')).toBe(true);
    expect(rows.every((row) => row.user_id === 'u1')).toBe(true);
  });

  it('SKIPS a day that already holds something rather than overwriting it', async () => {
    // The athlete's cyclocross race. Activating a plan over it must not bury it.
    state.rows = [{ id: 'race', date: '2026-10-02', slot: 0, type: 'race', title: 'CycloX' }];

    const r = await insertSessions('u1', [draft('2026-10-01'), draft('2026-10-02')], {});

    expect(r.data).toEqual({ inserted: 1, skipped: 1 });
    const rows = lastOp('insert').payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-10-01');
  });

  it('does not let two drafts on one date collide on slot 0', async () => {
    const r = await insertSessions('u1', [draft('2026-10-01', 'A'), draft('2026-10-01', 'B')], {});
    expect(r.data).toEqual({ inserted: 1, skipped: 1 });
  });

  it('writes nothing at all when every day is taken', async () => {
    state.rows = [{ id: 'x', date: '2026-10-01', slot: 0 }];
    const r = await insertSessions('u1', [draft('2026-10-01')], {});
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ inserted: 0, skipped: 1 });
    expect(state.ops.some((o) => o.op === 'insert')).toBe(false);
  });

  it('drops drafts with no title or no usable date instead of failing the batch', async () => {
    const r = await insertSessions('u1', [
      draft('2026-10-01'),
      { date: '2026-10-02', title: '   ' },
      { date: 'not-a-date', title: 'Nope' },
    ], {});
    expect(r.data?.inserted).toBe(1);
  });

  it('is a no-op without a user', async () => {
    expect((await insertSessions('', [draft('2026-10-01')], {})).success).toBe(false);
    expect(state.ops).toHaveLength(0);
  });
});

describe('upsertSessionOnDate', () => {
  const draft = { title: 'Sweet Spot', workout_id: 'sst', target_load: 80 };

  it('creates when the day is empty, and reports nothing replaced', async () => {
    const r = await upsertSessionOnDate('u1', '2026-10-01', draft, { planId: 'plan-1' });
    expect(r.success).toBe(true);
    expect(r.replacedName).toBeNull();
    expect(lastOp('insert').payload).toMatchObject({ title: 'Sweet Spot', plan_id: 'plan-1' });
  });

  it('replaces the session already there, and names it', async () => {
    state.rows = [{ id: 'old', date: '2026-10-01', slot: 0, type: 'workout', title: 'Recovery Spin' }];
    const r = await upsertSessionOnDate('u1', '2026-10-01', draft, {});
    expect(r.replacedName).toBe('Recovery Spin');
    expect(lastOp('update').payload).toMatchObject({ title: 'Sweet Spot' });
    expect(lastOp('update').filters).toContainEqual(['eq', 'id', 'old']);
  });

  it('NEVER replaces a race — training fills in around a race season', async () => {
    state.rows = [{ id: 'race', date: '2026-10-01', slot: 0, type: 'race', title: 'CycloX' }];
    const r = await upsertSessionOnDate('u1', '2026-10-01', draft, {});
    expect(r.replacedName).toBeNull();
    // It created alongside the race rather than writing over it.
    expect(lastOp('insert').payload).toMatchObject({ title: 'Sweet Spot' });
  });
});

describe('linkEntryToActivity', () => {
  it('writes the ride, the status and the actuals as one fact, and pins', async () => {
    const r = await linkEntryToActivity('u1', 'w1', {
      activityId: 'act-1',
      actualLoad: 92,
      actualDurationMin: 110,
      actualDistanceKm: 48,
      completedAt: '2026-08-30T15:00:00Z',
    });
    expect(r.success).toBe(true);
    const payload = lastOp('update').payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      activity_id: 'act-1',
      status: 'done',
      completed_at: '2026-08-30T15:00:00Z',
      actual_load: 92,
      actual_duration_min: 110,
      actual_distance_km: 48,
      // A session backed by a real ride is not something a generator may reshape.
      pinned: true,
    });
    // A ride cannot leave a stale "you skipped this" behind it.
    expect(payload.skipped_reason).toBeNull();
    expect(lastOp('update').filters).toContainEqual(['eq', 'user_id', 'u1']);
  });

  it('refuses without an activity', async () => {
    const r = await linkEntryToActivity('u1', 'w1', { activityId: '' });
    expect(r.success).toBe(false);
    expect(state.ops).toHaveLength(0);
  });
});

describe('clearing the upcoming calendar', () => {
  it('never touches history or a completed session', async () => {
    await clearUpcomingEntries('u1', '2026-08-30');
    const del = lastOp('delete');
    expect(del.filters).toContainEqual(['eq', 'user_id', 'u1']);
    expect(del.filters).toContainEqual(['gte', 'date', '2026-08-30']);
    expect(del.filters).toContainEqual(['neq', 'status', 'done']);
  });

  it('counts with the same predicate it deletes with', async () => {
    state.rows = [
      { id: 'a', date: '2026-08-31', slot: 0, status: 'planned' },
      { id: 'b', date: '2026-09-01', slot: 0, status: 'planned' },
    ];
    await countUpcomingClearable('u1', '2026-08-30');
    const sel = state.ops.find((o) => o.op === 'select')!;
    expect(sel.filters).toContainEqual(['gte', 'date', '2026-08-30']);
    expect(sel.filters).toContainEqual(['neq', 'status', 'done']);
  });

  it('refuses a bad date rather than deleting an unbounded range', async () => {
    const r = await clearUpcomingEntries('u1', 'whenever');
    expect(r.success).toBe(false);
    expect(state.ops.some((o) => o.op === 'delete')).toBe(false);
  });
});
