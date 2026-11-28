import { describe, it, expect, vi, beforeEach } from 'vitest';

// PostgREST stand-in that records what each call wrote and filtered on.
const calls = [];

function chain(op, payload) {
  const record = { op, payload, eqs: [], select: null };
  calls.push(record);
  const result = () => {
    if (op === 'select') return { data: [{ id: 'r1', name: 'Loop', tags: ['Gravel'] }], error: null };
    return { data: { id: 'r1', ...(payload || {}) }, error: null };
  };
  const c = {
    select: (cols) => {
      record.select = cols;
      return c;
    },
    eq: (col, val) => {
      record.eqs.push([col, val]);
      return c;
    },
    order: () => c,
    single: () => Promise.resolve(result()),
    maybeSingle: () => Promise.resolve(result()),
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  return c;
}

const supabaseStub = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
  from: () => ({
    insert: (payload) => chain('insert', payload),
    update: (payload) => chain('update', payload),
    select: (cols) => chain('select').select(cols),
  }),
};

vi.mock('./utils/supabaseAdmin.js', () => ({ getSupabaseAdmin: () => supabaseStub }));
vi.mock('./utils/cors.js', () => ({ setupCors: () => false }));
vi.mock('./utils/activation.js', () => ({ completeActivationStep: vi.fn(async () => {}) }));
vi.mock('./utils/rateLimit.js', () => ({ rateLimitMiddleware: vi.fn(async () => false) }));

const { default: handler } = await import('./routes.js');

function call(body) {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res).then(() => res);
}

const GEOMETRY = { type: 'LineString', coordinates: [[-105, 40], [-105.01, 40.01]] };

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('api/routes — tags (route library collections)', () => {
  it('a builder re-save without tags leaves the route’s tags alone', async () => {
    await call({ action: 'save_route', userId: 'u1', routeData: { id: 'r1', name: 'Loop', geometry: GEOMETRY } });
    const update = calls.find((c) => c.op === 'update');
    expect(update.payload).not.toHaveProperty('tags');
  });

  it('save_route writes normalised tags when they are sent', async () => {
    await call({ action: 'save_route', userId: 'u1', routeData: { name: 'Loop', geometry: GEOMETRY, tags: [' Gravel ', 'gravel'] } });
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert.payload.tags).toEqual(['Gravel']);
  });

  it('set_route_tags updates only the owner’s route and returns the tags', async () => {
    const res = await call({ action: 'set_route_tags', userId: 'u1', routeId: 'r1', tags: ['Commute', 'commute', 'Hills'] });
    expect(res.statusCode).toBe(200);
    const update = calls.find((c) => c.op === 'update');
    expect(update.payload.tags).toEqual(['Commute', 'Hills']);
    expect(update.eqs).toEqual(expect.arrayContaining([['id', 'r1'], ['user_id', 'u1']]));
  });

  it('set_route_tags rejects a non-array', async () => {
    const res = await call({ action: 'set_route_tags', userId: 'u1', routeId: 'r1', tags: 'Commute' });
    expect(res.statusCode).toBe(400);
  });

  it('list_routes selects tags', async () => {
    await call({ action: 'list_routes', userId: 'u1' });
    const list = calls.find((c) => c.op === 'select');
    expect(list.select).toMatch(/\btags\b/);
  });
});
