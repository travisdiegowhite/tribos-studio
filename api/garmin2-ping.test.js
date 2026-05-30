/**
 * Smoke + policy test for the Vercel ping receiver.
 *
 * The HMAC contract and ping-row shape are critical (the March 2026 outage
 * was triggered by getting HMAC wrong, and a row shape drift would break
 * the puller). These tests cover the policy decisions; the heavy lifting
 * (parsePayload, validatePingItem, storePing) is unit-tested elsewhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    // The handler calls storePing(supabase, item, ...) which inserts via
    // supabase.from('garmin_webhook_events').insert(...). We let storePing
    // be real and just observe what it does.
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }),
        })),
      })),
    })),
  }),
}));

vi.mock('./utils/cors.js', () => ({
  setupCors: vi.fn(() => false),    // never short-circuits
}));

import handler from './garmin2-ping.js';

function mockReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return {
    method,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const VALID_PING_ITEM = {
  userId: 'gu-1',
  summaryId: '12345-detail',
  uploadStartTimeInSeconds: 1700000000,
  uploadEndTimeInSeconds: 1700003000,
  callbackURL: 'https://apis.garmin.com/wellness-api/rest/activities?token=X',
};

const VALID_PING_BODY = { activityDetails: [VALID_PING_ITEM] };

beforeEach(() => {
  delete process.env.GARMIN_WEBHOOK_SECRET;
});
afterEach(() => {
  delete process.env.GARMIN_WEBHOOK_SECRET;
});

describe('garmin2-ping handler', () => {
  it('responds 405 on non-POST/GET', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns a health-check on GET', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('garmin2-ping-receiver');
  });

  it('accepts a valid ping and stores it (no secret configured)', async () => {
    const res = mockRes();
    await handler(mockReq({ body: VALID_PING_BODY }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.stored).toBe(1);
    expect(res.body.eventType).toBe('ACTIVITY_DETAIL_PING');
  });

  it('drops invalid ping items at the door without failing the request', async () => {
    const res = mockRes();
    await handler(mockReq({
      body: { activityDetails: [VALID_PING_ITEM, { userId: 'gu-1' }] },  // 2nd is invalid
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.stored).toBe(1);
    expect(res.body.attempted).toBe(1);
  });

  it('returns 200 with skipped count for unhandled health types', async () => {
    const res = mockRes();
    // `epochs` is NOT in HANDLED_HEALTH_TYPES, AND classifyPayload returns
    // UNKNOWN for it — so the handler short-circuits via the UNKNOWN branch.
    await handler(mockReq({
      body: { epochs: [{ userId: 'x', callbackURL: 'https://x', summaryId: 'x',
        uploadStartTimeInSeconds: 1, uploadEndTimeInSeconds: 2 }] },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.stored).toBe(0);
  });

  it('returns 200 + ignored for legacy PUSH payloads (use /api/garmin-webhook)', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { activities: [{ userId: 'x', summaryId: 'y' }] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.reason).toMatch(/push-not-supported/);
  });

  it('returns 400 on malformed JSON', async () => {
    const res = mockRes();
    await handler(mockReq({ body: '{not json' }), res);
    expect(res.statusCode).toBe(400);
  });

  describe('HMAC policy', () => {
    const SECRET = 'test-secret';
    function signedHeaders(rawBody) {
      const sig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
      return { 'x-garmin-signature': sig };
    }

    it('accepts a body whose signature matches', async () => {
      process.env.GARMIN_WEBHOOK_SECRET = SECRET;
      const rawBody = JSON.stringify(VALID_PING_BODY);
      const res = mockRes();
      await handler({ method: 'POST', headers: signedHeaders(rawBody), body: rawBody }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.stored).toBe(1);
    });

    it('rejects 401 when signature mismatches (raw-bytes contract)', async () => {
      process.env.GARMIN_WEBHOOK_SECRET = SECRET;
      const rawBody = JSON.stringify(VALID_PING_BODY);
      const wrongSig = crypto.createHmac('sha256', 'WRONG-secret').update(rawBody).digest('hex');
      const res = mockRes();
      await handler({ method: 'POST', headers: { 'x-garmin-signature': wrongSig }, body: rawBody }, res);
      expect(res.statusCode).toBe(401);
    });

    it('accepts unsigned ping when secret is configured (Garmin pings may be unsigned)', async () => {
      process.env.GARMIN_WEBHOOK_SECRET = SECRET;
      // No signature header at all. Per spec/plan: warn and accept.
      const res = mockRes();
      await handler(mockReq({ body: VALID_PING_BODY }), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.stored).toBe(1);
    });

    it('accepts when no secret is configured (graceful degradation)', async () => {
      const res = mockRes();
      await handler(mockReq({ body: VALID_PING_BODY }), res);
      expect(res.statusCode).toBe(200);
    });
  });
});
