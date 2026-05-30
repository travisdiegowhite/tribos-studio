/**
 * Smoke test for the garmin2-backfill orchestrator endpoint.
 *
 * Heavy logic (chunk generation, requestActivityBackfill, chunk state) is
 * covered in api/utils/garminBackfill.js — this test just verifies the
 * endpoint's auth gate, integration lookup, action routing, and clamping
 * of the yearsBack input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn(() => false) }));
vi.mock('./utils/garmin/tokenManager.js', () => ({
  ensureValidAccessToken: vi.fn().mockResolvedValue('fresh-token'),
}));
vi.mock('./utils/garminBackfill.js', () => ({
  executeBackfillForUser: vi.fn().mockResolvedValue({ requested: 12, failed: 0 }),
  getBackfillProgress: vi.fn().mockResolvedValue({
    total: 12, completed: 5, pending: 7, failed: 0,
  }),
  resetFailedChunks: vi.fn().mockResolvedValue({ reset: 3 }),
}));

const integrationStore = new Map();

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async (token) => {
        if (token === 'good') return { data: { user: { id: 'user-1' } }, error: null };
        return { data: { user: null }, error: new Error('bad') };
      }),
    },
    from(_table) {
      const filters = {};
      const b = {
        select() { return b; },
        eq(col, val) { filters[col] = val; return b; },
        maybeSingle() {
          const row = integrationStore.get(filters.user_id);
          if (!row) return Promise.resolve({ data: null, error: null });
          if (filters.sync_enabled !== undefined && row.sync_enabled !== filters.sync_enabled) {
            return Promise.resolve({ data: null, error: null });
          }
          if (filters.refresh_token_invalid !== undefined && row.refresh_token_invalid !== filters.refresh_token_invalid) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: row, error: null });
        },
      };
      return b;
    },
  }),
}));

import handler from './garmin2-backfill.js';
import { executeBackfillForUser, getBackfillProgress, resetFailedChunks } from './utils/garminBackfill.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function mockReq({ body = {}, headers = { authorization: 'Bearer good' } } = {}) {
  return { method: 'POST', body, headers };
}

beforeEach(() => {
  integrationStore.clear();
  vi.clearAllMocks();
  ensureValidAccessToken.mockResolvedValue('fresh-token');
  executeBackfillForUser.mockResolvedValue({ requested: 12, failed: 0 });
});

describe('garmin2-backfill: gate', () => {
  it('rejects non-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });
  it('rejects without auth', async () => {
    const res = mockRes();
    await handler(mockReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });
  it('rejects unknown action', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'wat' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('garmin2-backfill: start', () => {
  it('returns 400 when no integration', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'start' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.requiresConnection).toBe(true);
  });

  it('returns 400 when integration missing provider_user_id', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', sync_enabled: true, refresh_token_invalid: false,
      provider_user_id: null,
    });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'start' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.requiresReconnect).toBe(true);
  });

  it('returns 401 + requiresReconnect when token refresh fails', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', sync_enabled: true, refresh_token_invalid: false,
      provider_user_id: 'gu-1',
    });
    ensureValidAccessToken.mockRejectedValueOnce(new Error('refresh died'));
    const res = mockRes();
    await handler(mockReq({ body: { action: 'start' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.requiresReconnect).toBe(true);
  });

  it('happy path: kicks off executeBackfillForUser with default 2 years', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', sync_enabled: true, refresh_token_invalid: false,
      provider_user_id: 'gu-1',
    });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'start' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.yearsBack).toBe(2);
    expect(executeBackfillForUser).toHaveBeenCalledWith('user-1', 'fresh-token', { yearsBack: 2 });
  });

  it('clamps yearsBack within [1, 5]', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', sync_enabled: true, refresh_token_invalid: false,
      provider_user_id: 'gu-1',
    });

    for (const [requested, expected] of [[0, 1], [3, 3], [99, 5], [-5, 1], ['oops', 2]]) {
      executeBackfillForUser.mockClear();
      const res = mockRes();
      await handler(mockReq({ body: { action: 'start', yearsBack: requested } }), res);
      expect(res.body.yearsBack).toBe(expected);
      expect(executeBackfillForUser).toHaveBeenCalledWith('user-1', 'fresh-token', { yearsBack: expected });
    }
  });
});

describe('garmin2-backfill: status / reset_failed', () => {
  it('status returns getBackfillProgress result', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'status' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.completed).toBe(5);
    expect(getBackfillProgress).toHaveBeenCalledWith('user-1');
  });

  it('reset_failed returns resetFailedChunks result', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'reset_failed' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.reset).toBe(3);
    expect(resetFailedChunks).toHaveBeenCalledWith('user-1');
  });
});
