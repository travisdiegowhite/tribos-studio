import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the routing utilities the builder composes (the NL prompt builder/parser
// are real and pure). fetch is stubbed per-test.
vi.mock('../naturalLanguagePrompt', () => ({
  buildNaturalLanguagePrompt: () => 'PROMPT',
  parseNaturalLanguageResponse: (raw) => JSON.parse(raw),
}));
const geocodeWaypoint = vi.fn();
vi.mock('../geocoding', () => ({ geocodeWaypoint: (...a) => geocodeWaypoint(...a) }));
const generateIterativeRoute = vi.fn();
vi.mock('../iterativeRouteBuilder', () => ({
  generateIterativeRoute: (...a) => generateIterativeRoute(...a),
}));
const getSmartCyclingRoute = vi.fn();
vi.mock('../smartCyclingRouter', () => ({
  getSmartCyclingRoute: (...a) => getSmartCyclingRoute(...a),
}));

import { generateRouteFromNaturalLanguage } from '../naturalLanguageRouteBuilder';

const lineOf = (n) => Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001]);

function mockClaude(parsed) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, content: JSON.stringify(parsed) }),
  });
}

beforeEach(() => {
  geocodeWaypoint.mockReset();
  generateIterativeRoute.mockReset();
  getSmartCyclingRoute.mockReset();
});

describe('generateRouteFromNaturalLanguage', () => {
  it('duration-based prompt runs the iterative builder and maps params', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 60, trainingGoal: 'hills' });
    generateIterativeRoute.mockResolvedValue({
      coordinates: lineOf(20),
      distanceKm: 28.04,
      elevationGain: 410,
      duration_s: 3600,
      name: 'Hilly loop',
      source: 'iterative_quarter_loop',
    });

    const r = await generateRouteFromNaturalLanguage('build me a hilly 1 hour loop', {
      biasCoord: [-105, 40],
      profile: 'road',
    });

    expect(generateIterativeRoute).toHaveBeenCalledTimes(1);
    const params = generateIterativeRoute.mock.calls[0][0];
    expect(params.startLocation).toEqual([-105, 40]);
    expect(params.routeType).toBe('loop');
    expect(params.options).toMatchObject({ profile: 'road', trainingGoal: 'hills' });
    expect(r).toMatchObject({ distanceKm: 28, name: 'Hilly loop' });
    expect(r.coordinates).toHaveLength(20);
  });

  it('uses an explicit target distance and gravel surface profile', async () => {
    mockClaude({ routeType: 'loop', targetDistanceKm: 40, preferences: { surfaceType: 'gravel' } });
    generateIterativeRoute.mockResolvedValue({ coordinates: lineOf(20), distanceKm: 40, elevationGain: 300, duration_s: 5400 });

    const r = await generateRouteFromNaturalLanguage('40km gravel loop', { biasCoord: [-105, 40], profile: 'road' });

    const params = generateIterativeRoute.mock.calls[0][0];
    expect(params.targetDistanceKm).toBe(40);
    expect(params.options.profile).toBe('gravel');
    expect(r.parsed.preferences.surfaceType).toBe('gravel');
  });

  it('geocodes named waypoints and routes through them', async () => {
    mockClaude({ routeType: 'loop', waypoints: ['River Trail'] });
    geocodeWaypoint.mockResolvedValue({ coordinates: [-104.9, 39.8], name: 'River Trail' });
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOf(15), distance_m: 12000, elevationGain: 120, duration_s: 1800, source: 'brouter' });

    const r = await generateRouteFromNaturalLanguage('loop via River Trail', { biasCoord: [-105, 40] });

    expect(geocodeWaypoint).toHaveBeenCalledWith('River Trail', [-105, 40]);
    // start, geocoded waypoint, and loop-closing return to start
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(3);
    expect(r).toMatchObject({ distanceKm: 12, name: 'River Trail loop', source: 'brouter' });
  });

  it('resolves start with priority placedStart > userLocation > biasCoord', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 30 });
    generateIterativeRoute.mockResolvedValue({ coordinates: lineOf(12), distanceKm: 14, elevationGain: 0, duration_s: 1800 });

    await generateRouteFromNaturalLanguage('short ride', {
      biasCoord: [-105, 40],
      userLocation: [-106, 41],
      placedStart: [-107, 42],
    });
    expect(generateIterativeRoute.mock.calls[0][0].startLocation).toEqual([-107, 42]);
  });

  it('throws NO_START when no coordinate can be resolved', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 30 });
    await expect(
      generateRouteFromNaturalLanguage('short ride', { biasCoord: null }),
    ).rejects.toThrow('NO_START');
  });

  it('throws when the Claude endpoint fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });
    await expect(
      generateRouteFromNaturalLanguage('loop', { biasCoord: [-105, 40] }),
    ).rejects.toThrow('boom');
  });
});
