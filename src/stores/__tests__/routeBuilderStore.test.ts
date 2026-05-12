import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * Mirror the T1.2 waypoint shape migration from routeBuilderStore.js.
 */
function migrateWaypoints(state: Record<string, any>) {
  if (Array.isArray(state.waypoints)) {
    state.waypoints = state.waypoints
      .map((wp: any) => {
        if (!wp) return null;
        if (Array.isArray(wp.position) && wp.position.length === 2) {
          return wp;
        }
        const lng = wp.position?.lng ?? wp.lng ?? wp.lon ?? wp.longitude;
        const lat = wp.position?.lat ?? wp.lat ?? wp.latitude;
        if (typeof lng === 'number' && typeof lat === 'number') {
          return { ...wp, position: [lng, lat] };
        }
        return null;
      })
      .filter(Boolean);
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

describe('routeBuilderStore waypoint shape migration (T1.2)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('passes canonical [lng, lat] tuple waypoints through unchanged', () => {
    const wp = { id: 'a', position: [-105.27, 40.01], type: 'start', name: 'Start' };
    const state = { waypoints: [wp] };
    expect(migrateWaypoints(state).waypoints).toEqual([wp]);
  });

  it('converts a {lng, lat} object position to a tuple', () => {
    const state = {
      waypoints: [
        { id: 'a', position: { lng: -105.27, lat: 40.01 }, type: 'start' },
      ],
    };
    const out = migrateWaypoints(state);
    expect(out.waypoints[0].position).toEqual([-105.27, 40.01]);
  });

  it('converts a flat {lat, lng} waypoint to a canonical position tuple', () => {
    const state = {
      waypoints: [{ id: 'a', lng: -105.27, lat: 40.01, name: 'Start' }],
    };
    const out = migrateWaypoints(state);
    expect(out.waypoints[0].position).toEqual([-105.27, 40.01]);
  });

  it('drops malformed waypoints that have no usable coordinate', () => {
    const state = {
      waypoints: [
        { id: 'a', position: [-105.27, 40.01], type: 'start' },
        { id: 'b', name: 'nope' },
        null,
      ],
    };
    const out = migrateWaypoints(state);
    expect(out.waypoints).toHaveLength(1);
    expect(out.waypoints[0].id).toBe('a');
  });

  it('is a no-op when state has no waypoints array', () => {
    expect(migrateWaypoints({ foo: 1 })).toEqual({ foo: 1 });
  });
});
