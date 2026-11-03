import { describe, it, expect, vi, beforeEach } from 'vitest';

const getBRouterDirections = vi.fn();
let servers = ['https://brouter.de'];
vi.mock('../../../utils/brouter', () => ({
  getBRouterDirections: (...a: unknown[]) => getBRouterDirections(...a),
  brouterServers: () => servers,
  PUBLIC_BROUTER_URL: 'https://brouter.de',
  BROUTER_PROFILES: { TREKKING: 'trekking', GRAVEL: 'gravel' },
}));

import { routeCallFor, selfHostedRouting, NoRouteError } from '../landingEngine';

const wps = [[-105.27, 40.01], [-105.2, 40.05], [-105.27, 40.01]] as const;

beforeEach(() => {
  getBRouterDirections.mockReset();
  servers = ['https://brouter.de'];
});

describe('routeCallFor', () => {
  it('asks BRouter for the Tribos road profile at the call level, forced on', async () => {
    getBRouterDirections.mockResolvedValue({ coordinates: [[0, 0], [0, 1]], distance_m: 100, taggedWays: [] });
    await routeCallFor('road')({ waypoints: [...wps], surface: 'road', level: 2 });
    const [, opts] = getBRouterDirections.mock.calls[0];
    expect(opts).toMatchObject({ profile: 'trekking', forceTribos: true, tribos: { template: 'road', comfort_level: 2 } });
  });

  it.each([
    ['gravel', 0.7],
    ['mixed', 0.35],
  ] as const)('%s uses the gravel profile aiming for %f unpaved', async (surface, target) => {
    getBRouterDirections.mockResolvedValue({ coordinates: [[0, 0], [0, 1]], distance_m: 100, taggedWays: [] });
    await routeCallFor(surface)({ waypoints: [...wps], surface: 'gravel', level: 4 });
    const [, opts] = getBRouterDirections.mock.calls[0];
    expect(opts.tribos).toEqual({ template: 'gravel', comfort_level: 4, gravel_target: target });
  });

  it('no route is a NoRouteError', async () => {
    getBRouterDirections.mockResolvedValue(null);
    await expect(routeCallFor('road')({ waypoints: [...wps], surface: 'road', level: 2 })).rejects.toBeInstanceOf(NoRouteError);
  });

  it('no way tags means no segment classes (the validator reads it as unknown)', async () => {
    getBRouterDirections.mockResolvedValue({ coordinates: [[0, 0], [0, 1]], distance_m: 100, taggedWays: [] });
    const r = await routeCallFor('road')({ waypoints: [...wps], surface: 'road', level: 2 });
    expect(r.segmentClasses).toBeNull();
  });
});

describe('selfHostedRouting', () => {
  it('is false while brouter.de leads (no nearby-start search on the public server)', () => {
    expect(selfHostedRouting()).toBe(false);
    servers = ['https://tribos-brouter.fly.dev', 'https://brouter.de'];
    expect(selfHostedRouting()).toBe(true);
  });
});
