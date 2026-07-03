import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStadiaCuesForGeometry } from '../stadiaMapsRouter';

// Valhalla polylines are precision 6.
function encodePolyline6(points: Array<[number, number]>): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
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

const LINE: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [
  -105.27 + i * 0.001,
  40.01 + i * 0.0005,
]);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_STADIA_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getStadiaCuesForGeometry', () => {
  it('reconstructs the line via /route and returns resolved cues', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trip: {
          legs: [
            {
              shape: encodePolyline6(LINE),
              maneuvers: [
                { type: 1, instruction: 'Head east.', begin_shape_index: 0, length: 0.9 },
                {
                  type: 15,
                  instruction: 'Turn left onto Oak Ave.',
                  street_names: ['Oak Ave'],
                  begin_shape_index: 10,
                  length: 0.8,
                },
                { type: 4, instruction: 'Arrive.', begin_shape_index: 19, length: 0 },
              ],
            },
          ],
        },
      }),
    });

    const cues = (await getStadiaCuesForGeometry(LINE)) as Array<{
      direction: string;
      instruction: string;
      distance_km: number;
      coordinate: [number, number];
    }>;
    expect(cues).toHaveLength(3);
    expect(cues[1].direction).toBe('left');
    expect(cues[1].instruction).toBe('Turn left onto Oak Ave.');
    // Cumulative distance = sum of prior maneuver lengths.
    expect(cues[1].distance_km).toBeCloseTo(0.9, 2);
    // Coordinate resolved from the matched shape at the maneuver index.
    expect(cues[1].coordinate[0]).toBeCloseTo(LINE[10][0], 4);
    // Request reconstructs via the plain route endpoint (map_match is
    // plan-gated on Stadia): endpoints are breaks, intermediates are
    // pass-through constraints, ≤20 locations total.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('route/v1');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.locations.length).toBeLessThanOrEqual(20);
    expect(body.locations[0].type).toBe('break');
    expect(body.locations[1].type).toBe('through');
    expect(body.locations[body.locations.length - 1].type).toBe('break');
  });

  it('returns null on trace failure or empty response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    expect(await getStadiaCuesForGeometry(LINE)).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ trip: { legs: [] } }) });
    expect(await getStadiaCuesForGeometry(LINE)).toBeNull();

    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await getStadiaCuesForGeometry(LINE)).toBeNull();
  });

  it('skips degenerate geometry without calling the API', async () => {
    expect(await getStadiaCuesForGeometry(LINE.slice(0, 5))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
