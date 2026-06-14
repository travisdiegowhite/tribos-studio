import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the router; everything else (classifier, geometry math) runs real.
const getSmartCyclingRoute = vi.fn();
vi.mock('../smartCyclingRouter', () => ({
  getSmartCyclingRoute: (...a: unknown[]) => getSmartCyclingRoute(...a),
}));

import {
  findGravelWays,
  extractChunk,
  selectChunksForLoop,
  buildGravelLoopCandidates,
  buildGravelName,
  clearGravelCache,
  type GravelWay,
} from '../gravelRouteBuilder';
import type { Coordinate } from '../../types/geo';

const START: Coordinate = [-105, 40];

/** A straight OSM way of `n` nodes stepping `dLat/dLon` per node from origin. */
function osmWay(
  id: number,
  origin: [number, number],
  dLng: number,
  dLat: number,
  n: number,
  tags: Record<string, string>,
) {
  return {
    type: 'way',
    id,
    tags,
    geometry: Array.from({ length: n }, (_, i) => ({
      lon: origin[0] + dLng * i,
      lat: origin[1] + dLat * i,
    })),
  };
}

function mockOverpass(elements: unknown[]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ elements }),
  });
}

beforeEach(() => {
  getSmartCyclingRoute.mockReset();
  clearGravelCache();
});

describe('findGravelWays', () => {
  it('keeps gravel/unpaved ways as [lng,lat], drops paved and tiny stubs', async () => {
    mockOverpass([
      // NE gravel way ~0.02° out (well inside radius), >0.2km long.
      osmWay(1, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'track', surface: 'gravel', name: 'Nelson Rd' }),
      // Paved — must be dropped.
      osmWay(2, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'residential', surface: 'asphalt' }),
      // Sub-0.2km stub (two nodes ~5m apart) — dropped.
      osmWay(3, [-104.95, 40.05], 0.00005, 0.00005, 2, { highway: 'track', surface: 'dirt' }),
    ]);

    const ways = await findGravelWays(START, 45, 20);
    expect(ways).toHaveLength(1);
    const w = ways[0];
    expect(w.name).toBe('Nelson Rd');
    expect(w.surface).toBe('gravel');
    // Canonical [lng,lat]: lng negative (~-105), lat positive (~40).
    expect(w.coords[0][0]).toBeLessThan(0);
    expect(w.coords[0][1]).toBeGreaterThan(39);
    expect(w.lengthKm).toBeGreaterThan(0.2);
  });

  it('drops ways outside the radius', async () => {
    mockOverpass([
      // ~1.5° NE ≈ 160km away — outside a 20km radius.
      osmWay(1, [-103.5, 41.5], 0.003, 0.003, 6, { highway: 'track', surface: 'gravel' }),
    ]);
    const ways = await findGravelWays(START, 45, 20);
    expect(ways).toHaveLength(0);
  });

  it('fail-soft → [] on non-ok, throw, and empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await findGravelWays(START, 45, 20)).toEqual([]);
    clearGravelCache();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('overpass down'));
    expect(await findGravelWays(START, 45, 20)).toEqual([]);
    clearGravelCache();
    mockOverpass([]);
    expect(await findGravelWays(START, 45, 20)).toEqual([]);
  });

  it('caches by quantized start+bearing+radius (one fetch for repeat calls)', async () => {
    mockOverpass([
      osmWay(1, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'track', surface: 'gravel' }),
    ]);
    await findGravelWays(START, 45, 20);
    await findGravelWays(START, 45, 20);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});

/** Build a GravelWay fixture directly (bypassing Overpass) for unit tests. */
function gravelWayFixture(
  id: number,
  bearingFromStart: number,
  distFromStartKm: number,
  lengthKm: number,
  name: string | null,
): GravelWay {
  // A short straight coords array roughly `lengthKm` long near the start.
  const n = 8;
  const stepDeg = lengthKm / 111 / (n - 1);
  const coords: Coordinate[] = Array.from(
    { length: n },
    (_, i) => [-105 + 0.01 * id + stepDeg * i, 40 + 0.01 * id] as Coordinate,
  );
  return {
    id,
    name,
    surface: 'gravel',
    coords,
    midpoint: coords[Math.floor(n / 2)],
    lengthKm,
    bearingFromStart,
    distFromStartKm,
  };
}

describe('extractChunk', () => {
  it('returns distinct entry/exit and clamps length to the budget', () => {
    const way = gravelWayFixture(1, 45, 10, 5, 'Long Rd');
    const chunk = extractChunk(way, 2); // budget 2km, way is 5km
    expect(chunk.entry).not.toEqual(chunk.exit);
    expect(chunk.lengthKm).toBeGreaterThan(0);
    expect(chunk.lengthKm).toBeLessThanOrEqual(2.2); // ~2km + one-segment overshoot
  });

  it('uses the whole way when shorter than the budget', () => {
    const way = gravelWayFixture(2, 45, 10, 0.6, null);
    const chunk = extractChunk(way, 4);
    expect(chunk.exit).toEqual(way.coords[way.coords.length - 1]);
  });
});

describe('selectChunksForLoop', () => {
  it('budgets total gravel near target% × distance and respects MAX_CHUNKS', () => {
    // Plenty of 3km gravel ways spread across the NE band.
    const ways: GravelWay[] = [];
    let id = 1;
    for (const b of [20, 35, 45, 55, 70]) {
      for (let k = 0; k < 4; k++) ways.push(gravelWayFixture(id++, b, 8, 3, `Rd ${id}`));
    }
    const chunks = selectChunksForLoop(START, ways, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 50, // budget = 36km gravel
      orientation: 'cw',
      radiusKm: 15,
    });
    const total = chunks.reduce((s, c) => s + c.lengthKm, 0);
    expect(chunks.length).toBeLessThanOrEqual(11);
    expect(total).toBeGreaterThan(36 * 0.7); // within ~±30% of budget
  });

  it('returns [] when no ways fall in the bearing band', () => {
    const ways = [gravelWayFixture(1, 200, 8, 3, 'South Rd')]; // opposite direction
    const chunks = selectChunksForLoop(START, ways, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 50,
      orientation: 'cw',
      radiusKm: 15,
    });
    expect(chunks).toEqual([]);
  });
});

describe('buildGravelName', () => {
  it('names from the top two distinct OSM names', () => {
    expect(buildGravelName(['Nelson Rd', 'Nelson Rd', '75th St'])).toBe('Gravel via Nelson Rd & 75th St');
    expect(buildGravelName(['Only Rd'])).toBe('Gravel via Only Rd');
    expect(buildGravelName(['', ''])).toBe('Gravel loop');
  });
});

describe('buildGravelLoopCandidates', () => {
  it('routes variants through gravel chunk entry/exit waypoints', async () => {
    mockOverpass(
      Array.from({ length: 12 }, (_, i) =>
        osmWay(i + 1, [-104.9 + i * 0.01, 40.05 + i * 0.005], 0.004, 0.004, 6, {
          highway: 'track',
          surface: 'gravel',
          name: `Rd ${i + 1}`,
        }),
      ),
    );
    // Router echoes a plausible route; capture the waypoint lists it received.
    getSmartCyclingRoute.mockImplementation(async (wps: Coordinate[]) => ({
      coordinates: Array.from({ length: 30 }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001]),
      distance_m: 70000,
      duration_s: 9000,
      elevationGain: 300,
    }));

    const routes = await buildGravelLoopCandidates(START, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 50,
      count: 3,
    });

    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].source).toBe('gravel_network');
    expect(routes[0].name).toMatch(/^Gravel/);
    // Each routed waypoint list is start + (entry,exit)* + start → even interior count.
    const firstWps = getSmartCyclingRoute.mock.calls[0][0] as Coordinate[];
    expect(firstWps.length).toBeGreaterThanOrEqual(4);
    expect(firstWps[0]).toEqual(START);
    expect(firstWps[firstWps.length - 1]).toEqual(START);
    // One shared Overpass query across variants.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('returns [] when the area is gravel-sparse (empty Overpass)', async () => {
    mockOverpass([]);
    const routes = await buildGravelLoopCandidates(START, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 50,
    });
    expect(routes).toEqual([]);
    expect(getSmartCyclingRoute).not.toHaveBeenCalled();
  });
});

describe('coordinate-order correctness', () => {
  it('parses {lat,lon} into [lng,lat] with a sane length', async () => {
    // A way running due east; ~0.013° lng ≈ 1.1km at 40°N.
    mockOverpass([
      {
        type: 'way',
        id: 99,
        tags: { highway: 'track', surface: 'gravel' },
        geometry: [
          { lat: 40.05, lon: -104.95 },
          { lat: 40.05, lon: -104.937 },
        ],
      },
    ]);
    const ways = await findGravelWays(START, 90, 20);
    expect(ways).toHaveLength(1);
    expect(ways[0].coords[0]).toEqual([-104.95, 40.05]); // [lng,lat], not flipped
    expect(ways[0].lengthKm).toBeGreaterThan(0.9);
    expect(ways[0].lengthKm).toBeLessThan(1.3);
  });
});
