import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchOverpassElements = vi.fn();
vi.mock('../overpassClient', () => ({
  fetchOverpassElements: (...a: unknown[]) => fetchOverpassElements(...a),
}));
const traceTaggedWaysWithBRouter = vi.fn();
vi.mock('../brouterTrace', () => ({
  traceTaggedWaysWithBRouter: (...a: unknown[]) => traceTaggedWaysWithBRouter(...a),
}));

import {
  buildCorridorQuery,
  corridorBoxes,
  elementsToTaggedWays,
  fetchCorridorWays,
  analyzeRouteStress,
  measureRouteStress,
  analyzeRouteSurface,
  measureRouteSurface,
  createStressRoute,
  clearRoadAttributesCache,
  CORRIDOR_M,
  MAX_BOXES,
} from '../roadAttributes';
import type { Coordinate } from '../../types/geo';
import { rememberTaggedWays, clearRememberedTaggedWays, type TaggedWay } from '../wayTags';

// 21 vertices east along 40°N, ~85 m apart (≈1.7 km).
const LINE: Coordinate[] = Array.from({ length: 21 }, (_, i) => [-105 + i * 0.001, 40]);

function overpassWay(id: number, from: number, to: number, tags: Record<string, string>) {
  return {
    type: 'way',
    id,
    tags,
    geometry: LINE.slice(from, to + 1).map(([lon, lat]) => ({ lat, lon })),
  };
}

function taggedWay(id: number, from: number, to: number, tags: Record<string, string>): TaggedWay {
  return { id, tags, geometry: LINE.slice(from, to + 1) };
}

beforeEach(() => {
  fetchOverpassElements.mockReset();
  traceTaggedWaysWithBRouter.mockReset();
  traceTaggedWaysWithBRouter.mockResolvedValue(null);
  clearRoadAttributesCache();
  clearRememberedTaggedWays();
});

describe('corridorBoxes / buildCorridorQuery', () => {
  it('cuts the route into ~500 m chunks and pads each box', () => {
    const boxes = corridorBoxes(LINE); // ≈1.7 km → 4 boxes
    expect(boxes.length).toBe(4);
    const padLat = CORRIDOR_M / 111000;
    expect(boxes[0].south).toBeCloseTo(40 - padLat, 6);
    expect(boxes[0].north).toBeCloseTo(40 + padLat, 6);
    expect(boxes[0].west).toBeLessThan(LINE[0][0]);
    // The second box starts where the first ended (shared vertex).
    expect(boxes[1].west).toBeLessThan(boxes[0].east);
  });

  it('caps the number of boxes on very long routes', () => {
    const long: Coordinate[] = Array.from({ length: 5000 }, (_, i) => [-105 + i * 0.001, 40]); // ~425 km
    expect(corridorBoxes(long).length).toBeLessThanOrEqual(MAX_BOXES);
  });

  it('emits a union of bbox way terms with the ridden-way filter, never an around: corridor', () => {
    const q = buildCorridorQuery(LINE);
    expect(q.startsWith('[out:json][timeout:25];(')).toBe(true);
    expect(q).toContain('way["highway"]["highway"!~');
    expect(q).toContain('["footway"!~"^(sidewalk|crossing)$"]');
    expect(q).toContain('["service"!~"^(driveway|parking_aisle)$"]');
    expect(q).not.toContain('around');
    expect(q.endsWith(');out geom;')).toBe(true);
    // Four boxes → four terms.
    expect(q.match(/way\["highway"\]/g)?.length).toBe(4);
  });
});

describe('elementsToTaggedWays', () => {
  it('converts {lat,lon} to canonical [lng,lat] and keeps only highway ways', () => {
    const ways = elementsToTaggedWays([
      overpassWay(1, 0, 3, { highway: 'residential', maxspeed: '30' }),
      overpassWay(2, 3, 6, { building: 'yes' }),
      { type: 'node', id: 3 },
      { type: 'way', id: 4, tags: { highway: 'x' }, geometry: [{ lat: 40, lon: -105 }] },
    ]);
    expect(ways).toHaveLength(1);
    expect(ways[0].id).toBe(1);
    expect(ways[0].geometry[0]).toEqual([-105, 40]);
    expect(ways[0].tags.maxspeed).toBe('30');
  });
});

describe('fetchCorridorWays', () => {
  it('uses BRouter tagged ways without a network call when they cover the route', async () => {
    const tagged = [taggedWay(-1, 0, 10, { highway: 'track' }), taggedWay(-2, 10, 20, { highway: 'primary' })];
    const result = await fetchCorridorWays(LINE, { taggedWays: tagged });
    expect(result?.source).toBe('brouter');
    expect(result?.ways).toHaveLength(2);
    expect(fetchOverpassElements).not.toHaveBeenCalled();
  });

  it('recalls the tags the BRouter client remembered for this geometry', async () => {
    rememberTaggedWays(LINE, [taggedWay(-1, 0, 20, { highway: 'residential' })]);
    const result = await fetchCorridorWays(LINE);
    expect(result?.source).toBe('brouter');
    expect(result?.ways).toHaveLength(1);
    expect(traceTaggedWaysWithBRouter).not.toHaveBeenCalled();
    expect(fetchOverpassElements).not.toHaveBeenCalled();
  });

  it('re-rides the line with BRouter before touching Overpass', async () => {
    traceTaggedWaysWithBRouter.mockResolvedValue([taggedWay(-1, 0, 20, { highway: 'tertiary' })]);
    const result = await fetchCorridorWays(LINE);
    expect(result?.source).toBe('brouter_trace');
    expect(traceTaggedWaysWithBRouter).toHaveBeenCalledWith(LINE);
    expect(fetchOverpassElements).not.toHaveBeenCalled();
    // Cached like any other success.
    await fetchCorridorWays(LINE);
    expect(traceTaggedWaysWithBRouter).toHaveBeenCalledTimes(1);
  });

  it('falls through to Overpass when tagged ways cover too little', async () => {
    fetchOverpassElements.mockResolvedValue([overpassWay(9, 0, 20, { highway: 'residential' })]);
    const result = await fetchCorridorWays(LINE, { taggedWays: [taggedWay(-1, 0, 2, { highway: 'track' })] });
    expect(result?.source).toBe('overpass');
    expect(fetchOverpassElements).toHaveBeenCalledTimes(1);
  });

  it('caches by geometry so a second call does not refetch', async () => {
    fetchOverpassElements.mockResolvedValue([overpassWay(9, 0, 20, { highway: 'residential' })]);
    await fetchCorridorWays(LINE);
    await fetchCorridorWays(LINE);
    expect(fetchOverpassElements).toHaveBeenCalledTimes(1);
  });

  it('returns null fail-soft on errors and empty results', async () => {
    fetchOverpassElements.mockRejectedValue(new Error('down'));
    expect(await fetchCorridorWays(LINE)).toBeNull();
    clearRoadAttributesCache();
    fetchOverpassElements.mockResolvedValue([]);
    expect(await fetchCorridorWays(LINE)).toBeNull();
    expect(await fetchCorridorWays([LINE[0]])).toBeNull();
  });

  it('does not cache a failure, so the next call tries again', async () => {
    fetchOverpassElements.mockRejectedValueOnce(new Error('down'));
    expect(await fetchCorridorWays(LINE)).toBeNull();
    fetchOverpassElements.mockResolvedValue([overpassWay(9, 0, 20, { highway: 'residential' })]);
    expect((await fetchCorridorWays(LINE))?.source).toBe('overpass');
    expect(fetchOverpassElements).toHaveBeenCalledTimes(2);
  });
});

describe('analyzeRouteStress / measureRouteStress', () => {
  it('assigns LTS per segment and rolls it up', async () => {
    fetchOverpassElements.mockResolvedValue([
      overpassWay(1, 0, 10, { highway: 'cycleway' }),
      overpassWay(2, 10, 20, { highway: 'primary', maxspeed: '45 mph', lanes: '4' }),
    ]);
    const result = await measureRouteStress(LINE);
    expect(result?.source).toBe('overpass');
    expect(result?.ltsSegments).toHaveLength(20);
    expect(result?.ltsSegments.slice(0, 10)).toEqual(Array(10).fill(1));
    expect(result?.ltsSegments.slice(10)).toEqual(Array(10).fill(4));
    expect(result?.summary.quietPct).toBe(50);
    expect(result?.summary.lts4Km).toBeCloseTo(0.853, 2);
    expect(result?.summary.maxContinuousLts4Km).toBeCloseTo(0.853, 2);
    // Facilities ride the same ways: the cycleway half is protected, the primary half has none.
    expect(result?.facilities.slice(0, 10)).toEqual(Array(10).fill('protected'));
    expect(result?.facilities.slice(10)).toEqual(Array(10).fill('none'));
    expect(result?.facility.facilityPct).toBe(50);
    expect(result?.facility.kmByKind.protected).toBeCloseTo(0.853, 2);
  });

  it('marks unmatched stretches as unknown (0)', () => {
    const corridor = { ways: [taggedWay(-1, 0, 5, { highway: 'residential', maxspeed: '30' })], source: 'brouter' as const };
    const result = analyzeRouteStress(LINE, corridor);
    expect(result?.ltsSegments.slice(0, 5)).toEqual(Array(5).fill(1));
    expect(result?.ltsSegments.slice(6)).toEqual(Array(14).fill(0));
    expect(result?.summary.unknownPct).toBeGreaterThan(60);
    expect(result?.facilities.slice(6)).toEqual(Array(14).fill('unknown'));
    expect(result?.facility.knownKm).toBeCloseTo(result!.summary.knownKm, 3);
  });

  it('builds a coloured feature collection grouped by LTS', () => {
    const fc = createStressRoute(LINE.slice(0, 5), [1, 1, 4, 4]);
    expect(fc?.features).toHaveLength(2);
    expect(fc?.features[0].properties?.label).toBe('Calm');
    expect(fc?.features[1].properties?.lts).toBe(4);
  });
});

describe('analyzeRouteSurface / measureRouteSurface', () => {
  it('infers every segment, tagged or not, and rolls up provenance', () => {
    const corridor = {
      ways: [
        taggedWay(-1, 0, 5, { highway: 'residential', surface: 'asphalt' }),
        taggedWay(-2, 5, 10, { highway: 'track', tracktype: 'grade3' }),
        taggedWay(-3, 10, 15, { highway: 'track' }),
        taggedWay(-4, 15, 20, { highway: 'residential' }),
      ],
      source: 'brouter_trace' as const,
    };
    const result = analyzeRouteSurface(LINE, corridor);
    expect(result?.segments.slice(0, 5)).toEqual(Array(5).fill('paved'));
    expect(result?.segments.slice(5, 15)).toEqual(Array(10).fill('unpaved'));
    expect(result?.segments.slice(15)).toEqual(Array(5).fill('unknown'));
    expect(result?.inferences[7].detail).toBe('tracktype=grade3');
    expect(result?.inferences[12].detail).toBe('highway=track');
    expect(result?.summary.taggedPct).toBe(25);
    expect(result?.summary.inferredPct).toBe(50);
    expect(result?.summary.unknownPct).toBe(25);
    expect(result?.summary.gravelPct).toBe(50);
    expect(result?.source).toBe('brouter_trace');
  });

  it('shares one corridor fetch between surface and stress, even when they race', async () => {
    let resolveTrace: (v: TaggedWay[]) => void = () => {};
    traceTaggedWaysWithBRouter.mockReturnValue(
      new Promise<TaggedWay[]>((resolve) => {
        resolveTrace = resolve;
      }),
    );
    const surfaceP = measureRouteSurface(LINE);
    const stressP = measureRouteStress(LINE);
    resolveTrace([taggedWay(-1, 0, 20, { highway: 'track', surface: 'gravel', maxspeed: '30' })]);
    const [surface, stress] = await Promise.all([surfaceP, stressP]);
    expect(traceTaggedWaysWithBRouter).toHaveBeenCalledTimes(1);
    expect(surface?.summary.gravelPct).toBe(100);
    expect(stress?.summary.quietPct).toBe(100);
  });
});
