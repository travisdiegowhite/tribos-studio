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
vi.mock('./utils/rateLimit.js', () => ({ rateLimitMiddleware: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/calendarHelper.js', () => ({ fetchCalendarContext: vi.fn().mockResolvedValue(null) }));
vi.mock('./utils/contextHelpers.js', () => ({
  formatHealth: () => 'No health data available.',
  fetchProprietaryMetrics: vi.fn().mockResolvedValue(null),
}));
vi.mock('./utils/temporalAnchor.js', () => ({
  buildTemporalAnchor: () => 'ANCHOR',
  fetchTemporalAnchorData: vi.fn().mockResolvedValue({ plannedWorkouts: [], raceGoals: [] }),
}));
vi.mock('./utils/personaData.js', () => ({ PERSONA_DATA: {} }));

// Chainable Supabase stub: any await resolves to an empty list, maybeSingle to null.
function chain() {
  const obj = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'is', 'gte', 'lte', 'insert', 'update', 'upsert', 'single']) {
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
const { detectCoachIntent, detectIntentFromResponse } = coachModule;

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
        target_event_date: '2026-06-21',
      },
    },
  ],
  usage: { input_tokens: 12, output_tokens: 24 },
});

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  fromOverride = null;
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

  it('auto-activates a created plan and returns autoActivatedPlan (no tap needed)', async () => {
    // Simulate a successful training_plans insert so handleActivatePlan resolves a plan id.
    fromOverride = (table) => {
      const c = chain();
      if (table === 'training_plans') {
        c.single = () => Promise.resolve({ data: { id: 'newplan-1' }, error: null });
      }
      return c;
    };
    messagesCreate.mockResolvedValueOnce(planToolResponse('Building your block to the race.'));

    const res = makeRes();
    await handler(makeReq({ message: 'build me a training plan for my race' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.trainingPlanPreview).toBeTruthy();
    expect(res.body.trainingPlanPreview.error).toBeFalsy();
    expect(res.body.autoActivatedPlan).toBeTruthy();
    expect(res.body.autoActivatedPlan.planId).toBe('newplan-1');
    expect(res.body.autoActivatedPlan.workoutCount).toBeGreaterThan(0);
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
