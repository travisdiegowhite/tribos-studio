import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStadiaMapsRoute } from '../stadiaMapsRouter';

// Valhalla polylines are precision 6.
function encodePolyline6(points) {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
      x >>= 5;
    }
    return s + String.fromCharCode(x + 63);
  };
  for (const [lng, lat] of points) {
    const latE6 = Math.round(lat * 1e6);
    const lngE6 = Math.round(lng * 1e6);
    out += enc(latE6 - prevLat) + enc(lngE6 - prevLng);
    prevLat = latE6;
    prevLng = lngE6;
  }
  return out;
}

const LINE = Array.from({ length: 10 }, (_, i) => [-105.27 + i * 0.001, 40.01 + i * 0.0005]);
const WAYPOINTS = [LINE[0], LINE[LINE.length - 1]];

const fetchMock = vi.fn();

/** The bicycle costing object of the (only) outgoing Valhalla request. */
function sentCosting() {
  return JSON.parse(fetchMock.mock.calls[0][1].body).costing_options.bicycle;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      trip: {
        legs: [
          {
            shape: encodePolyline6(LINE),
            summary: { length: 1.2, time: 240 },
            maneuvers: [],
          },
        ],
      },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_STADIA_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getStadiaMapsRoute — explicit costing overrides', () => {
  it('forwards snake_case preference keys into the Valhalla costing options', async () => {
    await getStadiaMapsRoute(WAYPOINTS, {
      profile: 'road',
      preferences: { use_roads: 0, use_living_streets: 1.0 },
    });

    const costing = sentCosting();
    expect(costing.use_roads).toBe(0);
    expect(costing.use_living_streets).toBe(1.0);
  });

  it('lets an explicit use_hills beat the training-goal merge', async () => {
    // The endurance goal unconditionally sets use_hills to its own value —
    // the explicit edit preference must win (this was silently dropped
    // before, making elevation-target steering a no-op in production).
    await getStadiaMapsRoute(WAYPOINTS, {
      profile: 'road',
      trainingGoal: 'endurance',
      preferences: { use_hills: 0.85, avoid_bad_surfaces: 0.8 },
    });

    const costing = sentCosting();
    expect(costing.use_hills).toBe(0.85);
    expect(costing.avoid_bad_surfaces).toBe(0.8);
  });

  it('ignores out-of-range and non-numeric override values', async () => {
    await getStadiaMapsRoute(WAYPOINTS, {
      profile: 'road',
      preferences: { use_roads: 5, use_hills: 'lots', use_tracks: -1 },
    });

    const costing = sentCosting();
    expect(costing.use_roads).not.toBe(5);
    expect(costing.use_hills).not.toBe('lots');
    expect(costing.use_tracks).not.toBe(-1);
  });

  it('changes nothing for callers that pass no explicit keys (generation regression guard)', async () => {
    await getStadiaMapsRoute(WAYPOINTS, { profile: 'road', trainingGoal: 'endurance' });
    const baseline = sentCosting();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trip: {
          legs: [
            { shape: encodePolyline6(LINE), summary: { length: 1.2, time: 240 }, maneuvers: [] },
          ],
        },
      }),
    });
    await getStadiaMapsRoute(WAYPOINTS, {
      profile: 'road',
      trainingGoal: 'endurance',
      // A generation-style preferences object: none of the Valhalla keys.
      preferences: { trafficTolerance: undefined, avoidTraffic: undefined },
    });

    expect(sentCosting()).toEqual(baseline);
  });

  it('keeps the top-level useHills option as the final word', async () => {
    await getStadiaMapsRoute(WAYPOINTS, {
      profile: 'road',
      preferences: { use_hills: 0.3 },
      useHills: 0.95,
    });

    expect(sentCosting().use_hills).toBe(0.95);
  });
});
