import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ResponseCache,
  cacheKeyForConnect,
  cacheKeyForConstraint,
} from '../cache';
import type { ExecutorResult, RouteConstraint } from '../types';

function fakeResult(distance_km = 10): ExecutorResult {
  return {
    ok: true,
    route: {
      geometry: [
        [-105.1, 40.0],
        [-105.0, 40.1],
      ],
      waypoints: [{ coordinate: [-105.1, 40.0] }, { coordinate: [-105.0, 40.1] }],
      stats: {
        distance_km,
        elevation_gain_m: 100,
        elevation_loss_m: 100,
        duration_s: 1800,
      },
    },
    metadata: {
      provider_used: 'stadia',
      duration_ms: 200,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

describe('ResponseCache', () => {
  describe('basic get/set', () => {
    it('returns null for missing keys', () => {
      const cache = new ResponseCache();
      expect(cache.get('nope')).toBeNull();
    });

    it('returns a stored entry by key', () => {
      const cache = new ResponseCache();
      const r = fakeResult();
      cache.set('a', r);
      expect(cache.get('a')).toBe(r);
    });

    it('size reflects entry count', () => {
      const cache = new ResponseCache();
      expect(cache.size()).toBe(0);
      cache.set('a', fakeResult());
      cache.set('b', fakeResult());
      expect(cache.size()).toBe(2);
    });

    it('clear empties the cache', () => {
      const cache = new ResponseCache();
      cache.set('a', fakeResult());
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('a')).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the entry while inside TTL', () => {
      const cache = new ResponseCache(10, 1000);
      cache.set('a', fakeResult(5));
      vi.advanceTimersByTime(500);
      expect(cache.get('a')).not.toBeNull();
    });

    it('returns null and evicts after TTL', () => {
      const cache = new ResponseCache(10, 1000);
      cache.set('a', fakeResult(5));
      vi.advanceTimersByTime(1001);
      expect(cache.get('a')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('set refreshes the TTL', () => {
      const cache = new ResponseCache(10, 1000);
      cache.set('a', fakeResult(5));
      vi.advanceTimersByTime(900);
      cache.set('a', fakeResult(6));
      vi.advanceTimersByTime(900);
      // Total elapsed = 1800ms, but the second set reset the clock at 900ms.
      // So the entry's effective age is 900ms — still inside TTL.
      const entry = cache.get('a');
      expect(entry).not.toBeNull();
      if (entry && entry.ok) {
        expect(entry.route.stats.distance_km).toBe(6);
      }
    });
  });

  describe('LRU eviction', () => {
    it('evicts the oldest entry when over capacity', () => {
      const cache = new ResponseCache(3, 60_000);
      cache.set('a', fakeResult(1));
      cache.set('b', fakeResult(2));
      cache.set('c', fakeResult(3));
      cache.set('d', fakeResult(4));
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).not.toBeNull();
      expect(cache.get('c')).not.toBeNull();
      expect(cache.get('d')).not.toBeNull();
      expect(cache.size()).toBe(3);
    });

    it('reading an entry marks it recently used', () => {
      const cache = new ResponseCache(3, 60_000);
      cache.set('a', fakeResult(1));
      cache.set('b', fakeResult(2));
      cache.set('c', fakeResult(3));
      // Touch 'a' so it's now most-recently-used.
      cache.get('a');
      cache.set('d', fakeResult(4));
      // 'b' should be evicted, not 'a'.
      expect(cache.get('a')).not.toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).not.toBeNull();
      expect(cache.get('d')).not.toBeNull();
    });

    it('re-setting an existing key does not increase size', () => {
      const cache = new ResponseCache(3, 60_000);
      cache.set('a', fakeResult(1));
      cache.set('a', fakeResult(2));
      expect(cache.size()).toBe(1);
    });
  });
});

describe('cacheKeyForConstraint', () => {
  const baseConstraint: RouteConstraint = {
    waypoints: [
      [-105.1, 40.0],
      [-105.0, 40.1],
    ],
    profile: 'road',
    shape: 'loop',
  };

  it('returns the same key for the same constraint', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {});
    const k2 = cacheKeyForConstraint(baseConstraint, {});
    expect(k1).toBe(k2);
  });

  it('returns the same key when coordinates differ below 6-decimal precision', () => {
    const c1: RouteConstraint = {
      ...baseConstraint,
      waypoints: [
        [-105.1000001, 40.0000001],
        [-105.0, 40.1],
      ],
    };
    const c2: RouteConstraint = {
      ...baseConstraint,
      waypoints: [
        [-105.1, 40.0],
        [-105.0, 40.1],
      ],
    };
    expect(cacheKeyForConstraint(c1, {})).toBe(cacheKeyForConstraint(c2, {}));
  });

  it('returns a different key for different profiles', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {});
    const k2 = cacheKeyForConstraint({ ...baseConstraint, profile: 'gravel' }, {});
    expect(k1).not.toBe(k2);
  });

  it('returns a different key for different waypoints', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {});
    const k2 = cacheKeyForConstraint({
      ...baseConstraint,
      waypoints: [
        [-105.5, 40.0],
        [-105.0, 40.1],
      ],
    }, {});
    expect(k1).not.toBe(k2);
  });

  it('treats avoid_segments as a set (order-independent)', () => {
    const k1 = cacheKeyForConstraint({
      ...baseConstraint,
      avoid_segments: ['a', 'b', 'c'],
    }, {});
    const k2 = cacheKeyForConstraint({
      ...baseConstraint,
      avoid_segments: ['c', 'a', 'b'],
    }, {});
    expect(k1).toBe(k2);
  });

  it('treats undefined and present-but-null preferences as the same', () => {
    // Defensive: an explicit `undefined` and a missing key should both
    // map to the same canonical "no preference" key.
    const k1 = cacheKeyForConstraint(baseConstraint, {});
    const k2 = cacheKeyForConstraint({
      ...baseConstraint,
      target_distance_km: undefined,
    }, {});
    expect(k1).toBe(k2);
  });

  it('produces an 8-char hex digest', () => {
    const k = cacheKeyForConstraint(baseConstraint, {});
    expect(k).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('cacheKeyForConnect', () => {
  it('depends only on waypoints', () => {
    const k1 = cacheKeyForConnect([
      [-105.1, 40.0],
      [-105.0, 40.1],
    ]);
    const k2 = cacheKeyForConnect([
      [-105.1, 40.0],
      [-105.0, 40.1],
    ]);
    expect(k1).toBe(k2);
  });

  it('differs from a solve key with the same waypoints', () => {
    const constraint: RouteConstraint = {
      waypoints: [
        [-105.1, 40.0],
        [-105.0, 40.1],
      ],
      profile: 'road',
      shape: 'point_to_point',
    };
    const solveKey = cacheKeyForConstraint(constraint, {});
    const connectKey = cacheKeyForConnect(constraint.waypoints);
    expect(solveKey).not.toBe(connectKey);
  });
});

describe('exported hash helpers', () => {
  it('exports fnv1a32 and stableJson for sibling caches', async () => {
    // Sibling modules (e.g. `elevationEnrichment`) import these to
    // share canonicalization without duplicating the implementation.
    // If either name disappears the sibling cache breaks silently —
    // this test guards the export surface.
    const mod = await import('../cache');
    expect(typeof mod.fnv1a32).toBe('function');
    expect(typeof mod.stableJson).toBe('function');
    expect(mod.fnv1a32(mod.stableJson({ a: 1, b: [2, 3] }))).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('cacheKeyForConstraint (context)', () => {
  const baseConstraint: RouteConstraint = {
    waypoints: [
      [-105.1, 40.0],
      [-105.0, 40.1],
    ],
    profile: 'road',
    shape: 'loop',
  };

  it('returns different keys for different training_goal', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, { training_goal: 'endurance' });
    const k2 = cacheKeyForConstraint(baseConstraint, { training_goal: 'intervals' });
    expect(k1).not.toBe(k2);
  });

  it('returns different keys for different user_speed_kph', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, { user_speed_kph: 22 });
    const k2 = cacheKeyForConstraint(baseConstraint, { user_speed_kph: 28 });
    expect(k1).not.toBe(k2);
  });

  it('returns different keys for different preferences', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {
      preferences: { avoidHills: true },
    });
    const k2 = cacheKeyForConstraint(baseConstraint, {
      preferences: { avoidHills: false },
    });
    expect(k1).not.toBe(k2);
  });

  it('returns the same key when preferences are key-reordered but otherwise identical', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {
      preferences: { avoidHills: true, avoidTraffic: 'high' },
    });
    const k2 = cacheKeyForConstraint(baseConstraint, {
      preferences: { avoidTraffic: 'high', avoidHills: true },
    });
    expect(k1).toBe(k2);
  });

  it('returns the same key for empty contexts across calls', () => {
    expect(cacheKeyForConstraint(baseConstraint, {})).toBe(
      cacheKeyForConstraint(baseConstraint, {}),
    );
  });

  it('treats undefined fields and missing keys as the same', () => {
    const k1 = cacheKeyForConstraint(baseConstraint, {});
    const k2 = cacheKeyForConstraint(baseConstraint, {
      training_goal: undefined,
      user_speed_kph: undefined,
      preferences: undefined,
    });
    expect(k1).toBe(k2);
  });

  it('empty context differs from a context with a training_goal', () => {
    const empty = cacheKeyForConstraint(baseConstraint, {});
    const withGoal = cacheKeyForConstraint(baseConstraint, { training_goal: 'endurance' });
    expect(empty).not.toBe(withGoal);
  });
});
