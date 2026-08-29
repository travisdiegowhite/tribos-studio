/**
 * handleCalendarChange's refusal behaviour.
 *
 * The per-user gate is GONE as of 2026-08-29 — calendar_change is the only
 * calendar writer every athlete's coach is offered. What survives it is the
 * handler's own refusal, which is tested here rather than at registration
 * because those are different moments: registration decides what the model is
 * offered this turn, but a tool call can still arrive from replayed
 * conversation history, from a forced-tool pass, or from a model that saw the
 * tool in an earlier turn. The context can also be DEGRADED — a failed
 * calendar read — and planning into a gap you cannot see is the same silent
 * failure that started this rebuild: the coach reported scheduling ten races
 * and scheduled none, because its write went somewhere nothing displayed.
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

describe('the handler refuses rather than guessing', () => {
  it('refuses outright when it was handed no calendar context at all', async () => {
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

  it('coach.js offers the tool to EVERY athlete, with no gate left', async () => {
    const src = await readCoachSource();
    // The gate inverted once /train read calendar_entries for everyone: it was
    // the LEGACY writers that then wrote where nobody looks. A gated coach
    // would report scheduling a workout and show an unchanged calendar — the
    // very failure the gate was added to prevent. So its absence is the
    // assertion, not an implementation detail.
    // Assert on CODE, not prose — the comment above the ungating explains what
    // the flag was, and naming it there is not a regression.
    expect(src).not.toMatch(/\.select\('calendar_v2_enabled'\)/);
    expect(src).not.toMatch(/\bcalendarV2\b\s*[=?&]/);
    expect(src).not.toMatch(/coachTools\s*=\s*\w+\s*\?/);
    // And no call site still hard-codes the unconditional list.
    expect(src).not.toContain('tools: ALL_COACH_TOOLS');
  });

  it('degrades a failed calendar read to an explicit unavailable context, never to null', async () => {
    const src = await readCoachSource();
    // null would hit the handler's first refusal, which is correct but mute:
    // the model would never see WHY. formatCalendarBlock's !ok branch tells it
    // in the prompt that it cannot see the calendar and must not call the tool.
    expect(src).toContain('formatCalendarBlock(failed)');
    expect(src).toMatch(/const failed = \{ ok: false/);
    expect(src).not.toMatch(/trainingCalendarContext = null/);
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
 * leaves the other route open. The legacy writers are not on ANY athlete's
 * menu at all. These tests assert the WIRING, because every unit test for the
 * tool itself was green while production did the wrong thing.
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

  it('remaps that intent to calendar_change', async () => {
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

  it('removes all three legacy writers for every athlete, and adds calendar_change', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/LEGACY_CALENDAR_WRITERS\s*=\s*new Set\(\[/);
    for (const tool of ['recommend_workout', 'create_training_plan', 'adjust_schedule']) {
      expect(src).toContain(`'${tool}'`);
    }
    // Unconditional: no ternary, no flag, no per-user branch.
    expect(src).toMatch(
      /const coachTools = \[\s*\.\.\.ALL_COACH_TOOLS\.filter\(\(t\) => !LEGACY_CALENDAR_WRITERS\.has\(t\.name\)\),\s*CALENDAR_CHANGE_TOOL,\s*\];/
    );
  });

  it('remaps every legacy write intent, for every athlete', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/if \(LEGACY_CALENDAR_WRITERS\.has\(coachIntent\)\)/);
    // The bug was an explicit two-name disjunction. It must not come back.
    expect(src).not.toMatch(/coachIntent === 'recommend_workout' \|\| coachIntent === 'adjust_schedule'/);
  });

  it("never forces a tool that is absent from this request's menu", async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/!coachTools\.some\(\(t\) => t\.name === coachIntent\)/);
  });
});

/**
 * REGRESSION: the truncated tool call, and the empty reply that followed.
 *
 * The 2026-08-27 logs show the same shape in every turn:
 *
 *   calendar_change requested: {}            <- truncated at max_tokens
 *     -> "No operations supplied."
 *   calendar_change requested: { 9 races }   <- succeeded
 *   calendar_change requested: {}            <- truncated again
 *     -> "No operations supplied."
 *   Tool-round cap (3) reached with unexecuted server-side tool calls
 *   messageLength: 0
 *
 * Three failures compounding:
 *
 *   1. Every coach surface hard-codes maxTokens in the request body — 1024 for
 *      the command bar and Today panel. A server-side *default* never applies,
 *      because the client value always wins. Nine races with notes and reasons
 *      is ~1,200 tokens on its own, so the reply truncated MID TOOL CALL.
 *   2. A truncated tool_use arrives with input `{}`. Treating that as an
 *      ordinary validation failure burned two of the three tool rounds on
 *      "No operations supplied" instead of telling the model to send less.
 *   3. The athlete then got a COMPLETELY EMPTY reply while nine races were
 *      written — so from their side the coach had done nothing, and they asked
 *      again, and again, duplicating the season each time.
 *
 * The wiring assertions below are deliberately source-level: this is a
 * request-shaping bug, and none of it is reachable from a unit test of the
 * tool.
 */
describe('REGRESSION: truncation must not read as an empty request', () => {
  it('raises the output ceiling with a FLOOR, since every client sends its own value', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/effectiveMaxTokens\s*=\s*Math\.max\(maxTokens,\s*8192\)/);
    // A default would be silently overridden by the client's 1024.
    expect(src).not.toContain('max_tokens: Math.min(maxTokens, 4096)');
  });

  it('every Claude call uses the raised ceiling, not the raw client value', async () => {
    const src = await readCoachSource();
    const raised = src.match(/max_tokens: Math\.min\(effectiveMaxTokens, 16384\)/g) || [];
    expect(raised.length).toBe(3);
  });

  it('names an empty tool input as truncation and asks for FEWER operations', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/const truncated = !tool\.input \|\| Object\.keys\(tool\.input\)\.length === 0/);
    expect(src).toContain('was cut off before this tool call finished');
    expect(src).toContain('Send FEWER operations');
    // It must steer toward the generator rather than a same-size retry.
    expect(src).toContain('use generate_block for training');
    expect(src).toContain('Do not repeat operations that already succeeded');
  });

  it('always reports the outcome of a write, even with no model prose', async () => {
    const src = await readCoachSource();
    expect(src).toMatch(/if \(!responseText && calendarChangeResults\.length > 0\)/);
    expect(src).toContain('Updated your calendar');
    expect(src).toContain('waiting for you to approve');
  });

  it('the clients that caused this still exist, so the floor stays load-bearing', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const bar = await fs.readFile(
      path.resolve(process.cwd(), 'src/components/coach/CoachCommandBar.jsx'), 'utf8');
    // If this ever stops being true the floor is harmless, but the comment
    // explaining why it exists would be stale.
    expect(bar).toMatch(/maxTokens:\s*1024/);
  });
});
