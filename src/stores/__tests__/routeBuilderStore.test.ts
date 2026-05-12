import { describe, expect, it } from 'vitest';

/**
 * Reproduce the persist middleware's `onRehydrateStorage` migration so we
 * can verify it without instantiating the full store (which depends on a
 * browser localStorage). The migration is also embedded in
 * src/stores/routeBuilderStore.js — keep these in sync.
 */
function migrateRouteStats(state: Record<string, any>) {
  if (state.routeStats) {
    const s = state.routeStats;
    if (s.distance !== undefined && s.distance_km === undefined) {
      s.distance_km = s.distance > 1000 ? s.distance / 1000 : s.distance;
      delete s.distance;
    }
    if (s.elevation !== undefined && s.elevation_gain_m === undefined) {
      s.elevation_gain_m = s.elevation;
      delete s.elevation;
    }
    if (s.duration !== undefined && s.duration_s === undefined) {
      s.duration_s = s.duration;
      delete s.duration;
    }
  }
  return state;
}

describe('routeBuilderStore hydration migration', () => {
  it('converts the buggy meters-as-km value back to km (47000 → 47)', () => {
    const state = { routeStats: { distance: 47_000, elevation: 350, duration: 6000 } };
    const migrated = migrateRouteStats(state);
    expect(migrated.routeStats).toEqual({
      distance_km: 47,
      elevation_gain_m: 350,
      duration_s: 6000,
    });
  });

  it('leaves a small distance value as km (47 → 47)', () => {
    const state = { routeStats: { distance: 47, elevation: 350, duration: 6000 } };
    const migrated = migrateRouteStats(state);
    expect(migrated.routeStats.distance_km).toBe(47);
  });

  it('is idempotent on already-migrated state', () => {
    const state = {
      routeStats: { distance_km: 47, elevation_gain_m: 350, duration_s: 6000 },
    };
    const migrated = migrateRouteStats(state);
    expect(migrated.routeStats).toEqual({
      distance_km: 47,
      elevation_gain_m: 350,
      duration_s: 6000,
    });
  });

  it('passes through state without routeStats', () => {
    const state = { somethingElse: 1 };
    expect(migrateRouteStats(state)).toEqual({ somethingElse: 1 });
  });

  it('removes legacy field names so consumers only see suffixed names', () => {
    const state = { routeStats: { distance: 47, elevation: 350, duration: 6000 } };
    const migrated = migrateRouteStats(state);
    expect(migrated.routeStats.distance).toBeUndefined();
    expect(migrated.routeStats.elevation).toBeUndefined();
    expect(migrated.routeStats.duration).toBeUndefined();
  });
});
