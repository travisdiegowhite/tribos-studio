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
const getFamiliarLoopWaypoints = vi.fn();
const scoreRoutePreference = vi.fn();
vi.mock('../routeScoring', () => ({
  getFamiliarLoopWaypoints: (...a) => getFamiliarLoopWaypoints(...a),
  scoreRoutePreference: (...a) => scoreRoutePreference(...a),
}));
const generateSmartWaypoints = vi.fn();
vi.mock('../aiRouteGenerator.js', () => ({
  generateSmartWaypoints: (...a) => generateSmartWaypoints(...a),
}));

import {
  generateRouteFromNaturalLanguage,
  routeThroughWaypoints,
} from '../naturalLanguageRouteBuilder';

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
  getFamiliarLoopWaypoints.mockReset();
  scoreRoutePreference.mockReset();
  generateSmartWaypoints.mockReset();
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

describe('generateRouteFromNaturalLanguage — Strava-gated parity branches', () => {
  it('seeds a loop with familiar-roads waypoints when accessToken + preferFamiliar', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 60, preferences: { preferFamiliar: true } });
    getFamiliarLoopWaypoints.mockResolvedValue({
      fallbackToRandom: false,
      segments: [{}, {}, {}],
      waypoints: [
        { lng: -105.24, lat: 40.02 },
        { lng: -105.22, lat: 40.03 },
        { lng: -105.24, lat: 40.04 },
        { lng: -105.26, lat: 40.03 },
      ],
    });
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOf(20), distance_m: 30000, elevationGain: 250, duration_s: 4000, source: 'stadia' });
    scoreRoutePreference.mockResolvedValue({ familiarityPercent: 72 });

    const r = await generateRouteFromNaturalLanguage('familiar 1 hour loop', {
      biasCoord: [-105, 40],
      accessToken: 'tok',
    });

    expect(getFamiliarLoopWaypoints).toHaveBeenCalledWith(40, -105, expect.any(Number), 'tok', false);
    // start + 4 familiar waypoints + return-to-start
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(6);
    expect(generateIterativeRoute).not.toHaveBeenCalled();
    expect(r.source).toBe('familiar_segments');
    expect(r.familiarityScore).toEqual({ familiarityPercent: 72 });
    expect(r.meta).toEqual({ segmentsUsed: 3, waypointsUsed: 4 });
  });

  it('falls back to the iterative builder when familiar segments are insufficient', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 60, preferences: { preferFamiliar: true } });
    getFamiliarLoopWaypoints.mockResolvedValue({ fallbackToRandom: true, waypoints: [] });
    generateIterativeRoute.mockResolvedValue({ coordinates: lineOf(20), distanceKm: 28, elevationGain: 300, duration_s: 3600 });
    scoreRoutePreference.mockResolvedValue({ familiarityPercent: 10 });

    const r = await generateRouteFromNaturalLanguage('familiar loop', { biasCoord: [-105, 40], accessToken: 'tok' });

    expect(generateIterativeRoute).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('iterative_quarter_loop');
    expect(r.familiarityScore).toEqual({ familiarityPercent: 10 });
  });

  it('scores the iterative route when a token is present (no preferFamiliar)', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 45 });
    generateIterativeRoute.mockResolvedValue({ coordinates: lineOf(15), distanceKm: 21, elevationGain: 120, duration_s: 2700 });
    scoreRoutePreference.mockResolvedValue({ familiarityPercent: 33 });

    const r = await generateRouteFromNaturalLanguage('45 min ride', { biasCoord: [-105, 40], accessToken: 'tok' });

    expect(getFamiliarLoopWaypoints).not.toHaveBeenCalled();
    expect(scoreRoutePreference).toHaveBeenCalledTimes(1);
    expect(r.familiarityScore).toEqual({ familiarityPercent: 33 });
  });

  it('skips Strava branches entirely without a token (familiarityScore null)', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 60, preferences: { preferFamiliar: true } });
    generateIterativeRoute.mockResolvedValue({ coordinates: lineOf(20), distanceKm: 28, elevationGain: 300, duration_s: 3600 });

    const r = await generateRouteFromNaturalLanguage('familiar loop', { biasCoord: [-105, 40] });

    expect(getFamiliarLoopWaypoints).not.toHaveBeenCalled();
    expect(scoreRoutePreference).not.toHaveBeenCalled();
    expect(r.familiarityScore).toBeNull();
  });

  it('uses the smart-waypoints fallback when useIterativeBuilder is false', async () => {
    mockClaude({ routeType: 'loop', timeAvailable: 60 });
    generateSmartWaypoints.mockReturnValue([[-105, 40], [-105.2, 40.1], [-105, 40]]);
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOf(18), distance_m: 25000, elevationGain: 180, duration_s: 3300, source: 'brouter' });

    const r = await generateRouteFromNaturalLanguage('1 hour ride', {
      biasCoord: [-105, 40],
      useIterativeBuilder: false,
    });

    expect(generateSmartWaypoints).toHaveBeenCalledTimes(1);
    expect(generateIterativeRoute).not.toHaveBeenCalled();
    expect(r).toMatchObject({ distanceKm: 25, source: 'brouter' });
  });
});

describe('routeThroughWaypoints', () => {
  it('geocodes names, closes the loop, and returns canonical stats', async () => {
    geocodeWaypoint
      .mockResolvedValueOnce({ coordinates: [-104.9, 39.9], name: 'Hygiene' })
      .mockResolvedValueOnce({ coordinates: [-104.8, 39.8], name: 'Berthoud' });
    getSmartCyclingRoute.mockResolvedValue({
      coordinates: lineOf(20),
      distance_m: 30000,
      elevationGain: 250,
      duration_s: 4200,
      source: 'brouter',
    });

    const r = await routeThroughWaypoints([-105, 40], ['Hygiene', 'Berthoud'], {
      profile: 'gravel',
      goal: 'endurance',
      type: 'loop',
    });

    // start + 2 geocoded + return-to-start.
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(4);
    expect(getSmartCyclingRoute.mock.calls[0][1]).toMatchObject({ profile: 'gravel' });
    expect(r).toMatchObject({ distanceKm: 30, elevationGain: 250, source: 'brouter' });
    expect(r.geocodedNames).toEqual(['Hygiene', 'Berthoud']);
  });

  it('drops ungeocodable names but routes through the rest', async () => {
    geocodeWaypoint
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ coordinates: [-104.8, 39.8], name: 'Berthoud' });
    getSmartCyclingRoute.mockResolvedValue({
      coordinates: lineOf(15),
      distance_m: 20000,
      source: 'brouter',
    });

    const r = await routeThroughWaypoints([-105, 40], ['Nowhere', 'Berthoud'], { type: 'loop' });
    // start + 1 geocoded + return-to-start.
    expect(getSmartCyclingRoute.mock.calls[0][0]).toHaveLength(3);
    expect(r.geocodedNames).toEqual(['Berthoud']);
  });

  it('returns null when no name geocodes', async () => {
    geocodeWaypoint.mockResolvedValue(null);
    const r = await routeThroughWaypoints([-105, 40], ['Nowhere'], { type: 'loop' });
    expect(r).toBeNull();
    expect(getSmartCyclingRoute).not.toHaveBeenCalled();
  });

  it('returns null when routing yields too few points', async () => {
    geocodeWaypoint.mockResolvedValue({ coordinates: [-104.9, 39.9], name: 'Hygiene' });
    getSmartCyclingRoute.mockResolvedValue({ coordinates: lineOf(5), distance_m: 8000 });
    const r = await routeThroughWaypoints([-105, 40], ['Hygiene'], { type: 'loop' });
    expect(r).toBeNull();
  });
});
