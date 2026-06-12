import { describe, it, expect } from 'vitest';
import { rankRoutesByFit, targetDistanceKm } from '../rankRoutes';

const routes = [
  { id: 'a', name: 'Long', distance_km: 80 },
  { id: 'b', name: 'Spot on', distance_km: 41 },
  { id: 'c', name: 'Short', distance_km: 15 },
  { id: 'd', name: 'No distance' },
];

describe('rankRoutesByFit', () => {
  it('orders closest-to-target first', () => {
    const ranked = rankRoutesByFit(routes, 40);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('bands fit by percentage of target', () => {
    const ranked = rankRoutesByFit(routes, 40);
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.fit]));
    expect(byId.b).toBe('great'); // 41 vs 40 → 2.5%
    expect(byId.c).toBe('far'); // 15 vs 40 → 62%
    expect(byId.d).toBeNull(); // no distance
  });

  it('preserves order and nulls fit when there is no target', () => {
    const ranked = rankRoutesByFit(routes, null);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(ranked.every((r) => r.fit === null)).toBe(true);
  });

  it('routes missing a distance sort last', () => {
    const ranked = rankRoutesByFit(routes, 40);
    expect(ranked[ranked.length - 1].id).toBe('d');
  });
});

describe('targetDistanceKm', () => {
  it('prefers an explicit target distance', () => {
    expect(targetDistanceKm({ targetDistanceKm: 55, targetDurationMinutes: 120 })).toBe(55);
  });

  it('estimates from duration when no distance', () => {
    expect(targetDistanceKm({ targetDistanceKm: null, targetDurationMinutes: 120 })).toBe(52);
  });

  it('returns null with nothing usable', () => {
    expect(targetDistanceKm(null)).toBeNull();
    expect(targetDistanceKm({ targetDistanceKm: null, targetDurationMinutes: null })).toBeNull();
  });
});
