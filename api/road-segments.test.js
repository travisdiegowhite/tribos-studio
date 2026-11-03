import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
let upsertPayload = null;
let upsertPayloads = [];
let upsertError = null;
let storedRow = null;

vi.mock('./utils/cors.js', () => ({ setupCors: vi.fn().mockReturnValue(false) }));

vi.mock('./utils/supabaseAdmin.js', () => {
  const chain = () => {
    const obj = {
      select: () => obj,
      eq: () => obj,
      upsert: (payload) => {
        upsertPayload = payload;
        upsertPayloads.push(payload);
        return obj;
      },
      single: () => {
        const err = typeof upsertError === 'function' ? upsertError(upsertPayload) : upsertError;
        return Promise.resolve(
          err
            ? { data: null, error: err }
            : { data: upsertPayload ?? storedRow, error: storedRow || upsertPayload ? null : { code: 'PGRST116' } },
        );
      },
    };
    return obj;
  };
  const client = { auth: { getUser }, from: () => chain() };
  return { getSupabaseAdmin: () => client, supabase: client };
});

const { default: handler } = await import('./road-segments.js');

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  res.setHeader = () => res;
  res.end = () => res;
  return res;
}

const req = (body) => ({
  method: 'POST',
  headers: { authorization: 'Bearer tok' },
  body,
});

beforeEach(() => {
  upsertPayload = null;
  upsertPayloads = [];
  upsertError = null;
  storedRow = null;
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('road-segments preferences: Road comfort (migration 125)', () => {
  it('defaults traffic_tolerance and bike_infra_preference when no row exists', async () => {
    const res = makeRes();
    await handler(req({ action: 'get_preferences' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.preferences.traffic_tolerance).toBe('medium');
    expect(res.body.preferences.bike_infra_preference).toBe('preferred');
    expect(res.body.preferences.familiarity_strength).toBe(50);
  });

  it('fills the new fields on a row that predates the migration', async () => {
    storedRow = { user_id: 'user-1', familiarity_strength: 80, explore_mode: true };
    const res = makeRes();
    await handler(req({ action: 'get_preferences' }), res);
    expect(res.body.preferences.familiarity_strength).toBe(80);
    expect(res.body.preferences.traffic_tolerance).toBe('medium');
  });

  it('rejects an invalid traffic_tolerance', async () => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', traffic_tolerance: 'yolo' }), res);
    expect(res.statusCode).toBe(400);
    expect(upsertPayload).toBeNull();
  });

  it('upserts a valid traffic_tolerance for the authed user', async () => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', traffic_tolerance: 'low' }), res);
    expect(res.statusCode).toBe(200);
    expect(upsertPayload).toMatchObject({ user_id: 'user-1', traffic_tolerance: 'low' });
    expect(res.body.preferences.traffic_tolerance).toBe('low');
  });

  it('answers 409 needsMigration when the column does not exist yet', async () => {
    upsertError = { code: '42703', message: 'column "traffic_tolerance" of relation "user_road_preferences" does not exist' };
    const res = makeRes();
    await handler(req({ action: 'update_preferences', traffic_tolerance: 'low' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.needsMigration).toBe(true);
  });
});

describe('road-segments preferences: comfort_level (migration 139)', () => {
  it('reads a rider with no row as Comfort 2 and keeps the legacy tolerance default', async () => {
    const res = makeRes();
    await handler(req({ action: 'get_preferences' }), res);
    expect(res.body.preferences.comfort_level).toBe(2);
    expect(res.body.preferences.comfort_level_source).toBe('default');
    expect(res.body.preferences.traffic_tolerance).toBe('medium');
  });

  it('derives the level from tolerance when the row has none', async () => {
    storedRow = { user_id: 'user-1', traffic_tolerance: 'high' };
    const res = makeRes();
    await handler(req({ action: 'get_preferences' }), res);
    expect(res.body.preferences.comfort_level).toBe(4);
    expect(res.body.preferences.comfort_level_source).toBe('tolerance');
  });

  it('prefers a stored level', async () => {
    storedRow = { user_id: 'user-1', traffic_tolerance: 'low', comfort_level: 1 };
    const res = makeRes();
    await handler(req({ action: 'get_preferences' }), res);
    expect(res.body.preferences.comfort_level).toBe(1);
    expect(res.body.preferences.comfort_level_source).toBe('stored');
  });

  it.each([
    [1, 'low'],
    [2, 'low'],
    [3, 'medium'],
    [4, 'high'],
    [5, 'high'],
  ])('dual-writes comfort_level %i with tolerance %s', async (level, tolerance) => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', comfort_level: level }), res);
    expect(res.statusCode).toBe(200);
    expect(upsertPayload).toMatchObject({ user_id: 'user-1', comfort_level: level, traffic_tolerance: tolerance });
    expect(res.body.preferences.comfort_level).toBe(level);
  });

  it.each([
    ['low', 2],
    ['medium', 3],
    ['high', 4],
  ])('dual-writes tolerance %s with comfort_level %i', async (tolerance, level) => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', traffic_tolerance: tolerance }), res);
    expect(upsertPayload).toMatchObject({ traffic_tolerance: tolerance, comfort_level: level });
  });

  it.each([0, 6, 2.5, '3', null])('rejects comfort_level %p', async (bad) => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', comfort_level: bad }), res);
    expect(res.statusCode).toBe(400);
    expect(upsertPayload).toBeNull();
  });

  it('rejects a tolerance that contradicts the level', async () => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', comfort_level: 2, traffic_tolerance: 'high' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a tolerance that agrees with the level', async () => {
    const res = makeRes();
    await handler(req({ action: 'update_preferences', comfort_level: 5, traffic_tolerance: 'high' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('still saves the tolerance when migration 139 is not applied', async () => {
    upsertError = (payload) =>
      'comfort_level' in payload
        ? { code: 'PGRST204', message: "Could not find the 'comfort_level' column of 'user_road_preferences' in the schema cache" }
        : null;
    const res = makeRes();
    await handler(req({ action: 'update_preferences', comfort_level: 4 }), res);
    expect(res.statusCode).toBe(200);
    expect(upsertPayloads).toHaveLength(2);
    expect(upsertPayloads[1]).not.toHaveProperty('comfort_level');
    expect(upsertPayloads[1]).toMatchObject({ traffic_tolerance: 'high' });
    // Read back from the tolerance, not a phantom stored level.
    expect(res.body.preferences.comfort_level).toBe(4);
    expect(res.body.preferences.comfort_level_source).toBe('tolerance');
  });
});
