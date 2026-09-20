import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
let upsertPayload = null;
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
        return obj;
      },
      single: () =>
        Promise.resolve(
          upsertError
            ? { data: null, error: upsertError }
            : { data: upsertPayload ?? storedRow, error: storedRow || upsertPayload ? null : { code: 'PGRST116' } },
        ),
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
