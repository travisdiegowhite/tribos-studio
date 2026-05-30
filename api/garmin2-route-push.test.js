import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn(() => false) }));
vi.mock('./utils/garmin/tokenManager.js', () => ({
  ensureValidAccessToken: vi.fn(),
}));

const integrationStore = new Map();   // user_id → integration row

vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async (token) => {
        if (token === 'good') return { data: { user: { id: 'user-1' } }, error: null };
        return { data: { user: null }, error: new Error('bad token') };
      }),
    },
    from(_table) {
      const filters = {};
      const b = {
        select() { return b; },
        eq(col, val) { filters[col] = val; return b; },
        maybeSingle() {
          const row = integrationStore.get(filters.user_id);
          // Apply the sync_enabled / refresh_token_invalid filters that the
          // handler stacks on the chain (matches what PostgREST would do).
          if (row && filters.sync_enabled !== undefined && row.sync_enabled !== filters.sync_enabled) {
            return Promise.resolve({ data: null, error: null });
          }
          if (row && filters.refresh_token_invalid !== undefined && row.refresh_token_invalid !== filters.refresh_token_invalid) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: row || null, error: null });
        },
      };
      return b;
    },
  }),
}));

import handler, {
  buildCoursePayload,
  mapSurfaceToActivityType,
  calculateRouteDistance,
  haversineDistance,
} from './garmin2-route-push.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function mockReq({ body = {}, headers = { authorization: 'Bearer good' } } = {}) {
  return { method: 'POST', body, headers };
}

const VALID_ROUTE = {
  name: 'Test Route',
  description: 'A nice ride',
  coordinates: [[-94.748, 38.832, 300], [-94.747, 38.833, 305], [-94.746, 38.834, 310]],
  distance_km: 0.5,
  elevation_gain_m: 10,
  elevation_loss_m: 0,
  surfaceType: 'gravel',
};

beforeEach(() => {
  integrationStore.clear();
  ensureValidAccessToken.mockReset();
  ensureValidAccessToken.mockResolvedValue('valid-token');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Pure helpers
// ============================================================================

describe('buildCoursePayload', () => {
  it('produces a Garmin-shaped course payload from canonical fields', () => {
    const p = buildCoursePayload(VALID_ROUTE);
    expect(p.courseName).toBe('Test Route');
    expect(p.coordinateSystem).toBe('WGS84');
    expect(p.activityType).toBe('GRAVEL_CYCLING');
    expect(p.distance).toBe(500);
    expect(p.elevationGain).toBe(10);
    expect(p.geoPoints).toHaveLength(3);
    // Internal [lng, lat] → Garmin { latitude, longitude }
    expect(p.geoPoints[0]).toEqual({ latitude: 38.832, longitude: -94.748, elevation: 300 });
  });

  it('truncates long names to 32 chars', () => {
    const p = buildCoursePayload({ ...VALID_ROUTE, name: 'X'.repeat(50) });
    expect(p.courseName).toHaveLength(32);
  });

  it('accepts legacy camelCase aliases when canonical fields are absent', () => {
    const p = buildCoursePayload({
      coordinates: VALID_ROUTE.coordinates,
      distanceKm: 0.5,                      // legacy alias
      elevationGainM: 10,
      elevationLossM: 5,
    });
    expect(p.distance).toBe(500);
    expect(p.elevationGain).toBe(10);
    expect(p.elevationLoss).toBe(5);
  });

  it('falls back to haversine distance when distance_km is 0', () => {
    const p = buildCoursePayload({
      ...VALID_ROUTE,
      distance_km: 0,
    });
    expect(p.distance).toBeGreaterThan(0);
  });

  it('handles 2D coordinates (no elevation)', () => {
    const p = buildCoursePayload({
      ...VALID_ROUTE,
      coordinates: [[-94.748, 38.832], [-94.747, 38.833]],
    });
    expect(p.geoPoints[0].elevation).toBe(0);
  });
});

describe('mapSurfaceToActivityType', () => {
  it.each([
    ['paved', 'ROAD_CYCLING'],
    ['gravel', 'GRAVEL_CYCLING'],
    ['mixed', 'GRAVEL_CYCLING'],
    ['trail', 'MOUNTAIN_BIKING'],
    ['mountain', 'MOUNTAIN_BIKING'],
    ['GRAVEL', 'GRAVEL_CYCLING'],          // case-insensitive
    [undefined, 'ROAD_CYCLING'],           // default
    ['unknown', 'ROAD_CYCLING'],           // default
  ])('maps %p → %s', (input, expected) => {
    expect(mapSurfaceToActivityType(input)).toBe(expected);
  });
});

describe('calculateRouteDistance / haversineDistance', () => {
  it('returns 0 for an empty / single-point route', () => {
    expect(calculateRouteDistance([])).toBe(0);
    expect(calculateRouteDistance([[-94, 38]])).toBe(0);
  });

  it('roughly matches a known-distance segment (KC ~ St. Louis, ~370 km)', () => {
    // Kansas City to St. Louis along a straight line — roughly 370 km / 370_000 m.
    const d = haversineDistance(39.0997, -94.5786, 38.6270, -90.1994);
    expect(d).toBeGreaterThan(350_000);
    expect(d).toBeLessThan(400_000);
  });
});

// ============================================================================
// Handler
// ============================================================================

describe('garmin2-route-push handler', () => {
  it('returns 405 on non-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without an auth token', async () => {
    const res = mockRes();
    await handler(mockReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when routeData missing or coordinates empty', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);

    const res2 = mockRes();
    await handler(mockReq({ body: { routeData: { coordinates: [] } } }), res2);
    expect(res2.statusCode).toBe(400);
  });

  it('returns 400/requiresConnection when no Garmin integration', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { routeData: VALID_ROUTE } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.requiresConnection).toBe(true);
  });

  it('returns 401/requiresReconnect when token refresh fails', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', access_token: 'old',
      sync_enabled: true, refresh_token_invalid: false,
    });
    ensureValidAccessToken.mockRejectedValueOnce(new Error('refresh failed'));

    const res = mockRes();
    await handler(mockReq({ body: { routeData: VALID_ROUTE } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.requiresReconnect).toBe(true);
  });

  it('happy path: POSTs course to Garmin and returns 200 + course id', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', access_token: 'fresh',
      sync_enabled: true, refresh_token_invalid: false,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'garmin-course-42' }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: { routeData: VALID_ROUTE } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.garminCourseId).toBe('garmin-course-42');
    expect(fetch).toHaveBeenCalledWith(
      'https://apis.garmin.com/training-api/courses/v1/course',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });

  it('maps 412 → requiresReconnect (COURSE_IMPORT permission)', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', access_token: 'fresh',
      sync_enabled: true, refresh_token_invalid: false,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 412, text: async () => 'permission denied',
    }));

    const res = mockRes();
    await handler(mockReq({ body: { routeData: VALID_ROUTE } }), res);
    expect(res.statusCode).toBe(412);
    expect(res.body.requiresReconnect).toBe(true);
  });

  it('maps 404 ApplicationNotFound → COURSES_API_NOT_AVAILABLE (UI falls back to TCX)', async () => {
    integrationStore.set('user-1', {
      user_id: 'user-1', access_token: 'fresh',
      sync_enabled: true, refresh_token_invalid: false,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => 'ApplicationNotFound: course-portal',
    }));

    const res = mockRes();
    await handler(mockReq({ body: { routeData: VALID_ROUTE } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('COURSES_API_NOT_AVAILABLE');
  });
});
