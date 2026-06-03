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

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from: () => chain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const coachModule = await import('./coach.js');
const handler = coachModule.default;
const { detectCoachIntent } = coachModule;

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

beforeEach(() => {
  messagesCreate.mockReset();
  getUser.mockReset();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('detectCoachIntent', () => {
  it.each([
    ['what should I ride today', 'recommend_workout'],
    ['add a workout for tomorrow', 'recommend_workout'],
    ['plan my week', 'recommend_workout'],
    ['recommend a recovery ride', 'recommend_workout'],
    // Add-to-calendar follow-ups that reference a just-recommended workout.
    ['Can you add that to the calendar', 'recommend_workout'],
    ['schedule it for tomorrow', 'recommend_workout'],
    ['put this on my calendar', 'recommend_workout'],
    // Plural "add the workouts" activates a whole plan, not a single workout.
    ['add the workouts to my calendar', 'create_training_plan'],
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

describe('coach handler — forced tool pass', () => {
  it('does not re-call when Claude already used the right tool', async () => {
    messagesCreate.mockResolvedValueOnce(workoutToolResponse('Here is an easy spin.'));
    const res = makeRes();
    await handler(makeReq({ message: 'what should I ride today' }), res);

    expect(res.statusCode).toBe(200);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(res.body.workoutRecommendations).toHaveLength(1);
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
