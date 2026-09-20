import { describe, it, expect, vi, beforeEach } from 'vitest';

const measureRouteSurface = vi.fn();
vi.mock('../roadAttributes', () => ({
  measureRouteSurface: (...a: unknown[]) => measureRouteSurface(...a),
}));

import { measureGravelPct, clearSurfaceCache } from '../surfaceMeasurement';
import type { Coordinate } from '../../types/geo';

const geo = (n: number): Coordinate[] =>
  Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001] as Coordinate);

function measured(summary: Record<string, unknown>) {
  return { segments: [], inferences: [], source: 'brouter_trace', summary };
}

beforeEach(() => {
  measureRouteSurface.mockReset();
  clearSurfaceCache();
});

describe('measureGravelPct', () => {
  it('reports gravel + unpaved share, the distribution and the provenance split', async () => {
    measureRouteSurface.mockResolvedValue(
      measured({ gravelPct: 48, distribution: { gravel: 30, unpaved: 18, paved: 52 }, inferredPct: 12, unknownPct: 0 }),
    );
    const result = await measureGravelPct(geo(20));
    expect(result).toEqual({
      gravelPct: 48,
      distribution: { gravel: 30, unpaved: 18, paved: 52 },
      inferredPct: 12,
      unknownPct: 0,
    });
  });

  it('hands the router tags through so a covered route needs no network', async () => {
    measureRouteSurface.mockResolvedValue(measured({ gravelPct: 100, distribution: { gravel: 100 }, inferredPct: 0, unknownPct: 0 }));
    const ways = [{ id: -1, geometry: geo(2), tags: { surface: 'gravel' } }];
    await measureGravelPct(geo(20), { ways });
    expect(measureRouteSurface).toHaveBeenCalledWith(expect.any(Array), { taggedWays: ways });
  });

  it('caches by geometry — a second call avoids a second measurement', async () => {
    measureRouteSurface.mockResolvedValue(measured({ gravelPct: 100, distribution: { gravel: 100 }, inferredPct: 0, unknownPct: 0 }));
    const g = geo(20);
    await measureGravelPct(g);
    await measureGravelPct(g);
    expect(measureRouteSurface).toHaveBeenCalledTimes(1);
  });

  it('returns null fail-soft and does not cache the failure', async () => {
    measureRouteSurface.mockResolvedValueOnce(null);
    expect(await measureGravelPct(geo(20))).toBeNull();
    measureRouteSurface.mockRejectedValueOnce(new Error('down'));
    expect(await measureGravelPct(geo(20))).toBeNull();
    measureRouteSurface.mockResolvedValueOnce(measured({ gravelPct: 10, distribution: { gravel: 10 }, inferredPct: 0, unknownPct: 0 }));
    expect((await measureGravelPct(geo(20)))?.gravelPct).toBe(10);
    expect(measureRouteSurface).toHaveBeenCalledTimes(3);
  });

  it('returns null for degenerate geometry without measuring', async () => {
    expect(await measureGravelPct([[-105, 40]] as Coordinate[])).toBeNull();
    expect(measureRouteSurface).not.toHaveBeenCalled();
  });
});
