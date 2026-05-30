/**
 * Smoke test for the Garmin Ping/Pull cron wiring.
 *
 * The individual units (pingQueue, pullActivity, writeActivity) are covered
 * in their own test files. This test just verifies the cron HTTP handler
 * wires them together correctly: auth check, claim/group, integration
 * lookup, pull, write, finalize.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock the modules the handler imports so we can drive the orchestrator
// deterministically without touching real Supabase or fetch.
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    // The handler does one .from('bike_computer_integrations') lookup per
    // user; we return one integration row for the happy path.
    from: vi.fn(() => ({
      select: () => ({
        eq: function chain() { return this; },
        maybeSingle: () => Promise.resolve({
          data: { id: 'int-1', user_id: 'user-1', provider_user_id: 'gu-1',
            access_token: 'tok', refresh_token: 'rtok',
            token_expires_at: new Date(Date.now() + 86400000).toISOString(),
            sync_enabled: true, refresh_token_invalid: false,
          },
          error: null,
        }),
      }),
    })),
  }),
}));

vi.mock('./utils/verifyCronAuth.js', () => ({
  verifyCronAuth: vi.fn(() => ({ authorized: true })),
}));

vi.mock('./utils/serverSentry.js', () => ({
  captureServerError: vi.fn(),
}));

vi.mock('./utils/garmin/tokenManager.js', () => ({
  ensureValidAccessToken: vi.fn().mockResolvedValue('valid-token'),
}));

vi.mock('./utils/garmin2/pingQueue.js', () => ({
  ACTIVITY_PING: 'ACTIVITY_DETAIL_PING',
  HEALTH_PING_PREFIX: 'HEALTH_',
  HEALTH_PING_SUFFIX: '_PING',
  MAX_RETRIES: 5,
  claimPings: vi.fn(),
  markProcessed: vi.fn().mockResolvedValue({ error: null }),
  markFailed: vi.fn().mockResolvedValue({ terminal: false, error: null }),
}));

vi.mock('./utils/garmin2/pullActivity.js', async () => {
  const actual = await vi.importActual('./utils/garmin2/pullActivity.js');
  return {
    ...actual,
    pullActivityDetail: vi.fn(),
  };
});

vi.mock('./utils/garmin2/writeActivity.js', () => ({
  writeActivityFromDetail: vi.fn(),
}));

// Now import — after the mocks are set up.
import handler from './garmin2-pull.js';
import { claimPings, markProcessed, markFailed } from './utils/garmin2/pingQueue.js';
import { pullActivityDetail, ConsentRevokedError } from './utils/garmin2/pullActivity.js';
import { writeActivityFromDetail } from './utils/garmin2/writeActivity.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const PING = (overrides = {}) => ({
  id: 'evt-1',
  event_type: 'ACTIVITY_DETAIL_PING',
  garmin_user_id: 'gu-1',
  activity_id: '12345',
  file_url: 'https://cb.example/x',
  payload: { uploadStartTimeInSeconds: 1700000000, uploadEndTimeInSeconds: 1700003000 },
  retry_count: 0,
  ...overrides,
});

const DETAIL = { summaryId: '12345-detail', activityId: 12345, summary: { duration: 3600 }, samples: [] };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.clearAllMocks(); });

describe('garmin2-pull handler', () => {
  it('returns 401 when cron auth fails', async () => {
    verifyCronAuth.mockReturnValueOnce({ authorized: false });
    const res = mockResponse();
    await handler({ headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns success with zero counts when the queue is empty', async () => {
    claimPings.mockResolvedValueOnce([]);
    const res = mockResponse();
    await handler({ headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.claimed).toBe(0);
    expect(res.body.inserted).toBe(0);
  });

  it('happy path: pings → pull → write → markProcessed', async () => {
    claimPings.mockResolvedValueOnce([PING()]);
    pullActivityDetail.mockResolvedValueOnce(DETAIL);
    writeActivityFromDetail.mockResolvedValueOnce({
      activityId: 'act-1', action: 'inserted', completeness: 'full', error: null,
    });

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.claimed).toBe(1);
    expect(res.body.inserted).toBe(1);
    expect(pullActivityDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }), 'valid-token');
    expect(writeActivityFromDetail).toHaveBeenCalledWith(expect.objectContaining({
      integration: expect.objectContaining({ user_id: 'user-1' }),
      ping: expect.objectContaining({ id: 'evt-1' }),
      detail: DETAIL,
    }));
    expect(markProcessed).toHaveBeenCalledWith(expect.anything(), 'evt-1', expect.objectContaining({
      activityImportedId: 'act-1', note: 'inserted',
    }));
  });

  it('no_match: pull returns null → markFailed (retry next tick)', async () => {
    claimPings.mockResolvedValueOnce([PING()]);
    pullActivityDetail.mockResolvedValueOnce(null);

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(res.body.no_match).toBe(1);
    expect(markFailed).toHaveBeenCalled();
    expect(writeActivityFromDetail).not.toHaveBeenCalled();
  });

  it('ConsentRevokedError: parks all pings for that user and bails', async () => {
    claimPings.mockResolvedValueOnce([PING({ id: 'evt-1' }), PING({ id: 'evt-2' })]);
    pullActivityDetail.mockRejectedValueOnce(new ConsentRevokedError('no consent', 412));

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(res.body.consent_revoked).toBe(2);                            // both pings counted
    expect(markProcessed).toHaveBeenCalledTimes(2);                      // both parked
    expect(pullActivityDetail).toHaveBeenCalledTimes(1);                 // bail after first 412
  });

  it('write error: markFailed for the ping, continue with next', async () => {
    claimPings.mockResolvedValueOnce([PING({ id: 'evt-1' }), PING({ id: 'evt-2' })]);
    pullActivityDetail.mockResolvedValue(DETAIL);
    writeActivityFromDetail
      .mockResolvedValueOnce({ activityId: null, action: 'skipped', error: new Error('write failed') })
      .mockResolvedValueOnce({ activityId: 'act-2', action: 'inserted', completeness: 'full', error: null });

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(res.body.errors).toBe(1);
    expect(res.body.inserted).toBe(1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledTimes(1);
  });
});
