/**
 * Tests for the daily AI quota gate (per-user cap + global ceiling).
 * Runs against the in-memory rate-limit fallback (no Supabase env in tests),
 * same approach as rateLimit.test.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

let enforceAiQuota, enforceGlobalAiQuota, getAiQuotaLimits;

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

const mockReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

describe('AI daily quota', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.AI_DAILY_USER_LIMIT;
    delete process.env.AI_DAILY_GLOBAL_LIMIT;

    const module = await import('./aiQuota.js');
    enforceAiQuota = module.enforceAiQuota;
    enforceGlobalAiQuota = module.enforceGlobalAiQuota;
    getAiQuotaLimits = module.getAiQuotaLimits;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAiQuotaLimits', () => {
    it('uses defaults when env vars are unset', () => {
      expect(getAiQuotaLimits()).toEqual({ userDaily: 1000, globalDaily: 20000 });
    });

    it('reads overrides from env', () => {
      process.env.AI_DAILY_USER_LIMIT = '5';
      process.env.AI_DAILY_GLOBAL_LIMIT = '50';
      expect(getAiQuotaLimits()).toEqual({ userDaily: 5, globalDaily: 50 });
    });

    it('falls back to defaults on invalid env values', () => {
      process.env.AI_DAILY_USER_LIMIT = 'not-a-number';
      process.env.AI_DAILY_GLOBAL_LIMIT = '-3';
      expect(getAiQuotaLimits()).toEqual({ userDaily: 1000, globalDaily: 20000 });
    });
  });

  describe('enforceAiQuota', () => {
    it('returns null while under both limits', async () => {
      const res = makeRes();
      const result = await enforceAiQuota(mockReq, res, 'user-a');
      expect(result).toBeNull();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('429s with ai_daily_quota once the per-user cap is hit', async () => {
      process.env.AI_DAILY_USER_LIMIT = '2';
      const res = makeRes();

      expect(await enforceAiQuota(mockReq, res, 'user-b')).toBeNull();
      expect(await enforceAiQuota(mockReq, res, 'user-b')).toBeNull();
      const denied = await enforceAiQuota(mockReq, res, 'user-b');

      expect(denied).not.toBeNull();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'ai_daily_quota',
          resetAt: expect.any(String),
        })
      );
    });

    it('keeps per-user counters independent between users', async () => {
      process.env.AI_DAILY_USER_LIMIT = '1';
      const res = makeRes();

      expect(await enforceAiQuota(mockReq, res, 'user-c')).toBeNull();
      expect(await enforceAiQuota(mockReq, res, 'user-d')).toBeNull();
    });

    it('429s with ai_capacity once the global ceiling is hit', async () => {
      process.env.AI_DAILY_USER_LIMIT = '10';
      process.env.AI_DAILY_GLOBAL_LIMIT = '2';
      const res = makeRes();

      expect(await enforceAiQuota(mockReq, res, 'user-e')).toBeNull();
      expect(await enforceAiQuota(mockReq, res, 'user-f')).toBeNull();
      const denied = await enforceAiQuota(mockReq, res, 'user-g');

      expect(denied).not.toBeNull();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ai_capacity' })
      );
    });
  });

  describe('enforceGlobalAiQuota', () => {
    it('counts against the global ceiling without a per-user cap', async () => {
      process.env.AI_DAILY_GLOBAL_LIMIT = '1';
      const res = makeRes();

      expect(await enforceGlobalAiQuota(mockReq, res)).toBeNull();
      const denied = await enforceGlobalAiQuota(mockReq, res);

      expect(denied).not.toBeNull();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ai_capacity' })
      );
    });
  });
});
