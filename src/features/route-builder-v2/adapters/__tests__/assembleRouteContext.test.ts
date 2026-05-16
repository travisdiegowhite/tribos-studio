import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assembleRouteContext,
  computeBboxFromCoordinates,
  clearPastRidesCache,
  getRelevantPastRides,
  RouteContextError,
  toExecutorContext,
} from '../assembleRouteContext';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: any[]) => mockGetUser(...args),
    },
    from: (...args: any[]) => mockFromBuilder(...args),
  },
}));

function buildSelectChain(data: unknown, error: unknown = null) {
  const chain: any = {};
  ['select', 'eq', 'order', 'limit', 'single'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.single = vi.fn(() => Promise.resolve({ data, error }));
  chain.then = (resolve: Function) => resolve({ data, error });
  return chain;
}

describe('computeBboxFromCoordinates', () => {
  it('returns undefined for empty / nullish input', () => {
    expect(computeBboxFromCoordinates(undefined)).toBeUndefined();
    expect(computeBboxFromCoordinates([])).toBeUndefined();
  });

  it('computes [west, south, east, north]', () => {
    const bbox = computeBboxFromCoordinates([
      [-105, 40],
      [-104, 41],
      [-106, 39],
    ]);
    expect(bbox).toEqual([-106, 39, -104, 41]);
  });
});

describe('getRelevantPastRides caching', () => {
  beforeEach(() => {
    clearPastRidesCache();
    vi.clearAllMocks();
  });

  it('caches the result by user_id+bbox for 1hr', async () => {
    mockFromBuilder.mockReturnValue(buildSelectChain([{ id: 'r1' }, { id: 'r2' }]));
    const t0 = 1_000_000_000;
    const a = await getRelevantPastRides('u1', undefined, undefined, { now: t0 });
    const b = await getRelevantPastRides('u1', undefined, undefined, { now: t0 + 1000 });
    expect(a).toBe(b);
    expect(mockFromBuilder).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache expires', async () => {
    mockFromBuilder.mockReturnValue(buildSelectChain([{ id: 'r1' }]));
    const t0 = 1_000_000_000;
    await getRelevantPastRides('u1', undefined, undefined, { now: t0 });
    await getRelevantPastRides('u1', undefined, undefined, {
      now: t0 + 61 * 60 * 1000,
    });
    expect(mockFromBuilder).toHaveBeenCalledTimes(2);
  });

  it('tolerates errors from supabase — returns empty', async () => {
    mockFromBuilder.mockReturnValue(buildSelectChain(null, { message: 'fail' }));
    const r = await getRelevantPastRides('u1', undefined, undefined, { now: 0 });
    expect(r.summaries).toEqual([]);
  });
});

describe('assembleRouteContext', () => {
  beforeEach(() => {
    clearPastRidesCache();
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('throws RouteContextError when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(assembleRouteContext()).rejects.toBeInstanceOf(RouteContextError);
  });

  it('returns a populated context for an authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-abc' } },
      error: null,
    });
    let call = 0;
    mockFromBuilder.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        // user_preferences_complete (.single)
        return buildSelectChain({
          home_longitude: -105.1,
          home_latitude: 40.1,
          average_speed_kph: 26,
        });
      }
      if (call === 2) {
        // training_context (.single)
        return buildSelectChain({
          primary_goal: 'fitness',
          typical_ride_time: 75,
        });
      }
      // activities (thenable)
      return buildSelectChain([{ id: 'a1' }, { id: 'a2' }]);
    });

    const ctx = await assembleRouteContext({ now: 1_700_000_000_000 });
    expect(ctx.user_id).toBe('user-abc');
    expect(ctx.start_coord).toEqual([-105.1, 40.1]);
    expect(ctx.speed_profile?.flat_kph).toBe(26);
    expect(ctx.training_goal).toBe('fitness');
    expect(ctx.duration_target_minutes).toBe(75);
    expect(ctx.recent_rides?.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(ctx.persistent_facts).toEqual([]);
    expect(ctx.session_facts).toEqual([]);
    expect(ctx.weather).toBeUndefined();
    expect(ctx.time_of_day).toBe(new Date(1_700_000_000_000).toISOString());
    expect(ctx.current_region_bbox).toBeDefined();
  });

  it('falls back to defaults when profile lookups error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-x' } },
      error: null,
    });
    mockFromBuilder.mockReturnValue(buildSelectChain(null, { message: 'no row' }));
    const ctx = await assembleRouteContext({ now: 0 });
    expect(ctx.user_id).toBe('user-x');
    expect(ctx.start_coord).toBeDefined();
    expect(ctx.recent_rides).toEqual([]);
  });
});

describe('toExecutorContext', () => {
  it('narrows to the executor-visible subset', () => {
    const exec = toExecutorContext({
      user_id: 'u',
      start_coord: [-105, 40],
      current_region_bbox: [-106, 39, -104, 41],
      training_goal: 'endurance',
      duration_target_minutes: 60,
      distance_target_km: 30,
      speed_profile: { flat_kph: 25 },
      preferences: { x: 1 },
      familiar_segments: ['seg-1'],
      recent_rides: [{ id: 'r1', waypoints: [] }],
      persistent_facts: [],
      session_facts: [],
      weather: undefined,
      time_of_day: '2026-01-01T00:00:00Z',
      mapbox_token: 'tok',
    });
    expect(exec.user_id).toBe('u');
    expect(exec.training_goal).toBe('endurance');
    expect(exec.start_coord).toEqual([-105, 40]);
    expect(exec.user_speed_kph).toBe(25);
    expect(exec.familiar_segments).toEqual(['seg-1']);
    expect(exec.mapbox_token).toBe('tok');
    // current_region_bbox is not part of the executor surface
    expect((exec as Record<string, unknown>).current_region_bbox).toBeUndefined();
  });
});
