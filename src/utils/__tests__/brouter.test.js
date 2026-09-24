import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ensureProfileId = vi.fn();
const forgetProfileId = vi.fn();
vi.mock('../brouterProfiles', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureProfileId: (...a) => ensureProfileId(...a),
    forgetProfileId: (...a) => forgetProfileId(...a),
  };
});
const trackRouteBuilder = vi.fn();
vi.mock('../routeBuilderTelemetry', () => ({ trackRouteBuilder: (...a) => trackRouteBuilder(...a) }));

import {
  getBRouterDirections,
  brouterServers,
  tribosProfilesEnabled,
  tribosForProfileName,
  resetBRouterCircuit,
  PUBLIC_BROUTER_URL,
  CIRCUIT_FAILURES,
} from '../brouter';

const SELF = 'https://tribos-brouter.fly.dev';
const COORDS = [[-105.05, 40.05], [-105.27, 40.015]];

function routeResponse(km = 20) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      features: [
        {
          geometry: { coordinates: [[-105.05, 40.05, 1600], [-105.1, 40.03, 1610], [-105.27, 40.015, 1620]] },
          properties: { 'track-length': String(km * 1000), 'total-time': '3600', 'filtered ascend': '120', 'filtered descend': '110', messages: [] },
        },
      ],
    }),
  };
}
const errorResponse = (status, text) => ({ ok: false, status, text: async () => text, json: async () => ({}) });
const noRouteResponse = () => ({ ok: true, status: 200, json: async () => ({ features: [] }) });

let fetchMock;
beforeEach(() => {
  resetBRouterCircuit();
  ensureProfileId.mockReset();
  forgetProfileId.mockReset();
  trackRouteBuilder.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_BROUTER_URL', '');
  vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'false');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const calledBases = () => fetchMock.mock.calls.map(([url]) => new URL(url).origin);
const profileOf = (i) => new URL(fetchMock.mock.calls[i][0]).searchParams.get('profile');

describe('brouterServers', () => {
  it('is the public server alone when nothing is self-hosted', () => {
    expect(brouterServers()).toEqual([PUBLIC_BROUTER_URL]);
  });

  it('puts the self-hosted server first, normalised, and never lists one twice', () => {
    vi.stubEnv('VITE_BROUTER_URL', `${SELF}/brouter/`);
    expect(brouterServers()).toEqual([SELF, PUBLIC_BROUTER_URL]);
    vi.stubEnv('VITE_BROUTER_URL', 'https://brouter.de/');
    expect(brouterServers()).toEqual([PUBLIC_BROUTER_URL]);
    vi.stubEnv('VITE_BROUTER_URL', 'not a url');
    expect(brouterServers()).toEqual([PUBLIC_BROUTER_URL]);
  });

  it('reads the Tribos flag literally', () => {
    expect(tribosProfilesEnabled()).toBe(false);
    vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'true');
    expect(tribosProfilesEnabled()).toBe(true);
  });
});

describe('getBRouterDirections — servers and failover', () => {
  it('routes on the self-hosted server and reports it', async () => {
    vi.stubEnv('VITE_BROUTER_URL', SELF);
    fetchMock.mockResolvedValueOnce(routeResponse(21));
    const route = await getBRouterDirections(COORDS, { profile: 'trekking' });
    expect(calledBases()).toEqual([SELF]);
    expect(route).toMatchObject({ source: 'brouter', server: SELF, profile: 'trekking', distance_m: 21000, duration_s: 3600 });
    expect(route.elevation).toEqual({ ascent: 120, descent: 110 });
    expect(trackRouteBuilder).toHaveBeenCalledWith('brouter_server_used', expect.objectContaining({ server: 'self', tribos: false }));
  });

  it('falls back to brouter.de when the self-hosted server fails', async () => {
    vi.stubEnv('VITE_BROUTER_URL', SELF);
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(routeResponse());
    const route = await getBRouterDirections(COORDS, { profile: 'trekking' });
    expect(calledBases()).toEqual([SELF, PUBLIC_BROUTER_URL]);
    expect(route.server).toBe(PUBLIC_BROUTER_URL);
    expect(trackRouteBuilder).toHaveBeenCalledWith('brouter_server_used', expect.objectContaining({ server: 'public' }));
  });

  it('opens the circuit after repeated failures and skips the server for a while', async () => {
    vi.stubEnv('VITE_BROUTER_URL', SELF);
    for (let i = 0; i < CIRCUIT_FAILURES; i++) {
      fetchMock.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(routeResponse());
      await getBRouterDirections(COORDS, { profile: 'trekking' });
    }
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(routeResponse());
    await getBRouterDirections(COORDS, { profile: 'trekking' });
    expect(calledBases()).toEqual([PUBLIC_BROUTER_URL]);
  });

  it('a server that answers "no route" ends the search: another server would say the same', async () => {
    vi.stubEnv('VITE_BROUTER_URL', SELF);
    fetchMock.mockResolvedValueOnce(noRouteResponse());
    expect(await getBRouterDirections(COORDS, { profile: 'trekking' })).toBeNull();
    expect(calledBases()).toEqual([SELF]);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'no route found (target island)'));
    expect(await getBRouterDirections(COORDS, { profile: 'trekking' })).toBeNull();
    expect(calledBases()).toEqual([SELF]);
  });

  it('returns null when every server fails, and needs two coordinates', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getBRouterDirections(COORDS, { profile: 'trekking' })).toBeNull();
    expect(await getBRouterDirections([COORDS[0]], { profile: 'trekking' })).toBeNull();
  });
});

describe('getBRouterDirections — Tribos profiles', () => {
  it('sends the named profile while the flag is off', async () => {
    fetchMock.mockResolvedValueOnce(routeResponse());
    await getBRouterDirections(COORDS, { profile: 'trekking', tolerance: 'low' });
    expect(ensureProfileId).not.toHaveBeenCalled();
    expect(profileOf(0)).toBe('trekking');
  });

  it('upgrades a named profile to the rendered Tribos profile at the rider tolerance', async () => {
    vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'true');
    ensureProfileId.mockResolvedValue('custom_quiet');
    fetchMock.mockResolvedValueOnce(routeResponse());
    const route = await getBRouterDirections(COORDS, { profile: 'trekking', tolerance: 'low' });
    expect(ensureProfileId).toHaveBeenCalledWith(PUBLIC_BROUTER_URL, { template: 'road', traffic_tolerance: 0 });
    expect(profileOf(0)).toBe('custom_quiet');
    expect(route.profile).toBe('custom_quiet');
    expect(trackRouteBuilder).toHaveBeenCalledWith('brouter_server_used', expect.objectContaining({ tribos: true }));
  });

  it('maps the stock names: safety is always quiet, fastbike direct, gravel the gravel template, mtb untouched', () => {
    expect(tribosForProfileName('safety', 'high')).toEqual({ template: 'road', traffic_tolerance: 0 });
    expect(tribosForProfileName('fastbike', 'low')).toEqual({ template: 'road', traffic_tolerance: 2 });
    expect(tribosForProfileName('trekking', 'high')).toEqual({ template: 'road', traffic_tolerance: 2 });
    expect(tribosForProfileName('gravel', 'medium', 60)).toEqual({ template: 'gravel', traffic_tolerance: 1, gravel_target: 0.6 });
    expect(tribosForProfileName('mtb')).toBeNull();
  });

  it('honours tribos: false (re-rides) and explicit tribos params', async () => {
    vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'true');
    ensureProfileId.mockResolvedValue('custom_x');
    fetchMock.mockResolvedValue(routeResponse());
    await getBRouterDirections(COORDS, { profile: 'trekking', tribos: false });
    expect(ensureProfileId).not.toHaveBeenCalled();
    expect(profileOf(0)).toBe('trekking');
    await getBRouterDirections(COORDS, { profile: 'trekking', tribos: { template: 'gravel', traffic_tolerance: 1, gravel_target: 0.3 } });
    expect(ensureProfileId).toHaveBeenLastCalledWith(PUBLIC_BROUTER_URL, { template: 'gravel', traffic_tolerance: 1, gravel_target: 0.3 });
    expect(profileOf(1)).toBe('custom_x');
  });

  it('falls back to the named profile when the upload fails', async () => {
    vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'true');
    ensureProfileId.mockRejectedValue(new Error('upload failed'));
    fetchMock.mockResolvedValueOnce(routeResponse());
    const route = await getBRouterDirections(COORDS, { profile: 'gravel' });
    expect(profileOf(0)).toBe('gravel');
    expect(route.profile).toBe('gravel');
    expect(trackRouteBuilder).toHaveBeenCalledWith('brouter_server_used', expect.objectContaining({ tribos: false }));
  });

  it('re-uploads once when the server has forgotten the custom profile', async () => {
    vi.stubEnv('VITE_BROUTER_TRIBOS_PROFILES', 'true');
    ensureProfileId.mockResolvedValueOnce('custom_old').mockResolvedValueOnce('custom_new');
    fetchMock
      .mockResolvedValueOnce(errorResponse(500, 'profile custom_old not found'))
      .mockResolvedValueOnce(routeResponse());
    const route = await getBRouterDirections(COORDS, { profile: 'trekking' });
    expect(forgetProfileId).toHaveBeenCalledWith(PUBLIC_BROUTER_URL, { template: 'road', traffic_tolerance: 1 });
    expect(profileOf(0)).toBe('custom_old');
    expect(profileOf(1)).toBe('custom_new');
    expect(route.profile).toBe('custom_new');
    expect(calledBases()).toEqual([PUBLIC_BROUTER_URL, PUBLIC_BROUTER_URL]);
  });
});
