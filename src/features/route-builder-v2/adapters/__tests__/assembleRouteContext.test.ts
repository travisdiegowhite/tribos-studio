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

interface ChainFixture {
  /** `.single()` resolves to this. For non-`.single()` calls the chain
   * is thenable and resolves to `{ data, error }`. */
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function buildSelectChain(fixture: ChainFixture | unknown, error: unknown = null) {
  const resolved =
    typeof fixture === 'object' && fixture !== null && 'data' in (fixture as object) && 'error' in (fixture as object)
      ? (fixture as ChainFixture)
      : { data: fixture, error };
  const chain: any = {};
  ['select', 'eq', 'order', 'limit', 'single'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.single = vi.fn(() => Promise.resolve({ data: resolved.data, error: resolved.error }));
  chain.then = (resolve: Function) => resolve({ data: resolved.data, error: resolved.error });
  return chain;
}

/** Route a `from(tableName)` call to a per-table fixture. */
function routeFromBuilder(map: Record<string, ChainFixture>) {
  mockFromBuilder.mockImplementation((table: string) => {
    const fixture = map[table];
    if (!fixture) {
      // Default: missing-row.
      return buildSelectChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    }
    return buildSelectChain(fixture);
  });
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

  it('throws RouteContextError on a Supabase query failure', async () => {
    mockFromBuilder.mockReturnValue(
      buildSelectChain({ data: null, error: { code: '42703', message: 'undefined_column' } }),
    );
    await expect(
      getRelevantPastRides('u1', undefined, undefined, { now: 0 }),
    ).rejects.toBeInstanceOf(RouteContextError);
  });
});

describe('assembleRouteContext', () => {
  beforeEach(() => {
    clearPastRidesCache();
    vi.clearAllMocks();
    useRouteBuilderStore.getState().resetAll();
  });

  it('throws RouteContextError(no_user) when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(assembleRouteContext()).rejects.toMatchObject({
      name: 'RouteContextError',
      kind: 'no_user',
    });
  });

  it('returns a populated context for an authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-abc' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: {
        data: { id: 'user-abc', primary_goal: 'fitness', ftp: 230, weight_kg: 75 },
        error: null,
      },
      user_speed_profiles: {
        data: { average_speed: 26, road_speed: 28 },
        error: null,
      },
      activities: { data: [{ id: 'a1' }, { id: 'a2' }], error: null },
    });

    const ctx = await assembleRouteContext({ now: 1_700_000_000_000 });

    expect(ctx.user_id).toBe('user-abc');
    expect(ctx.start_coord).toBeUndefined(); // no Boulder default
    expect(ctx.speed_profile?.flat_kph).toBe(26);
    expect(ctx.training_goal).toBe('fitness');
    expect(ctx.preferences).toMatchObject({ id: 'user-abc', primary_goal: 'fitness' });
    expect(ctx.recent_rides?.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(ctx.persistent_facts).toEqual([]);
    expect(ctx.session_facts).toEqual([]);
    expect(ctx.weather).toBeUndefined();
    expect(ctx.time_of_day).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('falls back to road_speed when average_speed is null', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: { data: { id: 'u', primary_goal: 'endurance' }, error: null },
      user_speed_profiles: {
        data: { average_speed: null, road_speed: 24 },
        error: null,
      },
      activities: { data: [], error: null },
    });

    const ctx = await assembleRouteContext({ now: 0 });
    expect(ctx.speed_profile?.flat_kph).toBe(24);
  });

  it('returns empty fields when user_profiles row is missing (PGRST116)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'new-user' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      user_speed_profiles: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      activities: { data: [], error: null },
    });

    const ctx = await assembleRouteContext({ now: 0 });
    expect(ctx.user_id).toBe('new-user');
    expect(ctx.training_goal).toBe('endurance'); // falls back to session default
    expect(ctx.preferences).toBeUndefined();
    expect(ctx.speed_profile).toBeUndefined();
    expect(ctx.recent_rides).toEqual([]);
  });

  it('throws RouteContextError(profile_query_failed) on schema errors (42703 undefined_column)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: {
        data: null,
        error: { code: '42703', message: 'column does not exist' },
      },
      user_speed_profiles: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      activities: { data: [], error: null },
    });

    await expect(assembleRouteContext({ now: 0 })).rejects.toMatchObject({
      name: 'RouteContextError',
      kind: 'profile_query_failed',
    });
  });

  it('throws RouteContextError(profile_query_failed) when activities query fails for schema reason', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: { data: { id: 'u', primary_goal: 'fitness' }, error: null },
      user_speed_profiles: { data: { average_speed: 25 }, error: null },
      activities: {
        data: null,
        error: { code: '42703', message: 'column "polyline" does not exist' },
      },
    });

    await expect(assembleRouteContext({ now: 0 })).rejects.toMatchObject({
      name: 'RouteContextError',
      kind: 'profile_query_failed',
    });
  });

  it('passes startCoordOverride through to the returned context', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u' } },
      error: null,
    });
    routeFromBuilder({
      user_profiles: { data: { id: 'u', primary_goal: 'fitness' }, error: null },
      user_speed_profiles: { data: { average_speed: 25 }, error: null },
      activities: { data: [], error: null },
    });

    const ctx = await assembleRouteContext({
      now: 0,
      startCoordOverride: [-122.4194, 37.7749],
    });
    expect(ctx.start_coord).toEqual([-122.4194, 37.7749]);
    expect(ctx.current_region_bbox).toBeDefined();
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
