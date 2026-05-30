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

vi.mock('./utils/garmin/healthDataProcessor.js', () => ({
  processHealthPushData: vi.fn().mockResolvedValue({ processed: 1, skipped: 0, results: [] }),
}));

// Now import — after the mocks are set up.
import handler, { healthTypeFromEventType } from './garmin2-pull.js';
import { claimPings, markProcessed, markFailed } from './utils/garmin2/pingQueue.js';
import { pullActivityDetail, ConsentRevokedError } from './utils/garmin2/pullActivity.js';
import { writeActivityFromDetail } from './utils/garmin2/writeActivity.js';
import { processHealthPushData } from './utils/garmin/healthDataProcessor.js';
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

// ============================================================================
// Health-ping dispatch
// ============================================================================

describe('healthTypeFromEventType', () => {
  it('maps simple types lowercase', () => {
    expect(healthTypeFromEventType('HEALTH_DAILIES_PING')).toBe('dailies');
    expect(healthTypeFromEventType('HEALTH_SLEEPS_PING')).toBe('sleeps');
    expect(healthTypeFromEventType('HEALTH_HRV_PING')).toBe('hrv');
  });
  it('preserves Garmin camelCase for compound types', () => {
    expect(healthTypeFromEventType('HEALTH_BODYCOMPS_PING')).toBe('bodyComps');
    expect(healthTypeFromEventType('HEALTH_STRESSDETAILS_PING')).toBe('stressDetails');
  });
  it('returns null on non-health event_types', () => {
    expect(healthTypeFromEventType('ACTIVITY_DETAIL_PING')).toBeNull();
    expect(healthTypeFromEventType(null)).toBeNull();
    expect(healthTypeFromEventType('HEALTH_DAILIES')).toBeNull();  // missing _PING suffix
  });
});

describe('health-ping handling in the cron', () => {
  const HEALTH_PING = (overrides = {}) => ({
    id: 'h-1',
    event_type: 'HEALTH_DAILIES_PING',
    garmin_user_id: 'gu-1',
    activity_id: 'd1',
    file_url: 'https://cb.example/dailies',
    payload: { uploadStartTimeInSeconds: 1, uploadEndTimeInSeconds: 86400 },
    retry_count: 0,
    ...overrides,
  });

  it('happy path: pulls callbackURL, dispatches to processHealthPushData, markProcessed', async () => {
    claimPings.mockResolvedValueOnce([HEALTH_PING()]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ dailies: [{ userId: 'gu-1', restingHeartRateInBeatsPerMinute: 52 }] }),
    }));

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(processHealthPushData).toHaveBeenCalledWith(
      'dailies',
      expect.arrayContaining([expect.objectContaining({ userId: 'gu-1' })]),
      expect.anything(),
    );
    expect(markProcessed).toHaveBeenCalledWith(expect.anything(), 'h-1', expect.objectContaining({
      note: expect.stringMatching(/health dailies/),
    }));
    expect(res.body.health_processed).toBe(1);

    vi.unstubAllGlobals();
  });

  it('accepts a bare array body (response is just [...] not {dailies: [...]})', async () => {
    claimPings.mockResolvedValueOnce([HEALTH_PING()]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify([{ userId: 'gu-1' }]),
    }));

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(processHealthPushData).toHaveBeenCalledWith('dailies', expect.any(Array), expect.anything());
    expect(res.body.health_processed).toBe(1);

    vi.unstubAllGlobals();
  });

  it('empty response → markProcessed without calling processHealthPushData', async () => {
    claimPings.mockResolvedValueOnce([HEALTH_PING()]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ dailies: [] }),
    }));

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(processHealthPushData).not.toHaveBeenCalled();
    expect(markProcessed).toHaveBeenCalled();
    expect(res.body.health_skipped).toBeGreaterThanOrEqual(1);

    vi.unstubAllGlobals();
  });

  it('410 on health callbackURL → markProcessed (terminal)', async () => {
    claimPings.mockResolvedValueOnce([HEALTH_PING()]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 410,
      text: async () => 'gone',
    }));

    const res = mockResponse();
    await handler({ headers: {} }, res);

    expect(markProcessed).toHaveBeenCalledWith(expect.anything(), 'h-1', expect.objectContaining({
      note: expect.stringMatching(/expired/),
    }));

    vi.unstubAllGlobals();
  });
});
