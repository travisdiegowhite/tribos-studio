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
const ALT_LINE = Array.from({ length: 12 }, (_, i) => [-105.27 + i * 0.001, 40.01 - i * 0.0005]);
const TWO = [LINE[0], LINE[LINE.length - 1]];
const THREE = [LINE[0], LINE[4], LINE[LINE.length - 1]];

const leg = (points, lengthKm, extra = {}) => ({
  shape: encodePolyline6(points),
  summary: { length: lengthKm, time: lengthKm * 200 },
  maneuvers: [],
  ...extra,
});

const fetchMock = vi.fn();
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      trip: { legs: [leg(LINE, 1.2)] },
      alternates: [
        { trip: { legs: [leg(ALT_LINE, 1.5)] } },
        // A ferry alternate: dropped, never fatal.
        { trip: { legs: [leg(ALT_LINE, 9, { maneuvers: [{ type: 28, instruction: 'Take the ferry', length: 9 }] })] } },
        { trip: null },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_STADIA_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getStadiaMapsRoute — alternates', () => {
  it('asks for alternates on a two-location request and parses the usable ones', async () => {
    const route = await getStadiaMapsRoute(TWO, { profile: 'road', alternates: 2 });
    expect(sentBody().alternates).toBe(2);
    expect(route.coordinates).toHaveLength(LINE.length);
    expect(route.distance_m).toBeCloseTo(1200, 3);
    expect(route.alternates).toHaveLength(1);
    expect(route.alternates[0].coordinates).toHaveLength(ALT_LINE.length);
    expect(route.alternates[0].distance_m).toBeCloseTo(1500, 3);
    expect(route.alternates[0].source).toBe('stadia_maps');
  });

  it('never sends alternates for more than two locations', async () => {
    await getStadiaMapsRoute(THREE, { profile: 'road', alternates: 2 });
    expect(sentBody().alternates).toBeUndefined();
  });

  it('sends nothing by default and returns an empty list when the response has none', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ trip: { legs: [leg(LINE, 1.2)] } }) });
    const route = await getStadiaMapsRoute(TWO, { profile: 'road' });
    expect(sentBody().alternates).toBeUndefined();
    expect(route.alternates).toEqual([]);
  });
});
