import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchOverpassElements = vi.fn();
vi.mock('../overpassClient', () => ({
  fetchOverpassElements: (...a: unknown[]) => fetchOverpassElements(...a),
}));

import {
  buildCorridorQuery,
  sampleCorridorPoints,
  elementsToTaggedWays,
  fetchCorridorWays,
  analyzeRouteStress,
  measureRouteStress,
  createStressRoute,
  clearRoadAttributesCache,
  CORRIDOR_M,
} from '../roadAttributes';
import type { Coordinate } from '../../types/geo';
import type { TaggedWay } from '../wayTags';

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
  clearRoadAttributesCache();
});

describe('sampleCorridorPoints / buildCorridorQuery', () => {
  it('keeps first and last points and thins to ~75 m spacing', () => {
    const pts = sampleCorridorPoints(LINE);
    expect(pts[0]).toEqual([LINE[0][0], LINE[0][1]]);
    expect(pts[pts.length - 1]).toEqual([LINE[20][0], LINE[20][1]]);
    // 85 m steps ≥ 75 m spacing → every vertex kept.
    expect(pts.length).toBe(21);
  });

  it('caps the sample count on very long routes', () => {
    const long: Coordinate[] = Array.from({ length: 5000 }, (_, i) => [-105 + i * 0.001, 40]);
    const pts = sampleCorridorPoints(long);
    expect(pts.length).toBeLessThanOrEqual(402);
  });

  it('emits an around: corridor query with lat,lon pairs', () => {
    const q = buildCorridorQuery(LINE.slice(0, 3));
    expect(q).toContain(`(around:${CORRIDOR_M},40.000000,-105.000000,`);
    expect(q).toContain('way["highway"]');
    expect(q).toContain('out geom;');
    expect(q).not.toContain('bbox');
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
  });

  it('marks unmatched stretches as unknown (0)', () => {
    const corridor = { ways: [taggedWay(-1, 0, 5, { highway: 'residential', maxspeed: '30' })], source: 'brouter' as const };
    const result = analyzeRouteStress(LINE, corridor);
    expect(result?.ltsSegments.slice(0, 5)).toEqual(Array(5).fill(1));
    expect(result?.ltsSegments.slice(6)).toEqual(Array(14).fill(0));
    expect(result?.summary.unknownPct).toBeGreaterThan(60);
  });

  it('builds a coloured feature collection grouped by LTS', () => {
    const fc = createStressRoute(LINE.slice(0, 5), [1, 1, 4, 4]);
    expect(fc?.features).toHaveLength(2);
    expect(fc?.features[0].properties?.label).toBe('Calm');
    expect(fc?.features[1].properties?.lts).toBe(4);
  });
});
