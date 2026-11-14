import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webhookWorkoutSummary } from './utils/wahoo/__fixtures__/webhookWorkoutSummary.js';

const state = vi.hoisted(() => ({ integration: null, events: [], eventUpdates: [] }));

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from(table) {
      const q = {
        insert(row) { state.events.push(row); return q; },
        update(row) { state.eventUpdates.push(row); return q; },
        select() { return q; },
        eq() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle: () => Promise.resolve({ data: table === 'bike_computer_integrations' ? state.integration : null, error: null }),
        single: () => Promise.resolve({ data: { id: 'evt-1' }, error: null }),
        then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
      };
      return q;
    },
  }),
}));
const ingest = vi.hoisted(() => ({ ingestWahooWorkout: vi.fn() }));
vi.mock('./utils/wahoo/ingest.js', () => ingest);

process.env.WAHOO_WEBHOOK_TOKEN = 'test-webhook-token';
const { default: handler, verifyWahooWebhookToken } = await import('./wahoo-webhook.js');

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  res.end = () => res;
  return res;
}
const post = (body, query = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, query, body });

beforeEach(() => {
  vi.clearAllMocks();
  state.integration = { id: 'int-1', user_id: 'u1', last_sync_at: null };
  state.events = [];
  state.eventUpdates = [];
  ingest.ingestWahooWorkout.mockResolvedValue({ status: 'inserted', activityId: 'act-1', fitNote: null });
});

describe('verifyWahooWebhookToken', () => {
  it('accepts the token in the body (Wahoo’s mechanism) or the legacy ?token=', () => {
    const env = { WAHOO_WEBHOOK_TOKEN: 'abc' };
    expect(verifyWahooWebhookToken({ body: { webhook_token: 'abc' } }, env).ok).toBe(true);
    expect(verifyWahooWebhookToken({ body: {}, query: { token: 'abc' } }, env).ok).toBe(true);
    expect(verifyWahooWebhookToken({ body: { webhook_token: 'abd' } }, env).ok).toBe(false);
    expect(verifyWahooWebhookToken({ body: {} }, env)).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects everything in production when no token is configured', () => {
    expect(verifyWahooWebhookToken({ body: { webhook_token: 'x' } }, { VERCEL_ENV: 'production' }).ok).toBe(false);
  });
});

describe('POST /api/wahoo-webhook', () => {
  it('imports a documented workout_summary delivery', async () => {
    const res = makeRes();
    await handler(post(webhookWorkoutSummary()), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, result: 'inserted', activityId: 'act-1' });

    const [integration, payload, opts] = ingest.ingestWahooWorkout.mock.calls[0];
    expect(integration.user_id).toBe('u1');
    expect(payload.workout.id).toBe(1001);
    expect(opts.source).toBe('wahoo_webhook');
  });

  it('never persists the shared webhook token', async () => {
    await handler(post(webhookWorkoutSummary()), makeRes());
    expect(state.events[0]).toMatchObject({ event_type: 'workout_summary', wahoo_user_id: '60462', workout_id: '1001', user_id: 'u1' });
    expect(JSON.stringify(state.events[0].payload)).not.toContain('test-webhook-token');
    expect(JSON.stringify(ingest.ingestWahooWorkout.mock.calls[0][2].raw)).not.toContain('test-webhook-token');
    expect(state.eventUpdates.at(-1)).toMatchObject({ status: 'processed', result: 'inserted', activity_id: 'act-1' });
  });

  it('rejects a wrong or missing token with 401 and imports nothing', async () => {
    for (const body of [webhookWorkoutSummary({ webhook_token: 'nope' }), { ...webhookWorkoutSummary(), webhook_token: undefined }]) {
      const res = makeRes();
      await handler(post(body), res);
      expect(res.statusCode).toBe(401);
    }
    expect(ingest.ingestWahooWorkout).not.toHaveBeenCalled();
  });

  it('acknowledges other event types without importing', async () => {
    const res = makeRes();
    await handler(post({ ...webhookWorkoutSummary(), event_type: 'something_else' }), res);
    expect(res.statusCode).toBe(200);
    expect(ingest.ingestWahooWorkout).not.toHaveBeenCalled();
  });

  it('acknowledges a Wahoo user with no tribos connection', async () => {
    state.integration = null;
    const res = makeRes();
    await handler(post(webhookWorkoutSummary()), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User not linked');
    expect(state.events).toHaveLength(0);
  });

  it('returns 5xx on a processing failure so Wahoo redelivers', async () => {
    ingest.ingestWahooWorkout.mockRejectedValue(new Error('insert failed: timeout'));
    const res = makeRes();
    await handler(post(webhookWorkoutSummary()), res);
    expect(res.statusCode).toBe(500);
    expect(state.eventUpdates.at(-1)).toMatchObject({ status: 'error' });
  });

  it('400s a body without workout_summary', async () => {
    const res = makeRes();
    await handler(post({ event_type: 'workout_summary', webhook_token: 'test-webhook-token', user: { id: 1 } }), res);
    expect(res.statusCode).toBe(400);
  });
});
