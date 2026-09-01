import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();
const getUser = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    constructor() {
      this.messages = { create: messagesCreate };
    }
  },
}));

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null),
  rateLimitByUser: vi.fn().mockResolvedValue(null),
}));
vi.mock('./utils/aiQuota.js', () => ({
  enforceAiQuota: vi.fn().mockResolvedValue(null),
  enforceGlobalAiQuota: vi.fn().mockResolvedValue(null),
}));
vi.mock('./utils/calendarHelper.js', () => ({ fetchCalendarContext: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/contextHelpers.js', () => ({
  formatHealth: () => 'No health data available.',
  fetchProprietaryMetrics: vi.fn().mockResolvedValue(null),
}));
const fetchAnchorMock = vi.fn();
vi.mock('./utils/temporalAnchor.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // keep the real sanitizeSessionIds/buildSessionLabelMap
    buildTemporalAnchor: () => 'ANCHOR',
    fetchTemporalAnchorData: fetchAnchorMock,
  };
});
const buildEnrichmentBlock = vi.fn();
vi.mock('./utils/coachContextEnrichment.js', () => ({
  fetchCoachEnrichmentData: vi.fn().mockResolvedValue(null),
  buildCoachEnrichmentBlock: (...args) => buildEnrichmentBlock(...args),
}));
const applyCalendarOps = vi.fn();
const persistProposal = vi.fn();
vi.mock('./utils/calendarChangeApply.js', () => ({
  applyCalendarOps: (...a) => applyCalendarOps(...a),
  persistProposal: (...a) => persistProposal(...a),
}));
vi.mock('./utils/personaData.js', () => ({
  PERSONA_DATA: { hammer: { name: 'The Hammer', voice: 'Direct, brief, no filler.' } },
}));

// Chainable Supabase stub: any await resolves to an empty list, maybeSingle to null.
function chain() {
  const obj = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'is', 'gte', 'lte', 'in', 'or', 'insert', 'update', 'upsert', 'single']) {
    obj[m] = () => obj;
  }
  obj.maybeSingle = () => Promise.resolve({ data: null, error: null });
  obj.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
  return obj;
}

// Per-test override for `from`, so a test can simulate a real plan + workout write.
let fromOverride = null;

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from: (table) => (fromOverride ? fromOverride(table) : chain()),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const coachModule = await import('./coach.js');
const handler = coachModule.default;
const {
  detectCoachIntent,
  detectIntentFromResponse,
  handleScheduleAdjustment,
  resolveScheduledDate,
  swapWorkoutDates,
} = coachModule;

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end() { return this; },
  };
}

function makeReq(body) {
  return { method: 'POST', headers: { authorization: 'Bearer tok' }, body };
}

const textResponse = (text) => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 5, output_tokens: 8 },
});

const calendarToolResponse = (text, operations) => ({
  content: [
    ...(text ? [{ type: 'text', text }] : []),
    {
      type: 'tool_use',
      id: 'tc1',
      name: 'calendar_change',
      input: {
        operations: operations || [{
          op: 'create',
          date: '2026-09-15',
          title: 'Recovery Spin',
          type: 'workout',
          workout_id: 'recovery_spin',
          reason: 'Easy day.',
        }],
        summary: 'One easy spin.',
      },
    },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
});

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  fromOverride = null;
  buildEnrichmentBlock.mockReset();
  buildEnrichmentBlock.mockReturnValue(null);
  fetchAnchorMock.mockReset();
  fetchAnchorMock.mockResolvedValue({ plannedWorkouts: [], raceGoals: [] });
  applyCalendarOps.mockReset();
  persistProposal.mockReset();
  applyCalendarOps.mockResolvedValue({
    success: true, applied: 1, failed: 0, deduped: 0,
    results: [{ ok: true, op: 'create', created: 1 }], undo: [],
  });
  persistProposal.mockResolvedValue({ success: true, proposalId: 'prop-1' });
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('detectCoachIntent', () => {
  it.each([
    ['what should I ride today', 'recommend_workout'],
    ['add a workout for tomorrow', 'recommend_workout'],
    ['recommend a recovery ride', 'recommend_workout'],
    // Add-to-calendar follow-ups that reference a just-recommended workout.
    ['Can you add that to the calendar', 'recommend_workout'],
    ['schedule it for tomorrow', 'recommend_workout'],
    ['put this on my calendar', 'recommend_workout'],
    // Plural "add the workouts" activates a whole plan, not a single workout.
    ['add the workouts to my calendar', 'create_training_plan'],
    // Weekly / schedule planning → a full plan preview.
    ['can you plan my workouts for the rest of the week', 'create_training_plan'],
    ['plan out the workout schedule', 'create_training_plan'],
    ['map out the rest of my week', 'create_training_plan'],
    ['plan my week', 'create_training_plan'],
    ['build me a training plan for my race', 'create_training_plan'],
    ['create an 8 week plan', 'create_training_plan'],
    ['prepare me for my gran fondo', 'create_training_plan'],
    ['move my Thursday workout to Saturday', 'adjust_schedule'],
    ['I can\'t train on Friday', 'adjust_schedule'],
    ['swap Monday and Wednesday', 'adjust_schedule'],
    ['give me a rest day tomorrow', 'adjust_schedule'],
    ['how is my fitness trending?', null],
    ['what is RSS?', null],
    ['', null],
  ])('classifies "%s" as %s', (msg, expected) => {
    expect(detectCoachIntent(msg)).toBe(expected);
  });
});

describe('detectIntentFromResponse', () => {
  it.each([
    // Action promises the model makes in prose — these must map to the tool it failed to call.
    ['Let me get that Sweet Spot on the calendar for tomorrow and map out the rest of your week.', 'create_training_plan'],
    ["18 days out — let's build the final block into Summer Vibes right now.", 'create_training_plan'],
    ["I'll map out the rest of your week with a few endurance rides.", 'create_training_plan'],
    ['Let me get that recovery spin on the calendar for tomorrow.', 'recommend_workout'],
    ["I'll move your Thursday workout to Saturday.", 'adjust_schedule'],
    // Descriptive / non-promise prose must NOT trip a forced tool pass.
    ['Your fitness is trending up nicely.', null],
    ['Nice work on that plan!', null],
    ['That sweet spot session was a solid effort.', null],
    ['', null],
  ])('classifies response "%s" as %s', (text, expected) => {
    expect(detectIntentFromResponse(text)).toBe(expected);
  });
});

/**
 * The forced tool pass, after the 2026-08-29 ungating.
 *
 * calendar_change is the ONLY calendar writer now, for every athlete — the
 * three legacy writers (recommend_workout, create_training_plan,
 * adjust_schedule) are off the menu, so the model cannot emit them and every
 * legacy write INTENT is remapped onto calendar_change before the forced pass
 * names a tool. That remap is the load-bearing part: tool_choice COMPELS a
 * named tool, so forcing a legacy name would write planned_workouts, which no
 * calendar reads, and report success.
 */
describe('coach handler — forced tool pass', () => {
  it('does not re-call when Claude already used the right tool', async () => {
    messagesCreate
      .mockResolvedValueOnce(calendarToolResponse('Here is an easy spin.'))
      .mockResolvedValueOnce(textResponse('Added a recovery spin on the 15th.'));
    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    // Two calls: the first pass, then the continuation that reports the result.
    // No FORCED pass — no tool_choice on either.
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    expect(messagesCreate.mock.calls[0][0].tool_choice).toBeUndefined();
    expect(messagesCreate.mock.calls[1][0].tool_choice).toBeUndefined();
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
  });

  it('writes a recommended workout to the CALENDAR, not to planned_workouts', async () => {
    // The regression this replaces: the coach used to answer "what should I
    // ride today" by writing planned_workouts, a table /train no longer reads
    // for anyone. It reported "Added Sweet Spot for tomorrow" and the athlete
    // saw an unchanged calendar.
    const writes = [];
    fromOverride = (table) => {
      const c = chain();
      for (const m of ['insert', 'update', 'upsert']) {
        c[m] = (payload) => {
          writes.push([table, m, payload]);
          return c;
        };
      }
      return c;
    };
    messagesCreate
      .mockResolvedValueOnce(calendarToolResponse('Easy spin coming up.'))
      .mockResolvedValueOnce(textResponse('Added a recovery spin on the 15th.'));

    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
    const [userId, ops, opts] = applyCalendarOps.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(ops[0].op).toBe('create');
    expect(opts.source).toBe('coach');
    // Nothing was written through the legacy plan path. training_plans is still
    // READ for context every turn, so the assertion is about writes.
    expect(res.body.workoutRecommendations).toBeNull();
    expect(writes.filter(([t]) => t === 'planned_workouts')).toHaveLength(0);
    expect(writes.filter(([t]) => t === 'training_plans')).toHaveLength(0);
  });

  it('re-calls forcing calendar_change when the first pass was prose-only', async () => {
    messagesCreate
      .mockResolvedValueOnce(textResponse('You should do an easy spin tomorrow.'))
      .mockResolvedValueOnce(calendarToolResponse(null))
      .mockResolvedValueOnce(textResponse('Done.'));

    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(3);
    // The intent detects as recommend_workout and MUST be remapped before it
    // reaches tool_choice — forcing the legacy name would compel a write to a
    // table nothing displays.
    expect(messagesCreate.mock.calls[1][0].tool_choice).toEqual({ type: 'tool', name: 'calendar_change' });
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
    // The CONTINUATION's prose is the reply, not the first pass's — it is the
    // only turn written with the tool result in hand, so it is the only one
    // that can honestly say what happened.
    expect(res.body.message).toBe('Done.');
  });

  it('never offers the legacy calendar writers on any request', async () => {
    messagesCreate.mockResolvedValueOnce(textResponse('Your fitness is trending up nicely.'));
    const res = makeRes();
    await handler(makeReq({ message: 'how is my fitness trending?' }), res);

    expect(res.statusCode).toBe(200);
    const names = messagesCreate.mock.calls[0][0].tools.map((t) => t.name);
    expect(names).toContain('calendar_change');
    expect(names).not.toContain('recommend_workout');
    expect(names).not.toContain('create_training_plan');
    expect(names).not.toContain('adjust_schedule');
  });

  it('does not force a tool for a general question', async () => {
    messagesCreate.mockResolvedValueOnce(textResponse('Your fitness is trending up nicely.'));
    const res = makeRes();
    await handler(makeReq({ message: 'how is my fitness trending?' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.workoutRecommendations).toBeNull();
  });

  it('forces calendar_change when the coach promised a PLAN in prose only', async () => {
    // The 2026-08-25 failure in miniature. The user message has no plan
    // keyword; the coach's PROSE promises to build a block but calls no tool,
    // so response-based intent fires — and it detects as create_training_plan.
    // Forcing that name is what wrote 32 sessions and zero races into
    // planned_workouts and retired the athlete's real plan on the way past.
    messagesCreate
      .mockResolvedValueOnce(textResponse("18 days out — let's build the final block into Summer Vibes right now."))
      .mockResolvedValueOnce(calendarToolResponse(null))
      .mockResolvedValueOnce(textResponse('Block is on your calendar.'));

    const res = makeRes();
    await handler(makeReq({ message: 'looking forward to Summer Vibes' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(3);
    expect(messagesCreate.mock.calls[1][0].tool_choice).toEqual({ type: 'tool', name: 'calendar_change' });
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
    expect(res.body.trainingPlanPreview).toBeNull();
  });

  it('builds a multi-week block on the calendar, activating no plan', async () => {
    // "build me a training plan" used to auto-activate a training_plans row and
    // fan its workouts into planned_workouts. The calendar no longer belongs to
    // a plan, so a block is just entries — and generate_block is how the coach
    // expresses one without truncating on a create-per-session list.
    applyCalendarOps.mockResolvedValue({
      success: true, applied: 0, failed: 0, deduped: 0,
      results: [{ ok: true, op: 'generate_block', created: 32 }], undo: [],
    });
    messagesCreate
      .mockResolvedValueOnce(calendarToolResponse(
        'Building your general-fitness block.',
        [{
          op: 'generate_block',
          from: '2026-10-01',
          to: '2026-12-03',
          weekly_pattern: [{ day: 'tue', title: 'Threshold', type: 'workout', target_load: 80 }],
          reason: 'General fitness block.',
        }]
      ))
      .mockResolvedValueOnce(textResponse('32 sessions from October to December.'));

    const res = makeRes();
    await handler(makeReq({ message: 'build me a training plan' }), res);

    expect(res.statusCode).toBe(200);
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
    expect(applyCalendarOps.mock.calls[0][1][0].op).toBe('generate_block');
    expect(res.body.trainingPlanPreview).toBeNull();
    expect(res.body.autoActivatedPlan).toBeNull();
  });

  /**
   * The three LIVING ARC tests that stood here are gone with
   * create_training_plan, the tool that reached the arc builder. Nothing in
   * the coach can emit that tool now, so the auto-activation path, its
   * persona-voiced explanation and the fact-leak guard on that explanation are
   * all unreachable — the tests would have been asserting on dead code.
   *
   * The arc builder itself is untouched and still tested in
   * api/utils/arcBuilder.test.js; what is gone is only the coach entry point
   * into it. Building a multi-week block is a generate_block operation now,
   * covered above.
   */

  it('dates prior-day history messages and leaves today/undated ones untouched', async () => {
    messagesCreate.mockResolvedValueOnce(textResponse('Your fitness is trending up nicely.'));

    // resolvedTimezone falls back to UTC (no userLocalDate.timezone, stub profile
    // has no timezone), so build the day boundary in UTC. Anchor timestamps to
    // UTC noon so the test can never flake across a midnight rollover.
    const todayUtc = new Date().toISOString().split('T')[0];
    const yesterdayNoon = new Date(Date.parse(`${todayUtc}T12:00:00Z`) - 24 * 60 * 60 * 1000).toISOString();
    const todayNoonstamp = `${todayUtc}T12:00:00.000Z`;

    const res = makeRes();
    await handler(
      makeReq({
        message: 'how is my fitness trending?',
        conversationHistory: [
          { role: 'user', content: 'how was my ride?', timestamp: yesterdayNoon },
          { role: 'assistant', content: "today's tempo work landed well", timestamp: yesterdayNoon },
          { role: 'user', content: 'thanks coach', timestamp: todayNoonstamp },
          { role: 'assistant', content: 'anytime' },
          { role: 'user', content: 'one more thing', timestamp: 'not-a-date' },
        ],
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const sent = messagesCreate.mock.calls[0][0].messages;
    // Prior-day messages get a "[Mon Jul 21]"-style prefix.
    expect(sent[0].content).toMatch(/^\[\w{3} \w{3} \d{1,2}\] how was my ride\?$/);
    expect(sent[1].content).toMatch(/^\[\w{3} \w{3} \d{1,2}\] today's tempo work landed well$/);
    // Same-day, undated, and invalid-timestamp messages pass through unchanged.
    expect(sent[2].content).toBe('thanks coach');
    expect(sent[3].content).toBe('anytime');
    expect(sent[4].content).toBe('one more thing');
    // The current user turn keeps its [Today is …] prefix.
    expect(sent[5].content).toMatch(/^\[Today is /);
    // The system prompt explains the markers.
    expect(messagesCreate.mock.calls[0][0].system).toContain('occurred on a PREVIOUS day');
  });

  it('scrubs internal sess_ ids from the reply, replacing known ids with the session description', async () => {
    fetchAnchorMock.mockResolvedValue({
      plannedWorkouts: [
        {
          id: 'b9949240-1111-2222-3333-444455556666',
          scheduled_date: '2026-07-25',
          name: 'Endurance Ride',
          workout_type: 'endurance',
          target_duration: 75,
        },
      ],
      raceGoals: [],
    });
    messagesCreate.mockResolvedValueOnce(
      textResponse("Tomorrow's session (sess_b9949240) is key. Ignore sess_deadbeef.")
    );

    const res = makeRes();
    await handler(makeReq({ message: 'how is my fitness trending?' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).not.toMatch(/sess_/);
    expect(res.body.message).toContain('1h15m Endurance Ride');
    expect(res.body.message).toContain('the scheduled session');
  });

  it('injects the server training snapshot block into the system prompt', async () => {
    buildEnrichmentBlock.mockReturnValue(
      '=== SERVER TRAINING SNAPSHOT (DB-VERIFIED) ===\nFTP: 285W'
    );
    messagesCreate.mockResolvedValueOnce(textResponse('Your fitness is trending up nicely.'));

    const res = makeRes();
    await handler(makeReq({ message: 'how is my fitness trending?' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate.mock.calls[0][0].system).toContain('SERVER TRAINING SNAPSHOT (DB-VERIFIED)');
    expect(messagesCreate.mock.calls[0][0].system).toContain('FTP: 285W');
  });

  it('injects the coaching-bible behavior floor into the system prompt', async () => {
    messagesCreate.mockResolvedValueOnce(textResponse('Ride easy today.'));

    const res = makeRes();
    await handler(makeReq({ message: 'what should I do today?' }), res);

    expect(res.statusCode).toBe(200);
    const system = messagesCreate.mock.calls[0][0].system;
    expect(system).toContain("=== WHO YOU'RE COACHING ===");
    expect(system).toContain('=== WHAT APPLIES TODAY ===');
    expect(system).toContain('=== BEHAVIOR FLOOR — APPLIES ALWAYS, IN EVERY PERSONA ===');
    // Phase 1 fires no rules, and says so rather than leaving a gap.
    expect(system).toContain('No specific rule fires today');
    // The calendar block keeps the last word (see the comment at its site).
    expect(system.lastIndexOf('=== CALENDAR TOOL — READ THIS LAST ===')).toBeGreaterThan(
      system.lastIndexOf('=== BEHAVIOR FLOOR — APPLIES ALWAYS, IN EVERY PERSONA ===')
    );
  });

  it('scopes the prompt to the race the athlete is viewing (raceGoalId)', async () => {
    fetchAnchorMock.mockResolvedValue({
      plannedWorkouts: [],
      raceGoals: [
        { id: 'g1', name: 'Acreage Criterium', race_date: '2026-08-20', priority: 'B' },
        { id: 'g2', name: 'The Rad', race_date: '2026-09-26', priority: 'A' },
      ],
    });
    messagesCreate.mockResolvedValueOnce(textResponse('Here is your climb strategy.'));

    const res = makeRes();
    await handler(makeReq({ message: 'how should I pace the climb?', raceGoalId: 'g1' }), res);

    expect(res.statusCode).toBe(200);
    const system = messagesCreate.mock.calls[0][0].system;
    expect(system).toContain('=== ACTIVE RACE FOCUS ===');
    expect(system).toContain('"Acreage Criterium" on 2026-08-20');
    expect(system).toContain('never mix races');
    // The enrichment builder is told which race is selected.
    expect(buildEnrichmentBlock.mock.calls[0][1].selectedRaceGoalId).toBe('g1');
  });

  it('adds no race focus block for an unknown or absent raceGoalId', async () => {
    fetchAnchorMock.mockResolvedValue({
      plannedWorkouts: [],
      raceGoals: [{ id: 'g1', name: 'Acreage Criterium', race_date: '2026-08-20', priority: 'B' }],
    });
    messagesCreate.mockResolvedValue(textResponse('Sure.'));

    const res1 = makeRes();
    await handler(makeReq({ message: 'hello coach', raceGoalId: 'nope' }), res1);
    expect(messagesCreate.mock.calls[0][0].system).not.toContain('ACTIVE RACE FOCUS');

    const res2 = makeRes();
    await handler(makeReq({ message: 'hello coach' }), res2);
    expect(messagesCreate.mock.calls[1][0].system).not.toContain('ACTIVE RACE FOCUS');
  });

  it('never returns a blank bubble when a calendar change produced no prose', async () => {
    // The 2026-08-27 failure: nine races written, messageLength 0. The tool
    // that used to stand in for this case (recommend_workout) is gone, but
    // the property is the same and now covers the tool that replaced it.
    messagesCreate
      .mockResolvedValueOnce(calendarToolResponse(null))
      .mockResolvedValueOnce(textResponse(''));
    const res = makeRes();
    await handler(makeReq({ message: 'Can you add that to the calendar' }), res);

    expect(res.statusCode).toBe(200);
    expect(applyCalendarOps).toHaveBeenCalledTimes(1);
    expect(res.body.message).toBeTruthy();
    expect(res.body.message.trim().length).toBeGreaterThan(0);
  });
});

describe('resolveScheduledDate — athlete-timezone weekdays', () => {
  // 2026-07-25T03:00:00Z is Friday July 24, 9pm in Denver (UTC-6) but already
  // Saturday in UTC — the old server-UTC weekday made this_saturday resolve a
  // full week out.
  const FRI_NIGHT_DENVER = new Date('2026-07-25T03:00:00Z');

  it("resolves this_saturday to tomorrow for a Friday-evening Denver athlete (old code: a week out)", () => {
    expect(resolveScheduledDate('this_saturday', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-07-25');
  });

  it('resolves next_saturday to the following week', () => {
    expect(resolveScheduledDate('next_saturday', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-08-01');
  });

  it('today/tomorrow stay athlete-local', () => {
    expect(resolveScheduledDate('today', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-07-24');
    expect(resolveScheduledDate('tomorrow', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-07-25');
  });

  it('passes literal dates through and works in UTC', () => {
    expect(resolveScheduledDate('2026-08-15', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-08-15');
    // In UTC the same instant IS Saturday, so this_saturday is today.
    expect(resolveScheduledDate('this_saturday', 'UTC', FRI_NIGHT_DENVER)).toBe('2026-08-01');
  });

  it('accepts the SHORT day labels the CALENDAR_ANCHOR block teaches (this_sat, next_sun)', () => {
    // The temporal anchor emits this_sat / next_sun style labels and instructs
    // the model to use only those — they must resolve identically to the full
    // names, or the raw label reaches Postgres as a non-date string (the bug
    // behind `invalid input syntax for type date: "this_sat"`).
    expect(resolveScheduledDate('this_sat', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-07-25');
    expect(resolveScheduledDate('next_sat', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-08-01');
    expect(resolveScheduledDate('this_sun', 'America/Denver', FRI_NIGHT_DENVER)).toBe('2026-07-26');
    expect(resolveScheduledDate('this_tue', 'America/Denver', FRI_NIGHT_DENVER)).toBe(
      resolveScheduledDate('this_tuesday', 'America/Denver', FRI_NIGHT_DENVER)
    );
  });

  it('returns unrecognized strings verbatim (handlers reject them before Postgres)', () => {
    expect(resolveScheduledDate('the_weekend', 'America/Denver', FRI_NIGHT_DENVER)).toBe('the_weekend');
  });
});

/**
 * handleScheduleAdjustment is GONE with the adjust_schedule tool that reached
 * it. What it did — ease, swap, replace, drop, convert to a rest day — the
 * coach now expresses as calendar_change operations, and the check-in and
 * deviation engines as calendarWrite calls. The honesty property those tests
 * pinned (a failed adjustment must report workouts_affected: 0 rather than
 * success) lives on in "calendar change payload honesty" below.
 */

/**
 * swapWorkoutDates is GONE, and with it the park-at-a-sentinel-DATE dance and
 * the rollback-on-partial-failure it needed. That whole apparatus existed
 * because the old key was (plan_id, scheduled_date), so a two-row swap
 * collided with itself over the DATE. On (user_id, date, slot) a swap parks a
 * row on slot -1 and exchanges the dates — one extra write, no rollback path.
 * The replacement is tested in api/utils/calendarWrite.test.js.
 */

/**
 * Payload honesty, on the tool that now does the adjusting.
 *
 * This used to exercise adjust_schedule. That tool is no longer on any
 * athlete's menu, so the model cannot emit it and the path is unreachable —
 * "give me a rest day tomorrow" detects as adjust_schedule and is remapped to
 * calendar_change before anything is forced. What has to survive the swap is
 * the property: a failed write must never reach the athlete as a success, and
 * must never reach them as SILENCE either.
 */
describe('coach handler — calendar change payload honesty', () => {
  it('reports a failed change in the reply rather than an empty bubble', async () => {
    applyCalendarOps.mockResolvedValue({
      success: false, applied: 0, failed: 1, deduped: 0,
      results: [{ ok: false, error: 'row not found' }], undo: [],
    });

    messagesCreate
      .mockResolvedValueOnce(calendarToolResponse(null, [
        { op: 'set_status', handle: 'sess_deadbeef', status: 'skipped', reason: 'rest today' },
      ]))
      // The model says nothing on the continuation turn. On 2026-08-27 that
      // sent the athlete a completely empty reply while writes had happened.
      .mockResolvedValueOnce(textResponse(''));

    const res = makeRes();
    await handler(makeReq({ message: 'give me a rest day tomorrow' }), res);

    expect(res.statusCode).toBe(200);
    // The handle does not resolve against an empty calendar, so nothing is
    // written — and the athlete is told, not left with a blank bubble.
    expect(applyCalendarOps).not.toHaveBeenCalled();
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).toMatch(/couldn't finish/i);
  });

  it('remaps a rest-day request onto calendar_change, never adjust_schedule', async () => {
    messagesCreate
      .mockResolvedValueOnce(textResponse('Sure, take tomorrow off.'))
      .mockResolvedValueOnce(calendarToolResponse(null))
      .mockResolvedValueOnce(textResponse('Tomorrow is a rest day now.'));

    const res = makeRes();
    await handler(makeReq({ message: 'give me a rest day tomorrow' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate.mock.calls[1][0].tool_choice).toEqual({ type: 'tool', name: 'calendar_change' });
    expect(res.body.scheduleAdjusted).toBe(false);
  });
});
