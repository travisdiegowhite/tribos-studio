/**
 * The adjudication rule is the safety property of the whole coach-calendar
 * surface, so it is tested as a truth table rather than by example.
 *
 * The rule under test:
 *   creates                       → apply, at ANY count
 *   one untouched, unfinished     → apply
 *   >1 existing entry             → propose
 *   any pinned entry              → propose
 *   any done entry                → propose
 *
 * The failure this guards against is not abstract. The coach turn that started
 * this rebuild reported scheduling ten races and scheduled none; the fix gives
 * it real write access, and the thing that must not follow is a coach that can
 * silently overwrite work the athlete has already done.
 */

import { describe, it, expect } from 'vitest';
import {
  entryHandle,
  buildHandleMap,
  validateOps,
  adjudicateOps,
  describeVerdict,
  CALENDAR_CHANGE_TOOL,
} from './calendarChangeTool.js';

const UUID_A = '1af3bc12-0000-4000-8000-000000000001';
const UUID_B = '9c0e12aa-0000-4000-8000-000000000002';

const entry = (over = {}) => ({
  id: UUID_A, date: '2026-09-01', slot: 0, type: 'workout',
  title: 'Sweet Spot 3x12', status: 'planned', pinned: false, ...over,
});

describe('entryHandle', () => {
  it('derives a stable opaque handle that is not the uuid', () => {
    expect(entryHandle(UUID_A)).toBe('sess_1af3bc12');
    expect(entryHandle(UUID_A)).not.toContain('-');
    expect(entryHandle(UUID_A)).toBe(entryHandle(UUID_A));
  });
});

describe('buildHandleMap', () => {
  it('maps handles back to their entries', () => {
    const { byHandle } = buildHandleMap([entry(), entry({ id: UUID_B })]);
    expect(byHandle.get('sess_1af3bc12').id).toBe(UUID_A);
    expect(byHandle.get('sess_9c0e12aa').id).toBe(UUID_B);
  });

  it('REFUSES a colliding handle rather than guessing which entry was meant', () => {
    // Two different uuids sharing their first 8 hex chars.
    const twinA = 'deadbeef-0000-4000-8000-00000000000a';
    const twinB = 'deadbeef-1111-4000-8000-00000000000b';
    const { byHandle, ambiguous } = buildHandleMap([entry({ id: twinA }), entry({ id: twinB })]);
    expect(ambiguous.has('sess_deadbeef')).toBe(true);
    expect(byHandle.has('sess_deadbeef')).toBe(false);
  });
});

describe('validateOps', () => {
  const { byHandle, ambiguous } = buildHandleMap([entry()]);

  it('accepts a well-formed create', () => {
    const r = validateOps(
      [{ op: 'create', date: '2026-10-04', title: 'Boulder CX #3', type: 'race', reason: 'Season opener.' }],
      byHandle, ambiguous
    );
    expect(r.valid).toBe(true);
    expect(r.resolved[0].entry).toBeNull();
  });

  it('rejects a handle that is not this athlete\'s entry', () => {
    const r = validateOps(
      [{ op: 'delete', handle: 'sess_ffffffff', reason: 'x' }], byHandle, ambiguous
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('not an entry on this athlete');
  });

  it('rejects an ambiguous handle', () => {
    const r = validateOps(
      [{ op: 'delete', handle: 'sess_dupe1234', reason: 'x' }],
      byHandle, new Set(['sess_dupe1234'])
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('more than one entry');
  });

  it('rejects a create with no date and a move with no destination', () => {
    expect(validateOps([{ op: 'create', title: 'x', reason: 'r' }], byHandle).valid).toBe(false);
    expect(validateOps([{ op: 'move', handle: 'sess_1af3bc12', reason: 'r' }], byHandle).valid).toBe(false);
  });

  it('requires a reason on every operation', () => {
    const r = validateOps([{ op: 'create', date: '2026-10-04', title: 'x' }], byHandle);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('reason');
  });

  it('fails the WHOLE list when any one op is bad', () => {
    const r = validateOps([
      { op: 'create', date: '2026-10-04', title: 'Good', reason: 'r' },
      { op: 'delete', handle: 'sess_ffffffff', reason: 'r' },
    ], byHandle, ambiguous);
    expect(r.valid).toBe(false);
  });
});

describe('adjudicateOps — the apply-vs-propose truth table', () => {
  it('applies ONE create', () => {
    expect(adjudicateOps([{ op: 'create', entry: null }]).apply).toBe(true);
  });

  it('applies TEN creates — the cyclocross season case', () => {
    const ops = Array.from({ length: 10 }, () => ({ op: 'create', entry: null }));
    const verdict = adjudicateOps(ops);
    expect(verdict.apply).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it('applies a single change to an untouched, unfinished entry', () => {
    expect(adjudicateOps([{ op: 'move', entry: entry() }]).apply).toBe(true);
  });

  it('proposes when more than one existing entry changes', () => {
    const v = adjudicateOps([
      { op: 'move', entry: entry() },
      { op: 'update', entry: entry({ id: UUID_B }) },
    ]);
    expect(v.apply).toBe(false);
    expect(v.reasonCode).toBe('multi_entry');
  });

  it('proposes when a PINNED entry is touched, even alone', () => {
    const v = adjudicateOps([{ op: 'update', entry: entry({ pinned: true }) }]);
    expect(v.apply).toBe(false);
    expect(v.reasonCode).toBe('pinned');
  });

  it('proposes when a COMPLETED entry is touched, even alone', () => {
    const v = adjudicateOps([{ op: 'delete', entry: entry({ status: 'done' }) }]);
    expect(v.apply).toBe(false);
    expect(v.reasonCode).toBe('completed');
  });

  it('reports mixed when several reasons apply at once', () => {
    const v = adjudicateOps([
      { op: 'update', entry: entry({ pinned: true }) },
      { op: 'delete', entry: entry({ id: UUID_B, status: 'done' }) },
    ]);
    expect(v.apply).toBe(false);
    expect(v.reasonCode).toBe('mixed');
    expect(v.reasons).toEqual(['multi_entry', 'pinned', 'completed']);
  });

  it('does NOT let creates alongside a single edit push it to a proposal', () => {
    const v = adjudicateOps([
      { op: 'create', entry: null },
      { op: 'create', entry: null },
      { op: 'move', entry: entry() },
    ]);
    expect(v.apply).toBe(true);
  });

  it('still proposes when creates accompany a pinned edit', () => {
    const v = adjudicateOps([
      { op: 'create', entry: null },
      { op: 'move', entry: entry({ pinned: true }) },
    ]);
    expect(v.apply).toBe(false);
    expect(v.reasonCode).toBe('pinned');
  });
});

describe('describeVerdict', () => {
  it('tells the model to state an applied change as done', () => {
    expect(describeVerdict({ apply: true, reasons: [] }, 3)).toMatch(/Applied immediately/);
  });

  it('tells the model NOT to claim a withheld change was made', () => {
    const text = describeVerdict({ apply: false, reasons: ['pinned'] }, 0);
    expect(text).toMatch(/NOT applied/);
    expect(text).toMatch(/already adjusted/);
    expect(text).toMatch(/not that you have made it/);
  });
});

describe('CALENDAR_CHANGE_TOOL schema', () => {
  it('gives the model NO way to influence apply-vs-propose', () => {
    const props = CALENDAR_CHANGE_TOOL.input_schema.properties;
    const itemProps = props.operations.items.properties;
    for (const key of Object.keys({ ...props, ...itemProps })) {
      expect(key).not.toMatch(/apply|approve|confirm|force|immediate|propose/i);
    }
  });

  it('exposes race as a first-class entry type', () => {
    expect(CALENDAR_CHANGE_TOOL.input_schema.properties.operations.items.properties.type.enum)
      .toContain('race');
  });
});
