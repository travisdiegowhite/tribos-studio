import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../brouter', () => ({
  getBRouterDirections: vi.fn(),
  BROUTER_PROFILES: { GRAVEL: 'gravel', TREKKING: 'trekking' },
}));

import {
  sampleVias,
  traceTaggedWaysWithBRouter,
  TRACE_MAX_VIAS,
  TRACE_MIN_SPACING_M,
} from '../brouterTrace';
import { getBRouterDirections } from '../brouter';
import { haversineMeters } from '../distanceUnits';
import type { Coordinate } from '../../types/geo';

const mockBRouter = vi.mocked(getBRouterDirections);

beforeEach(() => mockBRouter.mockReset());

/** n vertices east along 40°N, ~85 m apart. */
function line(n: number): Coordinate[] {
  return Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40]);
}

describe('sampleVias', () => {
  it('keeps both endpoints and spaces vias evenly by distance', () => {
    const coords = line(120); // ≈10.2 km → 21 vias
    const vias = sampleVias(coords);
    expect(vias[0]).toEqual(coords[0]);
    expect(vias[vias.length - 1]).toEqual(coords[coords.length - 1]);
    expect(vias.length).toBe(Math.floor(10160 / TRACE_MIN_SPACING_M) + 1);
    const gaps = vias.slice(1).map((v, i) => haversineMeters(vias[i][1], vias[i][0], v[1], v[0]));
    for (const g of gaps.slice(0, -1)) {
      expect(g).toBeGreaterThan(TRACE_MIN_SPACING_M * 0.8);
      expect(g).toBeLessThan(TRACE_MIN_SPACING_M * 1.3);
    }
  });

  it('caps at TRACE_MAX_VIAS on long routes', () => {
    expect(sampleVias(line(2000)).length).toBe(TRACE_MAX_VIAS); // ≈170 km
  });

  it('uses just the endpoints on a short line', () => {
    const vias = sampleVias(line(5)); // ≈340 m
    expect(vias).toEqual([line(5)[0], line(5)[4]]);
  });

  it('returns copies, never the caller’s tuples', () => {
    const coords = line(3);
    const vias = sampleVias(coords);
    expect(vias[0]).not.toBe(coords[0]);
  });
});

describe('traceTaggedWaysWithBRouter', () => {
  it('re-rides through the sampled vias with the trekking profile and returns the tags', async () => {
    const ways = [{ id: -1, geometry: line(3), tags: { highway: 'residential' } }];
    mockBRouter.mockResolvedValueOnce({ taggedWays: ways } as never);
    const result = await traceTaggedWaysWithBRouter(line(120));
    expect(result).toBe(ways);
    expect(mockBRouter).toHaveBeenCalledTimes(1);
    const [vias, opts] = mockBRouter.mock.calls[0] as unknown as [Coordinate[], { profile: string }];
    expect(vias.length).toBe(21);
    expect(opts.profile).toBe('trekking');
  });

  it('is null when BRouter has no route, no tags, or throws', async () => {
    mockBRouter.mockResolvedValueOnce(null as never);
    expect(await traceTaggedWaysWithBRouter(line(10))).toBeNull();
    mockBRouter.mockResolvedValueOnce({ taggedWays: [] } as never);
    expect(await traceTaggedWaysWithBRouter(line(10))).toBeNull();
    mockBRouter.mockRejectedValueOnce(new Error('down'));
    expect(await traceTaggedWaysWithBRouter(line(10))).toBeNull();
    expect(await traceTaggedWaysWithBRouter([line(1)[0]])).toBeNull();
  });

  it('honours an injected fetcher', async () => {
    const fetchRoute = vi.fn().mockResolvedValue({ taggedWays: [{ id: -1, geometry: line(2), tags: {} }] });
    const result = await traceTaggedWaysWithBRouter(line(10), { fetchRoute, profile: 'gravel' });
    expect(result).toHaveLength(1);
    expect(fetchRoute).toHaveBeenCalledWith(expect.any(Array), { profile: 'gravel', tribos: false });
    expect(mockBRouter).not.toHaveBeenCalled();
  });
});
