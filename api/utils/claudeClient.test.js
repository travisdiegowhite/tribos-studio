import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureServerError = vi.fn();
vi.mock('./serverSentry.js', () => ({ captureServerError: (...a) => captureServerError(...a) }));

const { monitoredFetch } = await import('./claudeClient.js');

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages?beta=true';
const body = (obj) => ({ method: 'POST', body: JSON.stringify(obj) });
const jsonResponse = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_123' },
  });

beforeEach(() => captureServerError.mockReset());

describe('monitoredFetch', () => {
  it('reports a retired model (404) with the endpoint and requested model', async () => {
    const base = vi.fn().mockResolvedValue(
      jsonResponse(404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-sonnet-4-20250514' } }),
    );
    const res = await monitoredFetch('fuel-plan', base)(MESSAGES_URL, body({ model: 'claude-sonnet-4-20250514' }));

    expect(res.status).toBe(404);
    // The SDK must still be able to read the body after we inspected it.
    expect((await res.json()).error.type).toBe('not_found_error');
    expect(captureServerError).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureServerError.mock.calls[0];
    expect(message).toContain('not_found_error');
    expect(ctx.tag).toBe('claude.model_not_found');
    expect(ctx.extra).toMatchObject({
      endpoint: 'fuel-plan',
      model: 'claude-sonnet-4-20250514',
      status: 404,
      request_id: 'req_123',
    });
  });

  it('reports a rejected parameter (400) as claude.bad_request', async () => {
    const base = vi.fn().mockResolvedValue(
      jsonResponse(400, { type: 'error', error: { type: 'invalid_request_error', message: 'temperature is not supported' } }),
    );
    await monitoredFetch('coach', base)(MESSAGES_URL, body({ model: 'claude-sonnet-5-5', temperature: 0.7 }));
    expect(captureServerError.mock.calls[0][1].tag).toBe('claude.bad_request');
  });

  it('reports auth failures', async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(401, { error: { type: 'authentication_error', message: 'x' } }));
    await monitoredFetch('coach', base)(MESSAGES_URL, body({ model: 'claude-sonnet-5-5' }));
    expect(captureServerError.mock.calls[0][1].tag).toBe('claude.auth');
  });

  it('does not report transient failures the SDK retries', async () => {
    for (const status of [429, 500, 529]) {
      const base = vi.fn().mockResolvedValue(jsonResponse(status, { error: { type: 'overloaded_error', message: 'x' } }));
      await monitoredFetch('coach', base)(MESSAGES_URL, body({ model: 'claude-sonnet-5-5' }));
    }
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it('reports a refusal that arrives as HTTP 200', async () => {
    const base = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        model: 'claude-sonnet-5-5',
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber' },
        content: [],
      }),
    );
    const res = await monitoredFetch('route-coach', base)(MESSAGES_URL, body({ model: 'claude-sonnet-5-5' }));
    expect((await res.json()).stop_reason).toBe('refusal');
    expect(captureServerError).toHaveBeenCalledTimes(1);
    expect(captureServerError.mock.calls[0][1]).toMatchObject({
      tag: 'claude.refusal',
      extra: { endpoint: 'route-coach', model: 'claude-sonnet-5-5', category: 'cyber' },
    });
  });

  it('stays quiet on a normal reply', async () => {
    const base = vi.fn().mockResolvedValue(
      jsonResponse(200, { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }),
    );
    await monitoredFetch('coach', base)(MESSAGES_URL, body({ model: 'claude-sonnet-5-5' }));
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it('ignores non-Messages URLs', async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(404, { error: { type: 'not_found_error', message: 'x' } }));
    await monitoredFetch('coach', base)('https://api.anthropic.com/v1/models/foo', { method: 'GET' });
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it('never breaks the request when inspecting the response fails', async () => {
    const odd = {
      status: 404,
      ok: false,
      headers: new Headers(),
      clone() {
        throw new Error('body already used');
      },
    };
    const base = vi.fn().mockResolvedValue(odd);
    const res = await monitoredFetch('coach', base)(MESSAGES_URL, body({ model: 'm' }));
    expect(res).toBe(odd);
    expect(captureServerError).not.toHaveBeenCalled();
  });
});
