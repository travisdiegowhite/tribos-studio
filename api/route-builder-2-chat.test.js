import { describe, it, expect, vi, beforeEach } from 'vitest';

const messagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    constructor() {
      this.messages = { create: messagesCreate };
    }
  },
}));

vi.mock('./utils/cors.js', () => ({
  setupCors: vi.fn().mockReturnValue(false),
}));
vi.mock('./utils/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null),
}));

const handler = (await import('./route-builder-2-chat.js')).default;

function makeRes() {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

beforeEach(() => {
  messagesCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
});

describe('route-builder-2-chat', () => {
  it('rejects non-POST', async () => {
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects missing text', async () => {
    const res = makeRes();
    await handler({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns mutation when Claude calls apply_mutation', async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'apply_mutation',
          input: { type: 'extend_distance', delta_km: 8 },
        },
      ],
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { text: 'make it 8km longer' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      mutation: { type: 'extend_distance', delta_km: 8 },
    });
  });

  it('returns refusal when Claude calls refuse_request', async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'refuse_request',
          input: { reason: 'Out of scope.' },
        },
      ],
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { text: 'tell me a joke' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ refusal: 'Out of scope.' });
  });

  it('fills defaults when Claude omits parameters', async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'apply_mutation',
          input: { type: 'increase_climbing' },
        },
      ],
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { text: 'hillier' } }, res);
    expect(res.body).toEqual({
      mutation: { type: 'increase_climbing', magnitude: 'moderate' },
    });
  });

  it('returns 500 when Claude throws', async () => {
    messagesCreate.mockRejectedValue(new Error('quota'));
    const res = makeRes();
    await handler({ method: 'POST', body: { text: 'something' } }, res);
    expect(res.statusCode).toBe(500);
  });
});
