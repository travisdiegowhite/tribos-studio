import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Accepting a coach proposal.
 *
 * The mutations are mocked because this module's job is not to write rows —
 * calendarMutations does that and is tested there — but to decide WHICH writes
 * to make, what to do when a target has vanished since the coach proposed, and
 * what outcome to record. Each of those has a specific failure it prevents:
 *
 *   • re-resolving a target at apply time (check-in-apply.js:297 does exactly
 *     that with 'next_quality', so with any approval delay the athlete accepts
 *     one session and a different one changes);
 *   • treating a deleted target as an error, or worse as a silent success;
 *   • recording 'accepted' on a run where half of it did not land.
 */
const moveEntry = vi.hoisted(() => vi.fn());
const updateEntry = vi.hoisted(() => vi.fn());
const deleteEntry = vi.hoisted(() => vi.fn());
const setEntryStatus = vi.hoisted(() => vi.fn());
const createEntry = vi.hoisted(() => vi.fn());

vi.mock('./calendarMutations', () => ({
  moveEntry: (...a: unknown[]) => moveEntry(...a),
  updateEntry: (...a: unknown[]) => updateEntry(...a),
  deleteEntry: (...a: unknown[]) => deleteEntry(...a),
  setEntryStatus: (...a: unknown[]) => setEntryStatus(...a),
  createEntry: (...a: unknown[]) => createEntry(...a),
}));

/** Rows the calendar currently holds, by id — drives the "still there?" check. */
const live: { ids: Set<string>; updates: Array<Record<string, unknown>>; failSettle?: boolean } = {
  ids: new Set(),
  updates: [],
};

vi.mock('../supabase', () => {
  const makeBuilder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      update: (payload: Record<string, unknown>) => {
        // `filters` is captured by reference, not spread: the real code calls
        // .update(...).eq('id', ...), so the filters arrive AFTER this line.
        live.updates.push({ table, payload, filters });
        return builder;
      },
      maybeSingle: () =>
        Promise.resolve({
          data: live.ids.has(filters.id as string) ? { id: filters.id } : null,
          error: null,
        }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          live.failSettle
            ? { data: null, error: { message: 'rls denied' } }
            : { data: [], error: null },
        ).then(resolve),
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

const { acceptProposal, rejectProposal, describeOp, explainReason } = await import(
  './calendarProposals'
);

const USER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ok = { success: true };

const proposal = (ops: unknown[], over = {}) =>
  ({
    id: 'prop-1',
    user_id: USER,
    reason_code: 'multi_entry',
    summary: 'Swapping your weekend.',
    outcome: 'pending',
    created_at: '2026-08-29T12:00:00Z',
    ops,
    ...over,
  }) as Parameters<typeof acceptProposal>[1];

const moveOp = (id: string, from: string, to: string) => ({
  op: 'move' as const,
  entry_id: id,
  handle: `sess_${id}`,
  before: { title: 'Long Ride', date: from },
  after: { date: to },
  reason: 'Weather looks better Sunday.',
});

beforeEach(() => {
  live.ids = new Set(['w1', 'w2']);
  live.updates = [];
  live.failSettle = undefined;
  for (const m of [moveEntry, updateEntry, deleteEntry, setEntryStatus, createEntry]) {
    m.mockReset();
    m.mockResolvedValue(ok);
  }
});

/** The proposal-table update the run recorded, if any. */
const settled = () => {
  const u = live.updates.find((x) => x.table === 'calendar_change_proposals');
  return u ? { ...(u.payload as object), ...(u.filters as object) } : undefined;
};

describe('acceptProposal — applying the pinned targets', () => {
  it('applies each op against the id the coach pinned, never a re-resolved one', async () => {
    const r = await acceptProposal(
      USER,
      proposal([moveOp('w1', '2026-08-29', '2026-08-30'), moveOp('w2', '2026-08-30', '2026-08-29')]),
    );

    expect(r.applied).toBe(2);
    expect(moveEntry).toHaveBeenNthCalledWith(1, USER, 'w1', '2026-08-30');
    expect(moveEntry).toHaveBeenNthCalledWith(2, USER, 'w2', '2026-08-29');
  });

  it('routes delete, set_status, update and create to their own mutations', async () => {
    await acceptProposal(
      USER,
      proposal([
        { op: 'delete', entry_id: 'w1', handle: null, before: { title: 'A' }, after: null, reason: null },
        { op: 'set_status', entry_id: 'w2', handle: null, before: { title: 'B' }, after: { status: 'skipped' }, reason: null },
        { op: 'update', entry_id: 'w1', handle: null, before: { title: 'A' }, after: { target_load: 60 }, reason: null },
        { op: 'create', entry_id: null, handle: null, before: null, after: { date: '2026-12-05', title: 'CycloX - Longmont', type: 'race' }, reason: null },
      ]),
    );

    expect(deleteEntry).toHaveBeenCalledWith(USER, 'w1');
    expect(setEntryStatus).toHaveBeenCalledWith(USER, 'w2', 'skipped');
    expect(updateEntry).toHaveBeenCalledWith(USER, 'w1', { target_load: 60 });
    expect(createEntry).toHaveBeenCalledWith(
      USER,
      '2026-12-05',
      expect.objectContaining({ title: 'CycloX - Longmont', source: 'coach' }),
    );
  });

  it('records the run as accepted when everything landed', async () => {
    await acceptProposal(USER, proposal([moveOp('w1', '2026-08-29', '2026-08-30')]));
    expect(settled()).toMatchObject({ outcome: 'accepted', id: 'prop-1', user_id: USER });
  });
});

describe('acceptProposal — a target that vanished', () => {
  it('SKIPS an entry the athlete has since deleted, and says so', async () => {
    live.ids = new Set(['w1']); // w2 is gone

    const r = await acceptProposal(
      USER,
      proposal([moveOp('w1', '2026-08-29', '2026-08-30'), moveOp('w2', '2026-08-30', '2026-08-29')]),
    );

    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
    // Not attempted at all — a move against a deleted row is not worth a round trip.
    expect(moveEntry).toHaveBeenCalledTimes(1);
    const skip = r.results.find((x) => x.skipped);
    expect(skip?.error).toMatch(/no longer on your calendar/);
  });

  it('records partial, not accepted, when anything was skipped or failed', async () => {
    live.ids = new Set(['w1']);
    await acceptProposal(
      USER,
      proposal([moveOp('w1', '2026-08-29', '2026-08-30'), moveOp('w2', '2026-08-30', '2026-08-29')]),
    );
    // 'partial' is a real outcome: the athlete has to be able to see later that
    // some of what they accepted did not land.
    expect(settled()).toMatchObject({ outcome: 'partial' });
  });
});

describe('acceptProposal — failures are reported, never swallowed', () => {
  it('keeps going after one op fails, and counts it', async () => {
    moveEntry.mockResolvedValueOnce({ success: false, error: 'slot taken' });

    const r = await acceptProposal(
      USER,
      proposal([moveOp('w1', '2026-08-29', '2026-08-30'), moveOp('w2', '2026-08-30', '2026-08-29')]),
    );

    // The list was adjudicated whole, but one failure must not undo a move
    // that already landed.
    expect(r.failed).toBe(1);
    expect(r.applied).toBe(1);
    expect(r.success).toBe(false);
    expect(moveEntry).toHaveBeenCalledTimes(2);
  });

  it('rejects an op with no target or no date rather than guessing', async () => {
    const r = await acceptProposal(
      USER,
      proposal([
        { op: 'move', entry_id: null, handle: null, before: null, after: { date: '2026-09-01' }, reason: null },
        { op: 'create', entry_id: null, handle: null, before: null, after: { title: 'No date' }, reason: null },
      ]),
    );
    expect(r.applied).toBe(0);
    expect(r.failed).toBe(2);
    expect(moveEntry).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();
  });

  it('reports when the changes landed but the proposal could not be closed', async () => {
    // Otherwise it would stay pending and the athlete would be asked twice.
    const r = await acceptProposal(USER, proposal([moveOp('w1', '2026-08-29', '2026-08-30')]));
    expect(r.applied).toBe(1);
    live.failSettle = true;
    const r2 = await acceptProposal(USER, proposal([moveOp('w1', '2026-08-29', '2026-08-30')]));
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/could not be closed/);
  });

  it('does nothing at all without a user', async () => {
    const r = await acceptProposal('', proposal([moveOp('w1', '2026-08-29', '2026-08-30')]));
    expect(r.success).toBe(false);
    expect(moveEntry).not.toHaveBeenCalled();
  });
});

describe('rejectProposal', () => {
  it('records the decision and touches no calendar row', async () => {
    expect(await rejectProposal(USER, 'prop-1')).toBe(true);
    expect(settled()).toMatchObject({ outcome: 'rejected' });
    for (const m of [moveEntry, updateEntry, deleteEntry, setEntryStatus, createEntry]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

describe('the words shown to the athlete', () => {
  it('describes a move with both of its dates, so "accept" is an informed tap', () => {
    expect(describeOp(moveOp('w1', '2026-08-29', '2026-08-30'))).toBe(
      'Move Long Ride from 2026-08-29 to 2026-08-30',
    );
  });

  it('names each reason the server withheld the change', () => {
    expect(explainReason('multi_entry')).toMatch(/more than one/);
    expect(explainReason('pinned')).toMatch(/already adjusted/);
    expect(explainReason('completed')).toMatch(/already marked done/);
  });
});
