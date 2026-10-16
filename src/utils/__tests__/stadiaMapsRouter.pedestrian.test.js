import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStadiaMapsRoute, getStadiaCuesForGeometry } from '../stadiaMapsRouter';

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

/** The body of the (only) outgoing Valhalla request. */
function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
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

describe('getStadiaMapsRoute — run profiles use pedestrian costing (multisport phase 2)', () => {
  it('a run never reaches bicycle costing', async () => {
    await getStadiaMapsRoute(WAYPOINTS, { profile: 'run', trainingGoal: 'endurance', userSpeed: 11 });
    const body = sentBody();
    expect(body.costing).toBe('pedestrian');
    expect(body.costing_options.bicycle).toBeUndefined();
    const ped = body.costing_options.pedestrian;
    expect(ped.walking_speed).toBe(11);
    expect(ped.use_tracks).toBe(0.3);
    expect(ped.use_ferry).toBe(0);
    // No bike keys leak into the pedestrian options.
    expect(ped).not.toHaveProperty('bicycle_type');
    expect(ped).not.toHaveProperty('cycling_speed');
    expect(ped).not.toHaveProperty('use_roads');
    expect(ped).not.toHaveProperty('max_hiking_difficulty');
  });

  it('a trail run leans onto tracks and allows harder trails', async () => {
    await getStadiaMapsRoute(WAYPOINTS, { profile: 'trail_run' });
    const ped = sentBody().costing_options.pedestrian;
    expect(ped.use_tracks).toBe(1);
    expect(ped.max_hiking_difficulty).toBe(3);
  });

  it('an explicit useHills wins over the goal default', async () => {
    await getStadiaMapsRoute(WAYPOINTS, { profile: 'run', trainingGoal: 'recovery', useHills: 0.8 });
    expect(sentBody().costing_options.pedestrian.use_hills).toBe(0.8);
  });

  it('a ride still uses bicycle costing', async () => {
    await getStadiaMapsRoute(WAYPOINTS, { profile: 'road' });
    const body = sentBody();
    expect(body.costing).toBe('bicycle');
    expect(body.costing_options.pedestrian).toBeUndefined();
  });
});

describe('getStadiaCuesForGeometry — costing pass-through', () => {
  it('sends the costing it is given', async () => {
    await getStadiaCuesForGeometry(LINE, { costing: 'pedestrian' });
    const body = sentBody();
    expect(body.costing).toBe('pedestrian');
  });

  it('defaults to bicycle', async () => {
    await getStadiaCuesForGeometry(LINE);
    expect(sentBody().costing).toBe('bicycle');
  });
});
