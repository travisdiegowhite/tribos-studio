import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// One row of state, as the system_health_checks table would hold it.
const state = { row: null, tableMissing: false, upserts: [] };
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      expect(table).toBe('system_health_checks');
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          state.tableMissing
            ? { data: null, error: { code: '42P01', message: 'relation does not exist' } }
            : { data: state.row, error: null },
        upsert: async (row) => {
          state.upserts.push(row);
          if (state.tableMissing) return { error: { code: '42P01', message: 'relation does not exist' } };
          state.row = { consecutive_failures: row.consecutive_failures };
          return { error: null };
        },
      };
      return builder;
    },
  }),
}));
const captureServerError = vi.fn();
vi.mock('./utils/serverSentry.js', () => ({
  captureServerError: (...a) => captureServerError(...a),
  flushServerSentry: vi.fn(async () => {}),
}));
vi.mock('./utils/verifyCronAuth.js', () => ({ verifyCronAuth: (req) => ({ authorized: req.headers['x-vercel-cron'] === '1' }) }));

import handler, { probeBRouter, SLOW_MS, FAILURES_BEFORE_ALERT } from './brouter-health-monitor.js';

const SELF = 'https://tribos-brouter.fly.dev';

function routeResponse(withMessages = true) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      features: [
        {
          geometry: { coordinates: [[-105.27, 40.015], [-105.25, 40.03]] },
          properties: { 'track-length': '2100', messages: withMessages ? [['Longitude'], ['-105270500']] : [] },
        },
      ],
    }),
  };
}

function call(headers = { 'x-vercel-cron': '1' }) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ headers }, res).then(() => res);
}

let fetchMock;
beforeEach(() => {
  state.row = null;
  state.tableMissing = false;
  state.upserts = [];
  captureServerError.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  process.env.BROUTER_URL = SELF;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.BROUTER_URL;
  delete process.env.VITE_BROUTER_URL;
});

describe('probeBRouter', () => {
  it('accepts a route with tag rows and reports its length', async () => {
    fetchMock.mockResolvedValueOnce(routeResponse());
    const probe = await probeBRouter(SELF, fetchMock);
    expect(probe.ok).toBe(true);
    expect(probe.km).toBeCloseTo(2.1, 3);
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`^${SELF}/brouter\\?lonlats=.*profile=trekking`));
  });

  it('treats a route without tag rows, an HTTP error or a network error as a failure', async () => {
    fetchMock.mockResolvedValueOnce(routeResponse(false));
    expect(await probeBRouter(SELF, fetchMock)).toMatchObject({ ok: false, reason: expect.stringMatching(/tag rows/) });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
    expect(await probeBRouter(SELF, fetchMock)).toMatchObject({ ok: false, reason: 'HTTP 502' });
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await probeBRouter(SELF, fetchMock)).toMatchObject({ ok: false, reason: 'ECONNRESET' });
  });
});

describe('handler', () => {
  it('rejects unauthenticated calls and skips when nothing is self-hosted', async () => {
    expect((await call({})).statusCode).toBe(401);
    delete process.env.BROUTER_URL;
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toMatch(/BROUTER_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a healthy probe, resets the failure count and does not page', async () => {
    state.row = { consecutive_failures: 1 };
    fetchMock.mockResolvedValueOnce(routeResponse());
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.consecutive_failures).toBe(0);
    expect(res.body.breaches).toEqual([]);
    expect(state.upserts[0]).toMatchObject({ check_name: 'brouter_self_hosted', consecutive_failures: 0, last_error: null });
    expect(state.upserts[0].last_ok_at).toBeTruthy();
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it('pages only on the second consecutive failure', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    let res = await call();
    expect(res.body.consecutive_failures).toBe(1);
    expect(captureServerError).not.toHaveBeenCalled();
    res = await call();
    expect(res.body.consecutive_failures).toBe(FAILURES_BEFORE_ALERT);
    expect(res.body.breaches.map((b) => b.tag)).toEqual(['brouter.self_hosted_down']);
    expect(captureServerError).toHaveBeenCalledWith(
      expect.stringMatching(/self_hosted_down/),
      expect.objectContaining({ tag: 'brouter.self_hosted_down', extra: expect.objectContaining({ server: SELF, consecutive_failures: 2 }) }),
    );
  });

  it('flags a slow but healthy server', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000) // probe start
      .mockReturnValue(1_000 + SLOW_MS + 500); // everything after
    fetchMock.mockResolvedValueOnce(routeResponse());
    const res = await call();
    expect(res.body.probe.ok).toBe(true);
    expect(res.body.breaches.map((b) => b.tag)).toEqual(['brouter.slow']);
    expect(captureServerError).toHaveBeenCalledWith(expect.stringMatching(/brouter\.slow/), expect.objectContaining({ tag: 'brouter.slow' }));
  });

  it('still runs and pages when the state table is not applied yet (every failure counts as the first)', async () => {
    state.tableMissing = true;
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.consecutive_failures).toBe(1);
    expect(captureServerError).not.toHaveBeenCalled();
  });
});
