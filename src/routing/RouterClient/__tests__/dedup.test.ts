import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InFlightDedup } from '../dedup';
import type { ExecutorResult } from '../types';

function fakeResult(): ExecutorResult {
  return {
    ok: true,
    route: {
      geometry: [
        [-105.1, 40.0],
        [-105.0, 40.1],
      ],
      waypoints: [],
      stats: {
        distance_km: 10,
        elevation_gain_m: 0,
        elevation_loss_m: 0,
        duration_s: 1800,
      },
    },
    metadata: {
      provider_used: 'stadia',
      duration_ms: 100,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

describe('InFlightDedup', () => {
  describe('basic dedupe behavior', () => {
    it('invokes the factory exactly once for two simultaneous calls with the same key', async () => {
      const dedup = new InFlightDedup(100);
      const factory = vi.fn().mockResolvedValue(fakeResult());

      const a = dedup.dedupe('k', factory);
      const b = dedup.dedupe('k', factory);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(a.deduped).toBe(false);
      expect(b.deduped).toBe(true);

      const [ra, rb] = await Promise.all([a.promise, b.promise]);
      expect(ra).toBe(rb);
    });

    it('different keys invoke separate factories', async () => {
      const dedup = new InFlightDedup(100);
      const factory = vi.fn().mockResolvedValue(fakeResult());

      dedup.dedupe('a', factory);
      dedup.dedupe('b', factory);

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('window expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls outside the window do not dedupe', async () => {
      const dedup = new InFlightDedup(100);
      const factory = vi.fn().mockResolvedValue(fakeResult());

      const first = dedup.dedupe('k', factory);
      // Don't await the first one's completion; advance past the dedup
      // window. The second call should NOT join the in-flight one.
      vi.advanceTimersByTime(150);

      const second = dedup.dedupe('k', factory);
      expect(second.deduped).toBe(false);
      expect(factory).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
      await Promise.all([first.promise, second.promise]);
    });

    it('reports wait_ms when joining an in-flight request', async () => {
      const dedup = new InFlightDedup(100);
      const factory = vi.fn().mockResolvedValue(fakeResult());

      dedup.dedupe('k', factory);
      vi.advanceTimersByTime(50);
      const second = dedup.dedupe('k', factory);

      expect(second.deduped).toBe(true);
      expect(second.wait_ms).toBeGreaterThanOrEqual(50);
      expect(second.wait_ms).toBeLessThan(100);
    });
  });

  describe('cleanup', () => {
    it('removes the entry after the promise resolves', async () => {
      const dedup = new InFlightDedup(1000);
      const factory = vi.fn().mockResolvedValue(fakeResult());

      const { promise } = dedup.dedupe('k', factory);
      expect(dedup.size()).toBe(1);
      await promise;
      expect(dedup.size()).toBe(0);
    });

    it('removes the entry even when the factory rejects', async () => {
      const dedup = new InFlightDedup(1000);
      const factory = vi.fn().mockRejectedValue(new Error('boom'));

      const { promise } = dedup.dedupe('k', factory);
      await expect(promise).rejects.toThrow('boom');
      expect(dedup.size()).toBe(0);
    });

    it('clear empties the in-flight registry', () => {
      const dedup = new InFlightDedup(1000);
      const factory = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
      dedup.dedupe('a', factory);
      dedup.dedupe('b', factory);
      expect(dedup.size()).toBe(2);
      dedup.clear();
      expect(dedup.size()).toBe(0);
    });
  });
});
