/**
 * Smoke test for the garmin2 token-maintenance cron.
 *
 * The refresh math + mutex live inside ensureValidAccessToken
 * (api/utils/garmin/tokenManager.js, already covered by its own test file).
 * This test verifies the cron's responsibilities: auth gate, query +
 * dedup, per-integration delegation, error capture.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utils/verifyCronAuth.js', () => ({
  verifyCronAuth: vi.fn().mockReturnValue({ authorized: true }),
}));
vi.mock('./utils/garmin/tokenManager.js', () => ({
  ensureValidAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
}));

let expiringRows = [];

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from(_table) {
      const b = {
        select() { return b; },
        eq() { return b; },
        not() { return b; },
        neq() { return b; },
        lt() { return Promise.resolve({ data: expiringRows, error: null }); },
        or() { return Promise.resolve({ data: expiringRows, error: null }); },
      };
      return b;
    },
  }),
}));

import handler from './garmin2-token-maintenance.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyCronAuth.mockReturnValue({ authorized: true });
  expiringRows = [];
});

describe('garmin2-token-maintenance', () => {
  it('returns 401 when cron auth fails', async () => {
    verifyCronAuth.mockReturnValueOnce({ authorized: false });
    const res = mockRes();
    await handler({ headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns success with checked=0 when nothing is expiring', async () => {
    expiringRows = [];
    const res = mockRes();
    await handler({ headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checked).toBe(0);
    expect(res.body.refreshed).toBe(0);
  });

  it('refreshes each unique expiring integration via ensureValidAccessToken', async () => {
    expiringRows = [
      { id: 'int-1', user_id: 'u-1', refresh_token: 'r1' },
      { id: 'int-2', user_id: 'u-2', refresh_token: 'r2' },
    ];
    const res = mockRes();
    await handler({ headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.checked).toBe(2);
    expect(res.body.refreshed).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(ensureValidAccessToken).toHaveBeenCalledTimes(2);
  });

  it('counts failures and captures error details (including requiresReconnect)', async () => {
    expiringRows = [{ id: 'int-1', user_id: 'u-1', refresh_token: 'r1' }];
    ensureValidAccessToken.mockRejectedValueOnce(new Error('Refresh token may be invalid or revoked'));

    const res = mockRes();
    await handler({ headers: {} }, res);

    expect(res.body.refreshed).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0]).toMatchObject({
      userId: 'u-1',
      requiresReconnect: true,
    });
  });

  it('deduplicates an integration that appears in both queries', async () => {
    // Both query results include the same row; combined list has 2 entries
    // but the dedup keys on integration id should reduce to 1.
    expiringRows = [{ id: 'int-1', user_id: 'u-1', refresh_token: 'r1' }];
    const res = mockRes();
    await handler({ headers: {} }, res);
    expect(res.body.checked).toBe(1);
    expect(ensureValidAccessToken).toHaveBeenCalledTimes(1);
  });
});
