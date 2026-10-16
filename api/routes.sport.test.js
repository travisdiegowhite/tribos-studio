import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal PostgREST stand-in: records every insert payload and answers the
// first one with "no sport column" (migration 135 unapplied).
const inserts = [];
let failFirstWithMissingSport = true;

function chain(result) {
  const c = {
    select: () => c,
    eq: () => c,
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
    insert: (payload) => {
      inserts.push(payload);
      return chain(() => {
        if (failFirstWithMissingSport && inserts.length === 1) {
          return { data: null, error: { message: "Could not find the 'sport' column of 'routes' in the schema cache" } };
        }
        return { data: { id: 'r1', ...payload }, error: null };
      });
    },
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
  inserts.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('api/routes save_route — routes.sport (migration 135)', () => {
  it('saves without the column when it is missing, and still answers with the sport', async () => {
    const res = await call({
      action: 'save_route',
      userId: 'u1',
      routeData: { name: 'Trail loop', geometry: GEOMETRY, surface_type: 'trail_run', sport: 'running' },
    });
    expect(res.statusCode).toBe(200);
    expect(inserts[0].sport).toBe('running');
    expect(inserts[1]).not.toHaveProperty('sport');
    expect(inserts[1].surface_type).toBe('trail_run');
    // Inferred from the run surface, so the builder reopens it as a run.
    expect(res.body.route.sport).toBe('running');
  });

  it('infers a run from its surface when the client sends no sport', async () => {
    failFirstWithMissingSport = false;
    const res = await call({
      action: 'save_route',
      userId: 'u1',
      routeData: { name: 'Road run', geometry: GEOMETRY, surface_type: 'run' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.route.sport).toBe('running');
  });
});
