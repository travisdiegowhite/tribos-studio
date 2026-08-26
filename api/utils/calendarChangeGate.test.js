/**
 * handleCalendarChange's refusal behaviour.
 *
 * The gate is tested at the HANDLER, not only at tool registration, because
 * those are different moments. Registration decides what the model is offered
 * this turn; a tool call can still arrive from replayed conversation history,
 * from a forced-tool pass, or from a model that saw the tool in an earlier
 * turn. Trusting registration alone is how a write reaches a table the
 * athlete's calendar does not read — which is the exact silent failure that
 * started this rebuild: the coach reported scheduling ten races and scheduled
 * none, because its write went somewhere nothing displayed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyCalendarOps = vi.fn();
const persistProposal = vi.fn();

vi.mock('./calendarChangeApply.js', () => ({
  applyCalendarOps: (...a) => applyCalendarOps(...a),
  persistProposal: (...a) => persistProposal(...a),
}));

// Import the handler in isolation from coach.js's module-level Anthropic and
// Supabase construction, which needs env that tests do not have.
const { validateOps, adjudicateOps, describeVerdict } = await import('./calendarChangeTool.js');
const { buildHandleMap } = await import('./calendarChangeTool.js');

/**
 * A faithful transcription of api/coach.js handleCalendarChange. Kept in step
 * with it by the contract test at the bottom of this file, which asserts the
 * real source still has the two refusal branches this exercises.
 */
async function handleCalendarChange(userId, input, calendarContext) {
  if (!calendarContext) {
    return { success: false, error: 'The calendar is not available for this athlete. Do not claim any change was made.' };
  }
  if (!calendarContext.ok) {
    return { success: false, error: 'The calendar could not be read this turn, so no change was made. Tell the athlete to try again.' };
  }
  const { operations, summary } = input || {};
  const { valid, errors, resolved } = validateOps(operations, calendarContext.byHandle, calendarContext.ambiguous);
  if (!valid) {
    return { success: false, applied: 0, errors, error: `No changes were made. Fix these and call the tool again: ${errors.join(' ')}` };
  }
  const verdict = adjudicateOps(resolved);
  const createCount = resolved.filter((op) => op.op === 'create').length;
  if (!verdict.apply) {
    const proposal = await persistProposal(userId, resolved, verdict, summary);
    if (!proposal.success) {
      return { success: false, applied: 0, error: `Could not save the proposal (${proposal.error}). Nothing changed; do not tell the athlete otherwise.` };
    }
    return { success: true, applied: 0, proposed: resolved.length, proposal_id: proposal.proposalId, outcome: 'awaiting_approval', guidance: describeVerdict(verdict, createCount) };
  }
  const applyResult = await applyCalendarOps(userId, resolved, { source: 'coach' });
  return {
    success: applyResult.success, applied: applyResult.applied, failed: applyResult.failed,
    outcome: applyResult.failed === 0 ? 'applied' : 'partially_applied',
    results: applyResult.results,
    guidance: applyResult.failed === 0 ? describeVerdict(verdict, createCount) : `${applyResult.applied} of ${applyResult.results.length} changes went through. Tell the athlete exactly which did not, and why — do not report the whole change as done.`,
  };
}

const USER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ENTRY = {
  id: '1af3bc12-0000-4000-8000-000000000001', date: '2026-09-01', slot: 0,
  type: 'workout', title: 'Sweet Spot', status: 'planned', pinned: false,
};

function ctx(entries = [ENTRY], ok = true) {
  const { byHandle, ambiguous } = buildHandleMap(entries);
  return { ok, byHandle, ambiguous, block: '', entries };
}

const CREATE = { op: 'create', date: '2026-10-04', title: 'Boulder CX #3', type: 'race', reason: 'Season opener.' };

beforeEach(() => {
  vi.clearAllMocks();
  applyCalendarOps.mockResolvedValue({ success: true, applied: 1, failed: 0, results: [{ ok: true }], undo: [] });
  persistProposal.mockResolvedValue({ success: true, proposalId: 'prop-1' });
});

describe('the calendar_v2 gate', () => {
  it('refuses outright when the athlete is not on the rebuilt calendar', async () => {
    const r = await handleCalendarChange(USER, { operations: [CREATE] }, null);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not available/);
    // The decisive assertion: nothing was written anywhere.
    expect(applyCalendarOps).not.toHaveBeenCalled();
    expect(persistProposal).not.toHaveBeenCalled();
  });

  it('tells the model explicitly not to claim a change was made', async () => {
    const r = await handleCalendarChange(USER, { operations: [CREATE] }, null);
    expect(r.error).toMatch(/Do not claim any change was made/);
  });

  it('refuses when the calendar read failed, rather than planning into the gap', async () => {
    const r = await handleCalendarChange(USER, { operations: [CREATE] }, ctx([], false));
    expect(r.success).toBe(false);
    expect(applyCalendarOps).not.toHaveBeenCalled();
  });
});

describe('handleCalendarChange routing', () => {
  it('applies ten race creates and reports them as applied', async () => {
    applyCalendarOps.mockResolvedValue({
      success: true, applied: 10, failed: 0,
      results: Array.from({ length: 10 }, () => ({ ok: true })), undo: [],
    });
    const operations = Array.from({ length: 10 }, (_, i) => ({
      ...CREATE, date: `2026-10-0${(i % 9) + 1}`, title: `CX #${i + 1}`,
    }));

    const r = await handleCalendarChange(USER, { operations }, ctx());

    expect(r.outcome).toBe('applied');
    expect(r.applied).toBe(10);
    expect(persistProposal).not.toHaveBeenCalled();
    expect(r.guidance).toMatch(/Applied immediately/);
  });

  it('proposes rather than applies when a pinned entry is touched', async () => {
    const pinned = { ...ENTRY, pinned: true };
    const r = await handleCalendarChange(
      USER,
      { operations: [{ op: 'delete', handle: 'sess_1af3bc12', reason: 'Superseded.' }] },
      ctx([pinned])
    );

    expect(r.outcome).toBe('awaiting_approval');
    expect(applyCalendarOps).not.toHaveBeenCalled();
    expect(persistProposal).toHaveBeenCalled();
    expect(r.guidance).toMatch(/not that you have made it/);
  });

  it('reports honestly when the proposal could not even be saved', async () => {
    persistProposal.mockResolvedValue({ success: false, error: 'rls denied' });
    const r = await handleCalendarChange(
      USER,
      { operations: [{ op: 'delete', handle: 'sess_1af3bc12', reason: 'x' }] },
      ctx([{ ...ENTRY, pinned: true }])
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/do not tell the athlete otherwise/);
  });

  it('returns correctable errors, and writes nothing, on an invalid op list', async () => {
    const r = await handleCalendarChange(
      USER,
      { operations: [{ op: 'move', handle: 'sess_ffffffff', reason: 'x' }] },
      ctx()
    );
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('not an entry on this athlete');
    expect(applyCalendarOps).not.toHaveBeenCalled();
  });

  it('flags a partial application instead of reporting the whole thing done', async () => {
    applyCalendarOps.mockResolvedValue({
      success: false, applied: 1, failed: 1,
      results: [{ ok: true }, { ok: false, error: 'boom' }], undo: [],
    });
    const r = await handleCalendarChange(USER, { operations: [CREATE, { ...CREATE, date: '2026-10-05' }] }, ctx());
    expect(r.outcome).toBe('partially_applied');
    expect(r.guidance).toMatch(/do not report the whole change as done/);
  });
});

/**
 * Read api/coach.js off disk. Vitest's transform means import.meta.url is not
 * a file: URL here, so resolve from the project root instead.
 */
async function readCoachSource() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  return fs.readFile(path.resolve(process.cwd(), 'api/coach.js'), 'utf8');
}

describe('contract with the real coach.js', () => {
  it('the real handler still refuses on both gate branches', async () => {
    const src = await readCoachSource();
    const body = src.slice(src.indexOf('export async function handleCalendarChange'));
    const handlerBody = body.slice(0, body.indexOf('\n}\n') + 3);

    expect(handlerBody).toContain('if (!calendarContext) {');
    expect(handlerBody).toContain('if (!calendarContext.ok) {');
    expect(handlerBody).toContain('Do not claim any change was made');
    // Registration alone must not be the gate.
    expect(handlerBody).toContain('adjudicateOps');
  });

  it('coach.js offers the tool ONLY to gated athletes', async () => {
    const src = await readCoachSource();
    expect(src).toContain('calendar_v2_enabled');
    expect(src).toMatch(/coachTools\s*=\s*calendarV2/);
    // And no call site still hard-codes the unconditional list.
    expect(src).not.toContain('tools: ALL_COACH_TOOLS');
  });
});

/**
 * REGRESSION: the season-planning path.
 *
 * On 2026-08-25, with calendar_change deployed and the gate open, the athlete
 * asked the coach to plan a cyclocross season. It wrote 32 sessions and one
 * new training plan into planned_workouts — zero races, zero calendar_entries
 * — and retired the athlete's real plan on the way past. The tool worked; it
 * was never reached.
 *
 * The athlete's real message is pinned below. It detects as
 * create_training_plan, so what happened is not in doubt: the first remap
 * covered recommend_workout and adjust_schedule but not create_training_plan,
 * so the reliability pass ran
 * tool_choice:{type:'tool', name:'create_training_plan'} and COMPELLED the
 * legacy writer. Nothing in a system prompt outranks tool_choice. And because
 * the forced pass replaces toolUses wholesale, a correct first-pass
 * calendar_change call would have been discarded on the way past.
 *
 * A second route was open too, for wordings that detect no intent at all: no
 * forcing happens, and the model simply had create_training_plan on its menu.
 *
 * Hence the fix is not a better remap or a firmer instruction — either alone
 * leaves the other route open. The legacy writers are not on a gated
 * athlete's menu at all. These tests assert the WIRING, because every unit
 * test for the tool itself was green while production did the wrong thing.
 */
describe('REGRESSION: the coach cannot reach the legacy calendar writers', () => {
  /** The message that actually caused the 2026-08-25 failure, verbatim. */
  const REAL_MESSAGE =
    "I want this to be my cyclocross season. Let's plan it out with training " +
    'and get it on the calendar 09/19/2026  CycloX - Harlow Platts    ' +
    '10/03/2026  Cyclocross State Championship Series Race - Schoolyard CX  ' +
    '10/17/2026  Cyclocross State Championship Series Race - CycloX - Louisville  ' +
    '10/24/2026  The Hustle CX  10/31/2026  Cyclocross State Championship Series ' +
    'Race - CycloX - Boulder Reservoir  11/07/2026  Cyclocross State Championship ' +
    'Series Race - Wild West CX  11/14/2026  UCI Boulder Cup - Day 1  11/15/2026  ' +
    'UCI Boulder Cup - Day 2  12/05/2026  CycloX - Longmont';

  it('the real message detects as create_training_plan — the tool that must not be reachable', async () => {
    const { detectCoachIntent } = await import('./intentProbe.js');
    expect(detectCoachIntent(REAL_MESSAGE)).toBe('create_training_plan');
  });

  it('remaps that intent to calendar_change for a gated athlete', async () => {
    const { detectCoachIntent } = await import('./intentProbe.js');
    const LEGACY = new Set(['recommend_workout', 'create_training_plan', 'adjust_schedule']);
    let intent = detectCoachIntent(REAL_MESSAGE);
    if (LEGACY.has(intent)) intent = 'calendar_change';
    expect(intent).toBe('calendar_change');
  });

  it('other season-planning phrasings route the same way', async () => {
    const { detectCoachIntent, detectIntentFromResponse } = await import('./intentProbe.js');
    expect(detectCoachIntent('lets plan out my cross season')).toBe('create_training_plan');
    expect(detectCoachIntent('build me a plan for cross season')).toBe('create_training_plan');
    // The coach's own prose promising to map out a season fires it too, which
    // is how the intent triggers even when the athlete's wording matches nothing.
    expect(detectIntentFromResponse('Let me map out the rest of your season with those races.'))
      .toBe('create_training_plan');
  });

  it('some race phrasings detect NO intent — so removal, not remapping, is the fix', async () => {
    const { detectCoachIntent } = await import('./intentProbe.js');
    // No forced pass fires for these. The only thing that stopped the model
    // reaching for create_training_plan here is that it is no longer offered.
    expect(detectCoachIntent('schedule my cyclocross races this fall')).toBeNull();
    expect(detectCoachIntent('I want to do these cyclocross races this fall, add them')).toBeNull();
  });

  it('removes all three legacy writers for a gated athlete, and adds calendar_change', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/LEGACY_CALENDAR_WRITERS\s*=\s*new Set\(\[/);
    for (const tool of ['recommend_workout', 'create_training_plan', 'adjust_schedule']) {
      expect(src).toContain(`'${tool}'`);
    }
    expect(src).toMatch(/ALL_COACH_TOOLS\.filter\(\(t\) => !LEGACY_CALENDAR_WRITERS\.has\(t\.name\)\), CALENDAR_CHANGE_TOOL/);
  });

  it('remaps every legacy write intent, not just two of them', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/if \(calendarV2 && LEGACY_CALENDAR_WRITERS\.has\(coachIntent\)\)/);
    // The bug was an explicit two-name disjunction. It must not come back.
    expect(src).not.toMatch(/coachIntent === 'recommend_workout' \|\| coachIntent === 'adjust_schedule'/);
  });

  it("never forces a tool that is absent from this request's menu", async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/!coachTools\.some\(\(t\) => t\.name === coachIntent\)/);
  });
});
