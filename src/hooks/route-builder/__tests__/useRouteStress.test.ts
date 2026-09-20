import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const measureRouteStress = vi.fn();
vi.mock('../../../utils/roadAttributes', () => ({
  measureRouteStress: (...a: unknown[]) => measureRouteStress(...a),
}));
const trackRb2 = vi.fn();
vi.mock('../../../features/route-builder-v2/telemetry/trackRb2', () => ({
  trackRb2: (...a: unknown[]) => trackRb2(...a),
}));

import { useRouteStress, STRESS_DEBOUNCE_MS, STRESS_RETRY_MS } from '../useRouteStress';
import type { Coordinate } from '../../../types/geo';

const result = {
  ltsSegments: [1, 2],
  summary: {
    totalKm: 0.2,
    knownKm: 0.2,
    kmByLts: { 0: 0, 1: 0.1, 2: 0.1, 3: 0, 4: 0 },
    quietPct: 100,
    unknownPct: 0,
    stressScore: 0.17,
    lts4Km: 0,
    maxContinuousLts4Km: 0,
  },
  source: 'overpass' as const,
};

const geomA = { coordinates: [[-105, 40], [-105.01, 40.01], [-105.02, 40.02]] as Coordinate[] };
const geomB = { coordinates: [[-105, 40], [-105.03, 40.01], [-105.02, 40.02]] as Coordinate[] };

beforeEach(() => {
  vi.useFakeTimers();
  measureRouteStress.mockReset();
  trackRb2.mockReset();
});
afterEach(() => vi.useRealTimers());

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STRESS_DEBOUNCE_MS + 10);
  });
}

describe('useRouteStress', () => {
  it('is idle with no geometry and never fetches', () => {
    const { result: r } = renderHook(() => useRouteStress(null));
    expect(r.current.status).toBe('idle');
    expect(r.current.result).toBeNull();
    expect(measureRouteStress).not.toHaveBeenCalled();
  });

  it('debounces, then measures and reports ready with telemetry', async () => {
    measureRouteStress.mockResolvedValue(result);
    const { result: r } = renderHook(() => useRouteStress(geomA));
    expect(r.current.status).toBe('loading');
    expect(measureRouteStress).not.toHaveBeenCalled();
    await flush();
    expect(measureRouteStress).toHaveBeenCalledTimes(1);
    expect(measureRouteStress).toHaveBeenCalledWith(geomA.coordinates, { taggedWays: null });
    expect(r.current.status).toBe('ready');
    expect(r.current.result).toEqual(result);
    expect(trackRb2).toHaveBeenCalledWith('stress_computed', expect.objectContaining({ quiet_pct: 100 }));
  });

  it('only fetches the settled geometry when it changes within the debounce', async () => {
    measureRouteStress.mockResolvedValue(result);
    const { rerender } = renderHook(({ g }) => useRouteStress(g), { initialProps: { g: geomA } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ g: geomB });
    await flush();
    expect(measureRouteStress).toHaveBeenCalledTimes(1);
    expect(measureRouteStress).toHaveBeenCalledWith(geomB.coordinates, { taggedWays: null });
  });

  it('retries once after a null result, then reports unavailable', async () => {
    measureRouteStress.mockResolvedValue(null);
    const { result: r } = renderHook(() => useRouteStress(geomA));
    await flush();
    expect(r.current.status).toBe('loading');
    expect(measureRouteStress).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STRESS_RETRY_MS + 10);
    });
    expect(measureRouteStress).toHaveBeenCalledTimes(2);
    expect(r.current.status).toBe('unavailable');
    expect(r.current.result).toBeNull();
    expect(trackRb2).not.toHaveBeenCalled();
  });

  it('recovers when the retry succeeds', async () => {
    measureRouteStress.mockResolvedValueOnce(null).mockResolvedValueOnce(result);
    const { result: r } = renderHook(() => useRouteStress(geomA));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STRESS_RETRY_MS + 10);
    });
    expect(r.current.status).toBe('ready');
    expect(r.current.result).toEqual(result);
  });

  it('clears when the geometry goes away', async () => {
    measureRouteStress.mockResolvedValue(result);
    const { result: r, rerender } = renderHook(
      ({ g }: { g: { coordinates: Coordinate[] } | null }) => useRouteStress(g),
      { initialProps: { g: geomA as { coordinates: Coordinate[] } | null } },
    );
    await flush();
    expect(r.current.status).toBe('ready');
    rerender({ g: null });
    expect(r.current.status).toBe('idle');
    expect(r.current.result).toBeNull();
  });
});
