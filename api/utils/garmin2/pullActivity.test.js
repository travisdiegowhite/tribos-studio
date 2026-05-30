import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchActivityDetailsByCallbackURL,
  pullActivityDetail,
  matchDetail,
  AuthError,
  ConsentRevokedError,
  GarminPullError,
} from './pullActivity.js';

const SAMPLE_DETAILS = [
  { summaryId: '111-detail', activityId: 111, summary: { activityName: 'Other' }, samples: [] },
  { summaryId: '999-detail', activityId: 999, summary: { activityName: 'Target' }, samples: [] },
];

function jsonResponse(status, body) {
  return {
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('matchDetail', () => {
  it('matches by integer activityId', () => {
    expect(matchDetail(SAMPLE_DETAILS, 999)?.summary.activityName).toBe('Target');
  });
  it('matches by stringified summaryId with -detail suffix stripped', () => {
    expect(matchDetail(SAMPLE_DETAILS, '111')?.summary.activityName).toBe('Other');
  });
  it('returns null on miss', () => {
    expect(matchDetail(SAMPLE_DETAILS, 42)).toBeNull();
  });
  it('returns null on empty/invalid input', () => {
    expect(matchDetail([], 1)).toBeNull();
    expect(matchDetail(null, 1)).toBeNull();
  });
});

describe('fetchActivityDetailsByCallbackURL', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the parsed array on 200', async () => {
    fetch.mockResolvedValue(jsonResponse(200, SAMPLE_DETAILS));
    const r = await fetchActivityDetailsByCallbackURL('https://x/', 'tok');
    expect(r).toEqual(SAMPLE_DETAILS);
    expect(fetch).toHaveBeenCalledWith('https://x/', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
    }));
  });

  it('returns [] on 200 with empty body', async () => {
    fetch.mockResolvedValue(jsonResponse(200, ''));
    expect(await fetchActivityDetailsByCallbackURL('https://x/', 't')).toEqual([]);
  });

  it('returns [] on 200 with "[]" body', async () => {
    fetch.mockResolvedValue(jsonResponse(200, '[]'));
    expect(await fetchActivityDetailsByCallbackURL('https://x/', 't')).toEqual([]);
  });

  it('throws AuthError on 401', async () => {
    fetch.mockResolvedValue(jsonResponse(401, 'unauthorized'));
    await expect(fetchActivityDetailsByCallbackURL('https://x/', 't')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    fetch.mockResolvedValue(jsonResponse(403, 'forbidden'));
    await expect(fetchActivityDetailsByCallbackURL('https://x/', 't')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws GarminPullError 410 on expired callbackURL', async () => {
    fetch.mockResolvedValue(jsonResponse(410, 'gone'));
    await expect(fetchActivityDetailsByCallbackURL('https://x/', 't'))
      .rejects.toMatchObject({ status: 410 });
  });

  it('throws ConsentRevokedError on 412', async () => {
    fetch.mockResolvedValue(jsonResponse(412, 'no consent'));
    await expect(fetchActivityDetailsByCallbackURL('https://x/', 't'))
      .rejects.toBeInstanceOf(ConsentRevokedError);
  });

  it('throws GarminPullError on other non-2xx', async () => {
    fetch.mockResolvedValue(jsonResponse(503, 'unavailable'));
    await expect(fetchActivityDetailsByCallbackURL('https://x/', 't'))
      .rejects.toMatchObject({ status: 503 });
  });

  it('throws on missing args', async () => {
    await expect(fetchActivityDetailsByCallbackURL('', 't')).rejects.toThrow(/callbackURL/);
    await expect(fetchActivityDetailsByCallbackURL('https://x/', '')).rejects.toThrow(/accessToken/);
  });
});

describe('pullActivityDetail', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the matched detail via callbackURL happy path', async () => {
    fetch.mockResolvedValue(jsonResponse(200, SAMPLE_DETAILS));
    const ping = { activity_id: '999', file_url: 'https://cb/', payload: {} };
    const r = await pullActivityDetail(ping, 'tok');
    expect(r?.summary?.activityName).toBe('Target');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the window has no matching activity', async () => {
    fetch.mockResolvedValue(jsonResponse(200, [SAMPLE_DETAILS[0]]));  // only 111
    const ping = { activity_id: '999', file_url: 'https://cb/', payload: {} };
    expect(await pullActivityDetail(ping, 'tok')).toBeNull();
  });

  it('falls back to the window endpoint on 410 callbackURL', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(410, 'gone'))
      .mockResolvedValueOnce(jsonResponse(200, SAMPLE_DETAILS));
    const ping = {
      activity_id: '999',
      file_url: 'https://cb/',
      payload: { uploadStartTimeInSeconds: 1700000000, uploadEndTimeInSeconds: 1700003000 },
    };
    const r = await pullActivityDetail(ping, 'tok');
    expect(r?.summary?.activityName).toBe('Target');
    expect(fetch).toHaveBeenCalledTimes(2);
    // Second call hits the activityDetails window endpoint
    expect(fetch.mock.calls[1][0]).toContain('/wellness-api/rest/activityDetails');
  });

  it('uses the window endpoint when no callbackURL is provided', async () => {
    fetch.mockResolvedValue(jsonResponse(200, SAMPLE_DETAILS));
    const ping = {
      activity_id: '999',
      file_url: null,
      payload: { uploadStartTimeInSeconds: 1700000000, uploadEndTimeInSeconds: 1700003000 },
    };
    const r = await pullActivityDetail(ping, 'tok');
    expect(r?.summary?.activityName).toBe('Target');
    expect(fetch.mock.calls[0][0]).toContain('/wellness-api/rest/activityDetails');
  });

  it('throws when neither callbackURL nor a usable window is available', async () => {
    const ping = { activity_id: '999', file_url: null, payload: {} };
    await expect(pullActivityDetail(ping, 'tok')).rejects.toMatchObject({ status: 400 });
  });

  it('bubbles AuthError from callbackURL without falling back', async () => {
    fetch.mockResolvedValue(jsonResponse(401, 'no'));
    const ping = {
      activity_id: '999', file_url: 'https://cb/',
      payload: { uploadStartTimeInSeconds: 1, uploadEndTimeInSeconds: 100 },
    };
    await expect(pullActivityDetail(ping, 'tok')).rejects.toBeInstanceOf(AuthError);
    expect(fetch).toHaveBeenCalledTimes(1);    // no fallback
  });
});
