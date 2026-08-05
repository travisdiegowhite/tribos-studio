/**
 * Handler tests for /api/activity-streams: method/auth/ownership gates and
 * the ladder's cheap tiers (cache hit, coach context, simplified, summary).
 * Expensive tiers (FIT parse, Strava) are covered by the pure-module tests
 * in api/utils/activityStreams.test.js.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  storageDownload: vi.fn(),
  storageUpload: vi.fn(),
}));

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single, maybeSingle: vi.fn() }),
      }),
    }),
    storage: {
      from: () => ({ download: mocks.storageDownload, upload: mocks.storageUpload }),
    },
  }),
}));

const { default: handler } = await import('./activity-streams.js');

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    headers: { origin: 'http://localhost:3000', authorization: 'Bearer token-1' },
    query: { activityId: 'act-1' },
    ...overrides,
  };
}

const AUTH_OK = { data: { user: { id: 'user-1' } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageDownload.mockResolvedValue({ data: null, error: { message: 'not found' } });
  mocks.storageUpload.mockResolvedValue({ error: null });
});

describe('activity-streams handler gates', () => {
  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('requires activityId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects missing/invalid bearer token', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('404s when the activity does not exist', async () => {
    mocks.getUser.mockResolvedValue(AUTH_OK);
    mocks.single.mockResolvedValue({ data: null, error: { message: 'no rows' } });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s on another user's activity", async () => {
    mocks.getUser.mockResolvedValue(AUTH_OK);
    mocks.single.mockResolvedValue({ data: { id: 'act-1', user_id: 'someone-else' }, error: null });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('activity-streams handler tiers', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue(AUTH_OK);
  });

  it('serves a storage cache hit verbatim without rebuilding', async () => {
    const cachedPayload = { version: 1, tier: 'per_second', source: 'fit_storage', t: [0, 1] };
    mocks.single.mockResolvedValue({
      data: { id: 'act-1', user_id: 'user-1', fit_storage_path: 'garmin/u/a.fit' },
      error: null,
    });
    mocks.storageDownload.mockResolvedValue({
      data: { text: async () => JSON.stringify(cachedPayload) },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedPayload);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it('serves coach_ts for a Wahoo-shaped row (no FIT, no Strava id)', async () => {
    mocks.single.mockResolvedValue({
      data: {
        id: 'act-1',
        user_id: 'user-1',
        moving_time: 3600,
        fit_coach_context: {
          interval_seconds: 10,
          time_series: [
            { t: 0, power: 100, hr: 120 },
            { t: 10, power: 110, hr: 121 },
          ],
        },
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.tier).toBe('coach_ts');
    expect(payload.t).toEqual([0, 10]);
    expect(mocks.storageUpload).not.toHaveBeenCalled(); // cheap tier: not cached
  });

  it('serves the simplified tier when only RDP streams exist', async () => {
    mocks.single.mockResolvedValue({
      data: {
        id: 'act-1',
        user_id: 'user-1',
        moving_time: 7200,
        activity_streams: {
          coords: [[-105.3, 40.0], [-105.31, 40.01]],
          power: [200, 210],
        },
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.tier).toBe('simplified');
    expect(payload.t).toBeUndefined();
  });

  it('serves tier summary when the row has no stream data at all', async () => {
    mocks.single.mockResolvedValue({
      data: { id: 'act-1', user_id: 'user-1', moving_time: 3600 },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ version: 1, tier: 'summary', source: 'none' });
  });
});
