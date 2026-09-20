import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const measureRouteSurface = vi.fn();
vi.mock('../../../utils/roadAttributes', () => ({
  measureRouteSurface: (...a: unknown[]) => measureRouteSurface(...a),
}));
const trackRb2 = vi.fn();
vi.mock('../../../features/route-builder-v2/telemetry/trackRb2', () => ({
  trackRb2: (...a: unknown[]) => trackRb2(...a),
}));

import { useRouteSurface, SURFACE_DEBOUNCE_MS, SURFACE_RETRY_MS } from '../useRouteSurface';
import type { Coordinate } from '../../../types/geo';

const result = {
  segments: ['gravel', 'paved'],
  inferences: [],
  summary: {
    totalKm: 0.2,
    knownKm: 0.2,
    kmByCategory: { paved: 0.1, gravel: 0.1, unpaved: 0, unknown: 0 },
    distribution: { paved: 50, gravel: 50 },
    gravelPct: 50,
    taggedPct: 80,
    inferredPct: 20,
    unknownPct: 0,
    evidenceKm: { paved: {}, gravel: {}, unpaved: {}, unknown: {} },
  },
  source: 'brouter_trace' as const,
};

const geomA = { coordinates: [[-105, 40], [-105.01, 40.01], [-105.02, 40.02]] as Coordinate[] };
const geomB = { coordinates: [[-105, 40], [-105.03, 40.01], [-105.02, 40.02]] as Coordinate[] };

beforeEach(() => {
  vi.useFakeTimers();
  measureRouteSurface.mockReset();
  trackRb2.mockReset();
});
afterEach(() => vi.useRealTimers());

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SURFACE_DEBOUNCE_MS + 10);
  });
}

describe('useRouteSurface', () => {
  it('is idle with no geometry and never fetches', () => {
    const { result: r } = renderHook(() => useRouteSurface(null));
    expect(r.current.status).toBe('idle');
    expect(measureRouteSurface).not.toHaveBeenCalled();
  });

  it('debounces, then measures and reports ready with telemetry', async () => {
    measureRouteSurface.mockResolvedValue(result);
    const { result: r } = renderHook(() => useRouteSurface(geomA));
    expect(r.current.status).toBe('loading');
    await flush();
    expect(measureRouteSurface).toHaveBeenCalledWith(geomA.coordinates, { taggedWays: null });
    expect(r.current.status).toBe('ready');
    expect(r.current.result).toEqual(result);
    expect(trackRb2).toHaveBeenCalledWith('surface_computed', expect.objectContaining({ gravel_pct: 50, inferred_pct: 20 }));
  });

  it('only fetches the settled geometry when it changes within the debounce', async () => {
    measureRouteSurface.mockResolvedValue(result);
    const { rerender } = renderHook(({ g }) => useRouteSurface(g), { initialProps: { g: geomA } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ g: geomB });
    await flush();
    expect(measureRouteSurface).toHaveBeenCalledTimes(1);
    expect(measureRouteSurface).toHaveBeenCalledWith(geomB.coordinates, { taggedWays: null });
  });

  it('retries once after a null result, then reports unavailable', async () => {
    measureRouteSurface.mockResolvedValue(null);
    const { result: r } = renderHook(() => useRouteSurface(geomA));
    await flush();
    expect(r.current.status).toBe('loading');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SURFACE_RETRY_MS + 10);
    });
    expect(measureRouteSurface).toHaveBeenCalledTimes(2);
    expect(r.current.status).toBe('unavailable');
    expect(trackRb2).not.toHaveBeenCalled();
  });

  it('clears when the geometry goes away', async () => {
    measureRouteSurface.mockResolvedValue(result);
    const { result: r, rerender } = renderHook(
      ({ g }: { g: { coordinates: Coordinate[] } | null }) => useRouteSurface(g),
      { initialProps: { g: geomA as { coordinates: Coordinate[] } | null } },
    );
    await flush();
    expect(r.current.status).toBe('ready');
    rerender({ g: null });
    expect(r.current.status).toBe('idle');
    expect(r.current.result).toBeNull();
  });
});
