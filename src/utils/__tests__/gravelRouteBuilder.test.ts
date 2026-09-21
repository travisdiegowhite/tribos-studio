import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the router and the Overpass client; everything else (inference,
// geometry math) runs real.
const getSmartCyclingRoute = vi.fn();
vi.mock('../smartCyclingRouter', () => ({
  getSmartCyclingRoute: (...a: unknown[]) => getSmartCyclingRoute(...a),
}));
const fetchOverpassElements = vi.fn();
vi.mock('../overpassClient', () => ({
  fetchOverpassElements: (...a: unknown[]) => fetchOverpassElements(...a),
}));
const getBRouterDirections = vi.fn();
vi.mock('../brouter', () => ({
  getBRouterDirections: (...a: unknown[]) => getBRouterDirections(...a),
  BROUTER_PROFILES: { GRAVEL: 'gravel', TREKKING: 'trekking' },
}));

import {
  findGravelWays,
  probeGravelWaysWithBRouter,
  padLoopWaypoints,
  PROBE_AFTER_MS,
  bestGravelHeadings,
  gravelRadiusKm,
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
  fetchOverpassElements.mockResolvedValue(elements);
}

/** The Overpass QL sent by the last findGravelWays call. */
function lastQuery(): string {
  return fetchOverpassElements.mock.calls[fetchOverpassElements.mock.calls.length - 1][0] as string;
}

beforeEach(() => {
  getSmartCyclingRoute.mockReset();
  fetchOverpassElements.mockReset();
  getBRouterDirections.mockReset();
  getBRouterDirections.mockResolvedValue(null);
  clearGravelCache();
});

/** A BRouter tag run of `n` vertices stepping east from `origin`. */
function taggedRun(origin: [number, number], n: number, tags: Record<string, string>) {
  return {
    id: -1,
    tags,
    geometry: Array.from({ length: n }, (_, i) => [origin[0] + 0.003 * i, origin[1]] as Coordinate),
  };
}

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
    expect(w.confidence).toBe(0.95);
    expect(w.evidence).toBe('surface=gravel');
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

  it('keeps inferred gravel (graded and untagged tracks) at lower confidence, drops paved/unknown', async () => {
    mockOverpass([
      osmWay(1, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'track', tracktype: 'grade3', name: 'CR 5' }),
      osmWay(2, [-104.96, 40.04], 0.003, 0.003, 6, { highway: 'track' }),
      osmWay(3, [-104.95, 40.05], 0.003, 0.003, 6, { highway: 'track', tracktype: 'grade1' }),
      osmWay(4, [-104.94, 40.06], 0.003, 0.003, 6, { highway: 'unclassified' }),
    ]);
    const ways = await findGravelWays(START, 45, 20);
    expect(ways.map((w) => [w.id, w.surface, w.confidence, w.evidence])).toEqual([
      [1, 'unpaved', 0.8, 'tracktype=grade3'],
      [2, 'unpaved', 0.6, 'highway=track'],
    ]);
  });

  it('asks for tagged gravel, graded tracks and untagged tracks in one query, through the shared client', async () => {
    mockOverpass([]);
    await findGravelWays(START, 45, 20);
    const q = lastQuery();
    expect(q).toContain('["surface"~"^(gravel|');
    expect(q).toContain('["tracktype"~"^grade[2-5]$"]');
    expect(q).toContain('way["highway"="track"][!"surface"]');
    expect(fetchOverpassElements).toHaveBeenCalledWith(expect.any(String), { timeoutMs: 8000 });
  });

  it('searches the full circle when no direction is asked', async () => {
    mockOverpass([]);
    await findGravelWays(START, 45, 20);
    const wedge = lastQuery().match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/)!;
    await findGravelWays(START, null, 20);
    const circle = lastQuery().match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/)!;
    // The NE wedge barely reaches south or west of the start; the full
    // circle extends a whole radius (~0.18° lat) both ways.
    expect(Number(wedge[1])).toBeGreaterThan(39.95);
    expect(Number(wedge[2])).toBeGreaterThan(-105.05);
    expect(Number(circle[1])).toBeLessThan(39.85);
    expect(Number(circle[2])).toBeLessThan(-105.2);
    expect(Number(circle[3])).toBeGreaterThan(40.15);
    expect(fetchOverpassElements).toHaveBeenCalledTimes(2);
  });

  it('fail-soft → [] when every mirror fails, nothing comes back, and the spokes find nothing', async () => {
    fetchOverpassElements.mockRejectedValue(new Error('overpass down'));
    expect(await findGravelWays(START, 45, 20)).toEqual([]);
    clearGravelCache();
    mockOverpass([]);
    expect(await findGravelWays(START, 45, 20)).toEqual([]);
    // Five fanned spokes per attempt when a direction was given.
    expect(getBRouterDirections).toHaveBeenCalledTimes(10);
    expect(fetchOverpassElements).toHaveBeenCalledWith(expect.any(String), { timeoutMs: 8000 });
  });

  it('falls back to BRouter spokes when Overpass fails, harvesting the unpaved runs it rode', async () => {
    fetchOverpassElements.mockRejectedValue(new Error('406'));
    getBRouterDirections.mockImplementation(async (wps: Array<[number, number]>) => ({
      taggedWays: [
        taggedRun([wps[0][0] + 0.02, wps[0][1] + 0.02], 6, { highway: 'residential', surface: 'asphalt' }),
        taggedRun([wps[0][0] + 0.04, wps[0][1] + 0.04], 6, { highway: 'track', surface: 'gravel' }),
        taggedRun([wps[0][0] + 0.06, wps[0][1] + 0.06], 6, { highway: 'track' }),
      ],
    }));
    const ways = await findGravelWays(START, null, 20);
    expect(getBRouterDirections).toHaveBeenCalledTimes(8); // full circle
    expect(getBRouterDirections.mock.calls[0][1]).toEqual({ profile: 'gravel' });
    // The same two unpaved runs come back from every spoke; deduped on midpoint.
    expect(ways).toHaveLength(2);
    expect(ways.map((w) => [w.id, w.surface, w.evidence])).toEqual([
      [-1, 'gravel', 'surface=gravel'],
      [-2, 'unpaved', 'highway=track'],
    ]);
    expect(ways[0].name).toBeNull();
    expect(ways[0].bearingFromStart).toBeGreaterThan(0);
  });

  it('starts the spokes when Overpass is slow, and takes whichever finds gravel first', async () => {
    vi.useFakeTimers();
    try {
      let resolveOverpass: (v: unknown[]) => void = () => {};
      fetchOverpassElements.mockReturnValue(new Promise((resolve) => { resolveOverpass = resolve; }));
      getBRouterDirections.mockResolvedValue({
        taggedWays: [taggedRun([-104.96, 40.04], 6, { highway: 'track', surface: 'gravel' })],
      });
      const pending = findGravelWays(START, 45, 20);
      await vi.advanceTimersByTimeAsync(PROBE_AFTER_MS - 10);
      expect(getBRouterDirections).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20);
      expect(getBRouterDirections).toHaveBeenCalled();
      const ways = await pending;
      expect(ways).toHaveLength(1);
      expect(ways[0].id).toBe(-1); // from the spokes; Overpass never answered
      resolveOverpass([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not probe BRouter when Overpass already found gravel', async () => {
    mockOverpass([osmWay(1, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'track', surface: 'gravel' })]);
    await findGravelWays(START, 45, 20);
    expect(getBRouterDirections).not.toHaveBeenCalled();
  });

  it('probe: skips failed spokes and spokes with no tags', async () => {
    getBRouterDirections
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ taggedWays: [] })
      .mockResolvedValueOnce({
        taggedWays: [taggedRun([-104.95, 40.05], 6, { highway: 'track', tracktype: 'grade4' })],
      });
    const ways = await probeGravelWaysWithBRouter(START, 90, 20);
    expect(ways).toHaveLength(1);
    expect(ways[0].evidence).toBe('tracktype=grade4');
    expect(getBRouterDirections).toHaveBeenCalledTimes(5);
  });

  it('caches by quantized start+bearing+radius (one fetch for repeat calls)', async () => {
    mockOverpass([
      osmWay(1, [-104.97, 40.03], 0.003, 0.003, 6, { highway: 'track', surface: 'gravel' }),
    ]);
    await findGravelWays(START, 45, 20);
    await findGravelWays(START, 45, 20);
    await findGravelWays(START, null, 20);
    await findGravelWays(START, null, 20);
    expect(fetchOverpassElements).toHaveBeenCalledTimes(2);
  });

  it('sizes the search radius from the target distance', () => {
    expect(gravelRadiusKm(64)).toBeCloseTo(13.2, 1);
    expect(gravelRadiusKm(5)).toBe(3);
    expect(gravelRadiusKm(400)).toBe(25);
  });
});

describe('bestGravelHeadings', () => {
  it('ranks headings by gravel km in band and keeps them well separated', () => {
    const ways = [
      gravelWayFixture(1, 40, 8, 6, 'NE 1'),
      gravelWayFixture(2, 50, 8, 6, 'NE 2'),
      gravelWayFixture(3, 200, 8, 3, 'S'),
      gravelWayFixture(4, 300, 8, 1, 'NW'),
    ];
    const headings = bestGravelHeadings(ways, 3);
    expect(headings[0].bearingDeg).toBeGreaterThanOrEqual(30);
    expect(headings[0].bearingDeg).toBeLessThanOrEqual(60);
    expect(headings[0].gravelKm).toBe(12);
    for (let i = 1; i < headings.length; i++) {
      const d = Math.abs(headings[i].bearingDeg - headings[0].bearingDeg) % 360;
      expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(60);
    }
    expect(headings.map((h) => h.bearingDeg)).toContain(210);
    expect(bestGravelHeadings([], 3)).toEqual([]);
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
    confidence: 0.95,
    evidence: 'surface=gravel',
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

  it('starts the chunk near an approach point, not coords[0]', () => {
    const way = gravelWayFixture(3, 45, 10, 6, 'Long Rd');
    const approach = way.coords[way.coords.length - 1]; // near the far end
    const chunk = extractChunk(way, 2, approach);
    // Entry should be at/near the approach end, far from coords[0].
    const dEntryToApproach = Math.hypot(
      chunk.entry[0] - approach[0],
      chunk.entry[1] - approach[1],
    );
    const dStartToApproach = Math.hypot(
      way.coords[0][0] - approach[0],
      way.coords[0][1] - approach[1],
    );
    expect(dEntryToApproach).toBeLessThan(dStartToApproach);
  });
});

describe('selectChunksForLoop', () => {
  it('overshoots the raw budget and respects MAX_CHUNKS (14)', () => {
    // Plenty of 5km gravel ways spread across the NE band.
    const ways: GravelWay[] = [];
    let id = 1;
    for (const b of [20, 35, 45, 55, 70]) {
      for (let k = 0; k < 4; k++) ways.push(gravelWayFixture(id++, b, 8, 5, `Rd ${id}`));
    }
    const chunks = selectChunksForLoop(START, ways, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 50, // naive budget 36km; overshoot target 0.65*72 = 46.8km
      orientation: 'cw',
      radiusKm: 15,
    });
    const total = chunks.reduce((s, c) => s + c.lengthKm, 0);
    expect(chunks.length).toBeLessThanOrEqual(14);
    expect(total).toBeGreaterThan(36 * 1.2); // overshoot above the naive 36km
  });

  it('chains chunks by proximity so connectors stay short', () => {
    // Four gravel ways: a tight cluster near the start side and one far outlier.
    const near = (id: number, lng: number, lat: number): GravelWay => {
      const coords: Coordinate[] = [
        [lng, lat],
        [lng + 0.02, lat],
        [lng + 0.04, lat],
      ];
      return {
        id,
        name: `Rd ${id}`,
        surface: 'gravel',
        confidence: 0.95,
        evidence: 'surface=gravel',
        coords,
        midpoint: coords[1],
        lengthKm: 3.4,
        bearingFromStart: 45,
        distFromStartKm: 8,
      };
    };
    // A, B, C step northeast away from start; D is a far outlier still in-band.
    const ways = [
      near(1, -104.95, 40.05),
      near(2, -104.9, 40.1),
      near(3, -104.85, 40.15),
      near(4, -104.5, 40.45),
    ];
    const chunks = selectChunksForLoop(START, ways, {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 10, // budget ~9km — the tight cluster satisfies it
      orientation: 'cw',
      radiusKm: 40,
    });
    // The cluster (A,B,C) covers the budget; the far outlier D is never reached.
    expect(chunks.some((c) => c.wayId === 4)).toBe(false);
    // Consecutive connector gaps (exit_i → entry_{i+1}) stay small.
    for (let i = 1; i < chunks.length; i++) {
      const gap = Math.hypot(
        chunks[i].entry[0] - chunks[i - 1].exit[0],
        chunks[i].entry[1] - chunks[i - 1].exit[1],
      );
      expect(gap).toBeLessThan(0.15);
    }
  });

  it('prefers a tagged gravel way over an inferred one of the same shape', () => {
    const tagged = gravelWayFixture(1, 45, 10, 5, 'Tagged Rd');
    const inferred = { ...gravelWayFixture(2, 45, 10, 5, 'Inferred Rd'), confidence: 0.6, evidence: 'highway=track' };
    const chunks = selectChunksForLoop(START, [inferred, tagged], {
      targetDistanceKm: 72,
      bearingDeg: 45,
      gravelTargetPct: 5, // budget ≈ 4.7 km → one chunk
      orientation: 'cw',
      radiusKm: 15,
    });
    expect(chunks[0].wayId).toBe(1);
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

describe('padLoopWaypoints', () => {
  const km = (a: Coordinate, b: Coordinate) =>
    Math.hypot((a[0] - b[0]) * 85.4, (a[1] - b[1]) * 111); // rough km at 40°N

  it('adds apex waypoints at the loop radius until the chain is about target-sized', () => {
    // Two tiny chunks right next to the start: a 64 km ask would loop back in ~3 km.
    const chain: Coordinate[] = [START, [-104.99, 40.01], [-104.985, 40.012], START];
    const padded = padLoopWaypoints(START, chain, 64, 45, 'cw');
    expect(padded.length).toBe(chain.length + 3);
    expect(padded[0]).toEqual(START);
    expect(padded[padded.length - 1]).toEqual(START);
    const loopRadius = 64 / (2 * Math.PI);
    const apexes = padded.filter((p) => !chain.includes(p));
    for (const apex of apexes) expect(km(apex, START)).toBeCloseTo(loopRadius, 0);
    // The original chunk order is preserved.
    const kept = padded.filter((p) => chain.includes(p));
    expect(kept).toEqual(chain);
  });

  it('leaves a target-sized chain alone', () => {
    const far: Coordinate[] = [START, [-104.9, 40.1], [-104.8, 40.15], [-104.85, 40.0], START]; // ≈ 45 km straight
    expect(padLoopWaypoints(START, far, 48, 45, 'cw')).toEqual(far);
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
    // distanceKm is recomputed from the (clipped) geometry, NOT the router's
    // stale distance_m (70000m = 70km); the echoed line is only ~3.9km.
    expect(routes[0].distanceKm).toBeGreaterThan(0);
    expect(routes[0].distanceKm).toBeLessThan(10);
    // Each routed waypoint list is start + (entry,exit)* + start → even interior count.
    const firstWps = getSmartCyclingRoute.mock.calls[0][0] as Coordinate[];
    expect(firstWps.length).toBeGreaterThanOrEqual(4);
    expect(firstWps[0]).toEqual(START);
    expect(firstWps[firstWps.length - 1]).toEqual(START);
    expect(routes[0].bearingDeg).toBe(45);
    // One shared Overpass query across variants.
    expect(fetchOverpassElements).toHaveBeenCalledTimes(1);
  });

  it('with no direction, heads where the gravel is and reports each loop\u2019s bearing', async () => {
    // A dense gravel cluster to the north-east, a thinner one to the south.
    const ne = Array.from({ length: 10 }, (_, i) =>
      osmWay(i + 1, [-104.93 + i * 0.01, 40.06 + i * 0.006], 0.004, 0.004, 6, {
        highway: 'track',
        surface: 'gravel',
        name: `NE ${i + 1}`,
      }),
    );
    const south = Array.from({ length: 3 }, (_, i) =>
      osmWay(100 + i, [-105.0 + i * 0.01, 39.9 - i * 0.01], 0.004, 0, 6, { highway: 'track', tracktype: 'grade3' }),
    );
    mockOverpass([...ne, ...south]);
    getSmartCyclingRoute.mockImplementation(async () => ({
      coordinates: Array.from({ length: 30 }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001]),
      distance_m: 70000,
      duration_s: 9000,
    }));

    const routes = await buildGravelLoopCandidates(START, {
      targetDistanceKm: 64,
      bearingDeg: null,
      gravelTargetPct: 50,
      count: 3,
    });

    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].bearingDeg).toBeGreaterThanOrEqual(30);
    expect(routes[0].bearingDeg).toBeLessThanOrEqual(60);
    // The full-circle query ran once for every variant.
    expect(fetchOverpassElements).toHaveBeenCalledTimes(1);
    // The full circle, not a wedge anchored at the start.
    const bbox = lastQuery().match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/)!;
    expect(Number(bbox[1])).toBeLessThan(39.9);
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
