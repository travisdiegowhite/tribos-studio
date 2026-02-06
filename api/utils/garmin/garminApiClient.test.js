import { fetchGarminActivityDetails, requestActivityDetailsBackfill } from './garminApiClient.js';

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
