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

// Recording stub for planned_workouts: the first awaited SELECT resolves
// `fetchRows`; every awaited UPDATE resolves one affected row and is recorded
// with its payload + filters, so tests can assert exactly what was written.
function recordingPlannedWorkouts(fetchRows) {
  const updates = [];
  const calls = [];
  const make = () => {
    const local = { filters: [], payload: null, isUpdate: false };
    const c = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'is', 'gte', 'lte', 'in', 'or', 'single']) {
      c[m] = (...args) => {
        local.filters.push([m, ...args]);
        return c;
      };
    }
    c.update = (payload) => {
      local.isUpdate = true;
      local.payload = payload;
      return c;
    };
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (resolve) => {
      calls.push(local);
      if (local.isUpdate) {
        updates.push(local);
        return Promise.resolve({ data: [{ id: 'affected' }], error: null }).then(resolve);
      }
      return Promise.resolve({ data: fetchRows, error: null }).then(resolve);
    };
    return c;
  };
  return { make, updates, calls };
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

const workoutToolResponse = (text) => ({
  content: [
    ...(text ? [{ type: 'text', text }] : []),
    {
      type: 'tool_use',
      id: 'tw1',
      name: 'recommend_workout',
      input: { workout_id: 'recovery_spin', scheduled_date: 'tomorrow', reason: 'easy day' },
    },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
});

const planToolResponse = (text) => ({
  content: [
    ...(text ? [{ type: 'text', text }] : []),
    {
      type: 'tool_use',
      id: 'tp1',
      name: 'create_training_plan',
      input: {
        name: 'Summer Vibes Final Block',
        duration_weeks: 3,
        methodology: 'sweet_spot',
        goal: 'racing',
        start_date: 'next_monday',
        // No target_event_date and no race_goals ⇒ the static generator path.
      },
    },
  ],
  usage: { input_tokens: 12, output_tokens: 24 },
});

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  fromOverride = null;
  buildEnrichmentBlock.mockReset();
  buildEnrichmentBlock.mockReturnValue(null);
  fetchAnchorMock.mockReset();
  fetchAnchorMock.mockResolvedValue({ plannedWorkouts: [], raceGoals: [] });
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

describe('coach handler — forced tool pass', () => {
  it('does not re-call when Claude already used the right tool', async () => {
    messagesCreate.mockResolvedValueOnce(workoutToolResponse('Here is an easy spin.'));
    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.workoutRecommendations).toHaveLength(1);
  });

  it('persists a recommended workout server-side and returns it as added', async () => {
    // Simulate an existing active plan so the workout resolves a plan and writes.
    fromOverride = (table) => {
      const c = chain();
      if (table === 'training_plans') {
        c.maybeSingle = () => Promise.resolve({ data: { id: 'plan-1' }, error: null });
      }
      return c;
    };
    messagesCreate.mockResolvedValueOnce(workoutToolResponse('Easy spin coming up.'));

    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    // No continuation turn — recommend_workout persists without a second Claude call.
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.workoutRecommendations).toHaveLength(1);
    const rec = res.body.workoutRecommendations[0];
    expect(rec.added).toBe(true);
    expect(rec.workout_id).toBe('recovery_spin');
    expect(rec.name).toBeTruthy();
    expect(rec.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('re-calls forcing the matched tool when the first pass was prose-only', async () => {
    messagesCreate
      .mockResolvedValueOnce(textResponse('You should do an easy spin tomorrow.'))
      .mockResolvedValueOnce(workoutToolResponse(null));

    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    // Second call forces the recommend_workout tool.
    expect(messagesCreate.mock.calls[1][0].tool_choice).toEqual({ type: 'tool', name: 'recommend_workout' });
    // The card is surfaced, and the first pass's prose is kept as the message.
    expect(res.body.workoutRecommendations).toHaveLength(1);
    expect(res.body.message).toMatch(/easy spin/i);
  });

  it('does not force a tool for a general question', async () => {
    messagesCreate.mockResolvedValueOnce(textResponse('Your fitness is trending up nicely.'));
    const res = makeRes();
    await handler(makeReq({ message: 'how is my fitness trending?' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.workoutRecommendations).toBeNull();
  });

  it('forces create_training_plan when the coach promised a plan in prose only', async () => {
    // User message has no plan keyword; the coach's PROSE promises to build a block but
    // calls no tool. Response-based intent must drive the forced create_training_plan pass.
    messagesCreate
      .mockResolvedValueOnce(textResponse("18 days out — let's build the final block into Summer Vibes right now."))
      .mockResolvedValueOnce(planToolResponse(null));

    const res = makeRes();
    await handler(makeReq({ message: 'looking forward to Summer Vibes' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    expect(messagesCreate.mock.calls[1][0].tool_choice).toEqual({ type: 'tool', name: 'create_training_plan' });
    expect(res.body.trainingPlanPreview).toBeTruthy();
    expect(res.body.trainingPlanPreview.error).toBeFalsy();
  });

  it('auto-activates a static plan (no race) and returns autoActivatedPlan (no tap needed)', async () => {
    // No race resolves ⇒ the static generator path. Simulate a successful
    // training_plans insert so handleActivatePlan resolves a plan id.
    fromOverride = (table) => {
      const c = chain();
      if (table === 'training_plans') {
        c.single = () => Promise.resolve({ data: { id: 'newplan-1' }, error: null });
      }
      return c;
    };
    messagesCreate.mockResolvedValueOnce(planToolResponse('Building your general-fitness block.'));

    const res = makeRes();
    await handler(makeReq({ message: 'build me a training plan' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.trainingPlanPreview).toBeTruthy();
    expect(res.body.trainingPlanPreview.error).toBeFalsy();
    expect(res.body.autoActivatedPlan).toBeTruthy();
    expect(res.body.autoActivatedPlan.planId).toBe('newplan-1');
    expect(res.body.autoActivatedPlan.raceName).toBeNull();
    expect(res.body.autoActivatedPlan.workoutCount).toBeGreaterThan(0);
  });

  it('auto-activates a LIVING ARC when a target race resolves', async () => {
    // A future race in race_goals routes create_training_plan to the deterministic
    // block-periodized arc instead of the static generator.
    const raceDate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    let insertedPlan = null;
    fromOverride = (table) => {
      const c = chain();
      if (table === 'race_goals') {
        c.then = (resolve) => Promise.resolve({
          data: [{ id: 'race-1', name: 'The Rad', race_date: raceDate, priority: 'A', status: 'upcoming' }],
          error: null,
        }).then(resolve);
      }
      if (table === 'training_plans') {
        c.insert = (payload) => { insertedPlan = payload; return c; };
        c.single = () => Promise.resolve({ data: { id: 'arcplan-1' }, error: null });
      }
      return c;
    };
    messagesCreate.mockResolvedValueOnce(planToolResponse('Building your race arc.'));

    const res = makeRes();
    await handler(makeReq({ message: 'plan me to my race' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.autoActivatedPlan).toBeTruthy();
    expect(res.body.autoActivatedPlan.planId).toBe('arcplan-1');
    expect(res.body.autoActivatedPlan.raceName).toBe('The Rad');
    expect(res.body.autoActivatedPlan.workoutCount).toBeGreaterThan(0);
    // The arc IS a training_plan row carrying the block bands.
    expect(insertedPlan).toBeTruthy();
    expect(insertedPlan.template_id).toBe('ai_arc');
    expect(insertedPlan.tier).toBe('A');
    // goal is CHECK-constrained to a fixed enum — must be a valid value, not free text.
    expect(['general_fitness', 'endurance', 'climbing', 'racing', 'gran_fondo', 'weight_loss', 'custom']).toContain(insertedPlan.goal);
    expect(Array.isArray(insertedPlan.blocks)).toBe(true);
    expect(insertedPlan.blocks.length).toBeGreaterThan(0);
    // Preview reflects the arc, not the static methodology.
    expect(res.body.trainingPlanPreview.methodology).toBe('event_anchored');
  });

  // Shared setup for the hybrid-explanation tests: a resolvable A-race, a chosen
  // persona, and a successful arc plan insert.
  const arcWithPersona = () => {
    const raceDate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    fromOverride = (table) => {
      const c = chain();
      if (table === 'user_coach_settings') {
        c.maybeSingle = () => Promise.resolve({ data: { coaching_persona: 'hammer' }, error: null });
      }
      if (table === 'race_goals') {
        c.then = (resolve) => Promise.resolve({
          data: [{ id: 'race-1', name: 'The Rad', race_date: raceDate, priority: 'A', status: 'upcoming' }],
          error: null,
        }).then(resolve);
      }
      if (table === 'training_plans') {
        c.single = () => Promise.resolve({ data: { id: 'arcplan-1' }, error: null });
      }
      return c;
    };
  };

  it('wraps the arc explanation in persona voice when the wrapper is clean (hybrid)', async () => {
    arcWithPersona();
    messagesCreate
      .mockResolvedValueOnce(planToolResponse('Building it now.'))
      .mockResolvedValueOnce(textResponse('{"leadIn":"Time to point everything at The Rad.","signOff":"Now go do the work."}'));

    const res = makeRes();
    await handler(makeReq({ message: 'plan me to my race' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.autoActivatedPlan).toBeTruthy();
    // Persona lead-in + sign-off wrap the verbatim factual spine.
    expect(res.body.message).toContain('Time to point everything at The Rad.');
    expect(res.body.message).toContain('Now go do the work.');
    expect(res.body.message).toContain('A-priority'); // a fact from the deterministic spine
  });

  it('falls back to the deterministic explanation when the persona wrapper leaks facts', async () => {
    arcWithPersona();
    messagesCreate
      .mockResolvedValueOnce(planToolResponse('Building it now.'))
      // Wrapper tries to state a week count → must be rejected, deterministic message used.
      .mockResolvedValueOnce(textResponse('{"leadIn":"You have 13 weeks to suffer.","signOff":"Go."}'));

    const res = makeRes();
    await handler(makeReq({ message: 'plan me to my race' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.autoActivatedPlan).toBeTruthy();
    // The hallucinated wrapper is discarded; the deterministic intro is used instead.
    expect(res.body.message).not.toContain('You have 13 weeks to suffer.');
    expect(res.body.message).toContain('the thinking behind it');
  });

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

  it('never returns a blank bubble when only a workout card is produced', async () => {
    // Add-to-calendar follow-up: Claude returns the card with no accompanying prose.
    messagesCreate.mockResolvedValueOnce(workoutToolResponse(null));
    const res = makeRes();
    await handler(makeReq({ message: 'Can you add that to the calendar' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.workoutRecommendations).toHaveLength(1);
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
});

describe('handleScheduleAdjustment — honest, user-scoped writes', () => {
  it('add_rest converts every plan\'s row on the date and dual-writes zero load', async () => {
    const rec = recordingPlannedWorkouts([
      { id: 'w1', workout_id: 'endurance_base_1', original_workout_id: null },
      { id: 'w2', workout_id: 'endurance_base_2', original_workout_id: null },
    ]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    const result = await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'add_rest', source_date: '2026-07-25' }], summary: 'skip Saturday' },
      null,
      'UTC'
    );

    expect(result.success).toBe(true);
    expect(result.adjustments[0].success).toBe(true);
    expect(result.adjustments[0].workouts_affected).toBe(2);
    expect(result.failed).toBe(0);

    // Both rows converted, both metric columns zeroed (freeze-policy dual-write).
    expect(rec.updates).toHaveLength(2);
    for (const u of rec.updates) {
      expect(u.payload.workout_type).toBe('rest');
      expect(u.payload.target_rss).toBe(0);
      expect(u.payload.target_tss).toBe(0);
    }

    // The fetch was user-scoped, never plan-scoped (no planId given).
    const fetchFilters = rec.calls.find((c) => !c.isUpdate).filters;
    expect(fetchFilters).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(fetchFilters.some(([m, col]) => m === 'eq' && col === 'plan_id')).toBe(false);
    // Null-safe completed filter.
    expect(fetchFilters).toContainEqual(['or', 'completed.eq.false,completed.is.null']);
  });

  it('reports failure honestly when no workout exists on the date', async () => {
    const rec = recordingPlannedWorkouts([]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    const result = await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'add_rest', source_date: '2026-07-26' }], summary: 's' },
      null,
      'UTC'
    );

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.adjustments[0].success).toBe(false);
    expect(result.adjustments[0].workouts_affected).toBe(0);
    expect(result.adjustments[0].error).toMatch(/no planned workout found on 2026-07-26/i);
    expect(rec.updates).toHaveLength(0);
  });

  it('scopes to an explicitly selected plan when planId is provided', async () => {
    const rec = recordingPlannedWorkouts([{ id: 'w1', workout_id: null, original_workout_id: null }]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'add_rest', source_date: '2026-07-25' }], summary: 's' },
      'plan-9',
      'UTC'
    );

    const fetchFilters = rec.calls.find((c) => !c.isUpdate).filters;
    expect(fetchFilters).toContainEqual(['eq', 'plan_id', 'plan-9']);
  });

  it("labels 'remove' as a non-destructive rest-day conversion", async () => {
    const rec = recordingPlannedWorkouts([{ id: 'w1', workout_id: 'tempo_1', original_workout_id: null }]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    const result = await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'remove', source_date: '2026-07-25' }], summary: 's' },
      null,
      'UTC'
    );

    expect(result.adjustments[0].effective_action).toBe('add_rest');
    expect(result.adjustments[0].note).toMatch(/not deleted/i);
  });

  it('replace writes the library workout\'s real name, type, and dual-written load', async () => {
    const rec = recordingPlannedWorkouts([{ id: 'w1', workout_id: 'old_endurance', original_workout_id: null }]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    const result = await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'replace', source_date: '2026-07-25', new_workout_id: 'recovery_spin' }], summary: 's' },
      null,
      'UTC'
    );

    expect(result.adjustments[0].success).toBe(true);
    const payload = rec.updates[0].payload;
    expect(typeof payload.target_rss).toBe('number');
    expect(payload.target_rss).toBe(payload.target_tss); // dual-write
    expect(typeof payload.target_duration).toBe('number');
    expect(payload.workout_type).toBeTruthy();
    expect(result.adjustments[0].new_workout_name).toBeTruthy();
  });

  it('replace flags unknown workout ids instead of silently leaving stale fields', async () => {
    const rec = recordingPlannedWorkouts([{ id: 'w1', workout_id: 'old_endurance', original_workout_id: null }]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    const result = await handleScheduleAdjustment(
      'user-1',
      { adjustments: [{ action: 'replace', source_date: '2026-07-25', new_workout_id: 'not_a_real_workout' }], summary: 's' },
      null,
      'UTC'
    );

    expect(result.adjustments[0].note).toMatch(/metadata not found/i);
  });
});

describe('swapWorkoutDates — rollback on partial failure', () => {
  it('restores the parked source when the target move fails (no stranded NULL-date row)', async () => {
    const updateCalls = [];
    let updateCount = 0;
    fromOverride = () => {
      const c = chain();
      c.update = (payload) => {
        updateCount++;
        const n = updateCount;
        const rec = { n, payload, ids: [] };
        updateCalls.push(rec);
        const sub = {
          eq: (col, val) => {
            rec.ids.push([col, val]);
            return sub;
          },
          then: (resolve) =>
            Promise.resolve(n === 2 ? { data: null, error: { message: 'boom' } } : { data: null, error: null }).then(resolve),
        };
        return sub;
      };
      return c;
    };

    const result = await swapWorkoutDates('src-1', '2026-07-25', 'tgt-1', '2026-07-26');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/boom/);
    // Call 1 parked the source at NULL; call 2 failed; call 3 must restore the
    // source back to its original date.
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].payload.scheduled_date).toBeNull();
    expect(updateCalls[2].payload.scheduled_date).toBe('2026-07-25');
    expect(updateCalls[2].ids).toContainEqual(['id', 'src-1']);
  });
});

describe('coach handler — schedule adjustment payload honesty', () => {
  it('returns scheduleAdjusted:false and the failing adjustment when nothing changed', async () => {
    const rec = recordingPlannedWorkouts([]);
    fromOverride = (table) => (table === 'planned_workouts' ? rec.make() : chain());

    messagesCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'ta1',
            name: 'adjust_schedule',
            input: { adjustments: [{ action: 'add_rest', source_date: 'today' }], summary: 'rest today' },
          },
        ],
        usage: { input_tokens: 5, output_tokens: 8 },
      })
      .mockResolvedValueOnce(textResponse("I couldn't find a planned workout today, so nothing was changed."));

    const res = makeRes();
    await handler(makeReq({ message: 'give me a rest day tomorrow' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.scheduleAdjusted).toBe(false);
    expect(res.body.scheduleAdjustments).toHaveLength(1);
    expect(res.body.scheduleAdjustments[0].success).toBe(false);
    expect(res.body.scheduleAdjustments[0].workouts_affected).toBe(0);
  });
});
