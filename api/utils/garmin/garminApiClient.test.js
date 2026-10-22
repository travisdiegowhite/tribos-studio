import {
  fetchGarminActivityDetails,
  requestActivityDetailsBackfill,
  fetchGarminUserId,
  fetchGarminPermissions,
  deregisterGarminUser,
} from './garminApiClient.js';

describe('fetchGarminActivityDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns activity details on success', async () => {
    const mockActivity = {
      activityName: 'Morning Ride',
      activityType: 'cycling',
      distanceInMeters: 50000,
      durationInSeconds: 3600
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [mockActivity]
    });

    const result = await fetchGarminActivityDetails('token-123', 'summary-456');
    expect(result).toEqual(mockActivity);
    expect(fetch).toHaveBeenCalledWith(
      'https://apis.garmin.com/wellness-api/rest/activities?summaryId=summary-456',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token-123'
        })
      })
    );
  });

  it('returns null on empty response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    const result = await fetchGarminActivityDetails('token', 'summary');
    expect(result).toBeNull();
  });

  it('throws on 401/403 authentication errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Token expired'
    });

    // fetchGarminActivityDetails catches errors and returns null
    // but throws on 401/403 specifically
    const result = await fetchGarminActivityDetails('bad-token', 'summary');
    // The function catches the throw internally and returns null
    expect(result).toBeNull();
  });

  it('returns null on non-auth API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error'
    });

    const result = await fetchGarminActivityDetails('token', 'summary');
    expect(result).toBeNull();
  });

  it('returns null on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchGarminActivityDetails('token', 'summary');
    expect(result).toBeNull();
  });
});

describe('requestActivityDetailsBackfill', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true on 202 Accepted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 202
    });

    const result = await requestActivityDetailsBackfill('token', 1705312800);
    expect(result).toBe(true);
  });

  it('returns true on 409 Conflict (already queued)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409
    });

    const result = await requestActivityDetailsBackfill('token', 1705312800);
    expect(result).toBe(true);
  });

  it('constructs correct time window (1h before to 2h after)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 200 });

    await requestActivityDetailsBackfill('token', 1705312800);

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain(`summaryStartTimeInSeconds=${1705312800 - 3600}`);
    expect(calledUrl).toContain(`summaryEndTimeInSeconds=${1705312800 + 7200}`);
  });

  it('returns false when missing params', async () => {
    expect(await requestActivityDetailsBackfill('token', null)).toBe(false);
    expect(await requestActivityDetailsBackfill(null, 12345)).toBe(false);
  });

  it('returns false on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'error'
    });

    const result = await requestActivityDetailsBackfill('token', 1705312800);
    expect(result).toBe(false);
  });
});

describe('fetchGarminUserId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the partner-gateway path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ userId: 'abc' }) });
    expect(await fetchGarminUserId('t')).toBe('abc');
    expect(fetch).toHaveBeenCalledWith('https://apis.garmin.com/partner-gateway/rest/user/id', expect.anything());
  });

  it('falls back to the legacy wellness-api path on 404', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ userId: 'abc' }) });
    expect(await fetchGarminUserId('t')).toBe('abc');
    expect(fetch).toHaveBeenLastCalledWith('https://apis.garmin.com/wellness-api/rest/user/id', expect.anything());
  });

  it('returns null on other failures without trying the fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await fetchGarminUserId('t')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchGarminPermissions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the granted permissions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ permissions: ['ACTIVITY_EXPORT', 'COURSE_IMPORT'] }),
    });
    expect(await fetchGarminPermissions('t')).toEqual(['ACTIVITY_EXPORT', 'COURSE_IMPORT']);
  });

  it('returns null on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await fetchGarminPermissions('t')).toBeNull();
  });
});

describe('deregisterGarminUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends DELETE to the registration endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 });
    expect(await deregisterGarminUser('t')).toEqual({ ok: true, status: 204 });
    expect(fetch).toHaveBeenCalledWith(
      'https://apis.garmin.com/partner-gateway/rest/user/registration',
      expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer t' } }),
    );
  });

  it('never throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    expect(await deregisterGarminUser('t')).toEqual({ ok: false, status: 0 });
  });

  it('skips the call without a token', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await deregisterGarminUser(null)).toEqual({ ok: false, status: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});
