import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertStravaStreams, fetchStravaStreams } from './stravaStreams.js';

// ─── convertStravaStreams ───────────────────────────────────────────────────

describe('convertStravaStreams', () => {
  // Build a synthetic Strava stream with ~20 points spread in a line
  function makeStreamMap(overrides = {}) {
    const n = 20;
    const latlng = Array.from({ length: n }, (_, i) => [40.0 + i * 0.001, -74.0 + i * 0.001]);
    const altitude = Array.from({ length: n }, (_, i) => 100 + i * 5);
    const watts = Array.from({ length: n }, () => 200);
    const heartrate = Array.from({ length: n }, () => 150);
    const cadence = Array.from({ length: n }, () => 90);
    const distance = Array.from({ length: n }, (_, i) => i * 100); // 100m apart
    const time = Array.from({ length: n }, (_, i) => i * 10); // 10s apart

    return { latlng, altitude, watts, heartrate, cadence, distance, time, ...overrides };
  }

  it('converts full streams to correct format with coord order [lng, lat]', () => {
    const result = convertStravaStreams(makeStreamMap());

    expect(result).not.toBeNull();
    expect(result.coords).toBeDefined();
    expect(result.coords.length).toBeGreaterThanOrEqual(2);

    // Verify [lng, lat] order (Strava gives [lat, lng])
    // First raw point: [40.0, -74.0] → should become [-74.0, 40.0]
    const firstCoord = result.coords[0];
    expect(firstCoord[0]).toBeLessThan(0); // longitude is negative
    expect(firstCoord[1]).toBeGreaterThan(0); // latitude is positive
  });

  it('includes elevation, power, speed, heartRate when data present', () => {
    const result = convertStravaStreams(makeStreamMap());

    expect(result.elevation).toBeDefined();
    expect(result.power).toBeDefined();
    expect(result.speed).toBeDefined();
    expect(result.heartRate).toBeDefined();
  });

  it('excludes power when watts stream is missing', () => {
    const streamMap = makeStreamMap();
    delete streamMap.watts;

    const result = convertStravaStreams(streamMap);

    expect(result).not.toBeNull();
    expect(result.coords).toBeDefined();
    expect(result.power).toBeUndefined();
    // Other streams should still be present
    expect(result.elevation).toBeDefined();
    expect(result.heartRate).toBeDefined();
  });

  it('returns null when latlng is missing (indoor ride)', () => {
    const streamMap = makeStreamMap();
    delete streamMap.latlng;

    expect(convertStravaStreams(streamMap)).toBeNull();
  });

  it('returns null for empty latlng array', () => {
    expect(convertStravaStreams({ latlng: [] })).toBeNull();
    expect(convertStravaStreams({ latlng: [[40, -74]] })).toBeNull(); // < 2 points
  });

  it('returns null for null/undefined input', () => {
    expect(convertStravaStreams(null)).toBeNull();
    expect(convertStravaStreams(undefined)).toBeNull();
  });

  it('derives speed from distance and time deltas', () => {
    const streamMap = makeStreamMap();
    // distance: 0, 100, 200, ... (100m apart)
    // time: 0, 10, 20, ... (10s apart)
    // Expected speed: 100/10 = 10 m/s for each point after first

    const result = convertStravaStreams(streamMap);

    expect(result.speed).toBeDefined();
    // All non-first speeds should be 10 m/s
    const nonNullSpeeds = result.speed.filter(s => s !== null);
    expect(nonNullSpeeds.length).toBeGreaterThan(0);
    for (const s of nonNullSpeeds) {
      expect(s).toBeCloseTo(10, 0);
    }
  });

  it('produces parallel arrays of equal length', () => {
    const result = convertStravaStreams(makeStreamMap());

    const len = result.coords.length;
    if (result.elevation) expect(result.elevation.length).toBe(len);
    if (result.power) expect(result.power.length).toBe(len);
    if (result.speed) expect(result.speed.length).toBe(len);
    if (result.heartRate) expect(result.heartRate.length).toBe(len);
  });

  it('simplifies track (output has fewer points than input)', () => {
    // Create a dense stream with 500 points on a straight line
    const n = 500;
    const streamMap = {
      latlng: Array.from({ length: n }, (_, i) => [40.0 + i * 0.0001, -74.0 + i * 0.0001]),
      altitude: Array.from({ length: n }, (_, i) => 100 + i * 0.5),
      distance: Array.from({ length: n }, (_, i) => i * 10),
      time: Array.from({ length: n }, (_, i) => i),
    };

    const result = convertStravaStreams(streamMap);

    expect(result).not.toBeNull();
    // RDP on a straight line should reduce dramatically (to just 2 endpoints)
    expect(result.coords.length).toBeLessThan(n);
  });
});

// ─── fetchStravaStreams ─────────────────────────────────────────────────────

describe('fetchStravaStreams', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null on 404 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    const result = await fetchStravaStreams('12345', 'fake-token');
    expect(result).toBeNull();
  });

  it('returns rateLimited flag on 429 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }));

    const result = await fetchStravaStreams('12345', 'fake-token');
    expect(result).toEqual({ rateLimited: true });
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchStravaStreams('12345', 'fake-token');
    expect(result).toBeNull();
  });

  it('returns parsed stream map on 200 response', async () => {
    const mockStreams = [
      { type: 'latlng', data: [[40, -74], [40.001, -74.001]] },
      { type: 'altitude', data: [100, 110] },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStreams),
    }));

    const result = await fetchStravaStreams('12345', 'fake-token');
    expect(result.latlng).toEqual([[40, -74], [40.001, -74.001]]);
    expect(result.altitude).toEqual([100, 110]);
  });

  it('sends correct authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchStravaStreams('12345', 'my-token');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/activities/12345/streams'),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer my-token' }
      })
    );
  });
});
