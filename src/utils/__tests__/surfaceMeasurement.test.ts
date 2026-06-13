import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchRouteSurfaceData = vi.fn();
const computeSurfaceDistribution = vi.fn();
vi.mock('../surfaceOverlay.js', () => ({
  fetchRouteSurfaceData: (...a: unknown[]) => fetchRouteSurfaceData(...a),
  computeSurfaceDistribution: (...a: unknown[]) => computeSurfaceDistribution(...a),
}));

import { measureGravelPct, clearSurfaceCache } from '../surfaceMeasurement';
import type { Coordinate } from '../../types/geo';

const geo = (n: number): Coordinate[] =>
  Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001] as Coordinate);

beforeEach(() => {
  fetchRouteSurfaceData.mockReset();
  computeSurfaceDistribution.mockReset();
  clearSurfaceCache();
});

describe('measureGravelPct', () => {
  it('sums gravel + unpaved into a single rounded percentage', async () => {
    fetchRouteSurfaceData.mockResolvedValue(['gravel', 'paved', 'unpaved']);
    computeSurfaceDistribution.mockReturnValue({ gravel: 30, unpaved: 18, paved: 52 });

    const result = await measureGravelPct(geo(20));
    expect(result).toEqual({ gravelPct: 48, distribution: { gravel: 30, unpaved: 18, paved: 52 } });
  });

  it('caches by geometry — a second call avoids a second fetch', async () => {
    fetchRouteSurfaceData.mockResolvedValue(['gravel']);
    computeSurfaceDistribution.mockReturnValue({ gravel: 100 });
    const g = geo(20);

    await measureGravelPct(g);
    await measureGravelPct(g);
    expect(fetchRouteSurfaceData).toHaveBeenCalledTimes(1);
  });

  it('returns null fail-soft on empty surface data or error', async () => {
    fetchRouteSurfaceData.mockResolvedValue(null);
    expect(await measureGravelPct(geo(20))).toBeNull();

    clearSurfaceCache();
    fetchRouteSurfaceData.mockRejectedValue(new Error('overpass down'));
    expect(await measureGravelPct(geo(21))).toBeNull();
  });

  it('returns null for degenerate geometry without fetching', async () => {
    expect(await measureGravelPct([[-105, 40]] as Coordinate[])).toBeNull();
    expect(fetchRouteSurfaceData).not.toHaveBeenCalled();
  });
});
