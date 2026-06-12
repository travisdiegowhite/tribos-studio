import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pipeline collaborators; scoring/snapshot helpers run real.
const parseRouteRequest = vi.fn();
const generateRouteFromParsedRequest = vi.fn();
vi.mock('../naturalLanguageRouteBuilder', () => ({
  parseRouteRequest: (...a: unknown[]) => parseRouteRequest(...a),
  generateRouteFromParsedRequest: (...a: unknown[]) => generateRouteFromParsedRequest(...a),
}));

const generateIterativeRoute = vi.fn();
vi.mock('../iterativeRouteBuilder', () => ({
  generateIterativeRoute: (...a: unknown[]) => generateIterativeRoute(...a),
  resolveBearing: (d: unknown) => {
    if (d === null || d === undefined) return null;
    const text = String(d).toLowerCase().trim();
    const map: Record<string, number> = { north: 0, northeast: 45, east: 90, south: 180 };
    if (text in map) return map[text];
    const n = Number(text);
    return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null;
  },
  getDirectionName: (b: number) =>
    ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'][
      Math.round((((b % 360) + 360) % 360) / 45) % 8
    ],
}));

const scoreRoutePreference = vi.fn();
vi.mock('../routeScoring', () => ({
  scoreRoutePreference: (...a: unknown[]) => scoreRoutePreference(...a),
}));

const enrichRouteElevation = vi.fn();
vi.mock('../../hooks/route-builder/elevationEnrichment', () => ({
  enrichRouteElevation: (...a: unknown[]) => enrichRouteElevation(...a),
}));

import { generateRouteCandidatesFromNaturalLanguage } from '../naturalLanguageRouteCandidates';

/** ~`n` points heading northeast from the start so direction scoring is sane. */
const lineOf = (n: number): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40 + i * 0.001]);

const BASE_REQUEST = {
  parsed: { waypoints: [], preferences: { surfaceType: 'gravel' } },
  startLocation: [-105, 40] as [number, number],
  routeProfile: 'gravel',
  goal: 'endurance',
  type: 'loop',
  preferFamiliar: false,
  durationMinutes: 150,
  targetDistanceKm: 72,
  direction: 'northeast',
};

function iterativeRouteOf(distanceKm: number, elevationGain = 300) {
  return {
    coordinates: lineOf(20),
    distanceKm,
    elevationGain,
    duration_s: 9000,
    name: `${distanceKm}km loop`,
    source: 'iterative_quarter_loop',
    directionLabel: 'Northeast',
  };
}

beforeEach(() => {
  parseRouteRequest.mockReset();
  generateRouteFromParsedRequest.mockReset();
  generateIterativeRoute.mockReset();
  scoreRoutePreference.mockReset();
  enrichRouteElevation.mockReset();
  // Default: enrichment is a pass-through.
  enrichRouteElevation.mockImplementation(async (snap: unknown) => snap);
});

describe('generateRouteCandidatesFromNaturalLanguage — iterative variants', () => {
  it('parses once and builds cw/ccw/offset variants of the requested bearing', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockResolvedValue(iterativeRouteOf(72));

    const candidates = await generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {});

    expect(parseRouteRequest).toHaveBeenCalledTimes(1);
    expect(generateIterativeRoute).toHaveBeenCalledTimes(3);
    const variantArgs = generateIterativeRoute.mock.calls.map((call) => {
      const p = call[0] as Record<string, unknown>;
      return { direction: p.direction, loopOrientation: p.loopOrientation };
    });
    expect(variantArgs).toContainEqual({ direction: '45', loopOrientation: 'cw' });
    expect(variantArgs).toContainEqual({ direction: '45', loopOrientation: 'ccw' });
    expect(variantArgs).toContainEqual({ direction: '75', loopOrientation: 'cw' });
    expect(candidates).toHaveLength(3);
    expect(generateRouteFromParsedRequest).not.toHaveBeenCalled();
  }, 10000);

  it('orders candidates best-first by fidelity to the requested distance', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockImplementation(
      async ({ loopOrientation, direction }: { loopOrientation: string; direction: string }) => {
        if (direction === '45' && loopOrientation === 'cw') return iterativeRouteOf(110); // way long
        if (direction === '45' && loopOrientation === 'ccw') return iterativeRouteOf(72); // on target
        return iterativeRouteOf(55); // short
      },
    );

    const candidates = await generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {});

    expect(candidates[0].snapshot.stats.distance_km).toBe(72);
    expect(candidates[0].loop_orientation).toBe('ccw');
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
    expect(candidates[1].score).toBeGreaterThanOrEqual(candidates[2].score);
  }, 10000);

  it('enriches every candidate before returning (no 0m climbing cards)', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockResolvedValue(iterativeRouteOf(72, 0));
    enrichRouteElevation.mockImplementation(async (snap: { stats: object }) => ({
      ...snap,
      stats: { ...snap.stats, elevation_gain_m: 480, elevation_loss_m: 480 },
    }));

    const candidates = await generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {});

    expect(enrichRouteElevation).toHaveBeenCalledTimes(3);
    for (const c of candidates) {
      expect(c.snapshot.stats.elevation_gain_m).toBe(480);
    }
  }, 10000);

  it('tolerates variant failures and retries the offset variant mirrored', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockImplementation(async ({ direction }: { direction: string }) => {
      if (direction === '75') throw new Error('router down');
      if (direction === '15') return iterativeRouteOf(70); // mirrored fallback works
      return iterativeRouteOf(72);
    });

    const candidates = await generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {});

    // cw + ccw + mirrored fallback all landed.
    expect(candidates).toHaveLength(3);
    const directions = generateIterativeRoute.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>).direction,
    );
    expect(directions).toContain('15');
  }, 10000);

  it('throws when every variant fails', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockRejectedValue(new Error('router down'));

    await expect(
      generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {}),
    ).rejects.toThrow(/could not generate/i);
  }, 10000);

  it('scores familiarity per candidate when a token is present', async () => {
    parseRouteRequest.mockResolvedValue(BASE_REQUEST);
    generateIterativeRoute.mockResolvedValue(iterativeRouteOf(72));
    scoreRoutePreference.mockResolvedValue({ familiarityPercent: 41 });

    const candidates = await generateRouteCandidatesFromNaturalLanguage('ne gravel loop', {
      accessToken: 'tok',
    });

    expect(scoreRoutePreference).toHaveBeenCalledTimes(3);
    expect(candidates[0].familiarity_percent).toBe(41);
  }, 10000);
});

describe('generateRouteCandidatesFromNaturalLanguage — single-candidate branches', () => {
  it('named waypoints delegate to the single-route pipeline', async () => {
    parseRouteRequest.mockResolvedValue({
      ...BASE_REQUEST,
      parsed: { waypoints: ['River Trail'], preferences: {} },
      direction: null,
    });
    generateRouteFromParsedRequest.mockResolvedValue({
      coordinates: lineOf(15),
      distanceKm: 31.2,
      elevationGain: 120,
      duration_s: 4000,
      name: 'River Trail loop',
      source: 'brouter',
      familiarityScore: null,
    });

    const candidates = await generateRouteCandidatesFromNaturalLanguage('loop via River Trail', {});

    expect(generateRouteFromParsedRequest).toHaveBeenCalledTimes(1);
    expect(generateIterativeRoute).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('River Trail loop');
    expect(enrichRouteElevation).toHaveBeenCalledTimes(1);
  });

  it('familiar-roads requests stay single-candidate', async () => {
    parseRouteRequest.mockResolvedValue({ ...BASE_REQUEST, preferFamiliar: true });
    generateRouteFromParsedRequest.mockResolvedValue({
      coordinates: lineOf(15),
      distanceKm: 70,
      elevationGain: 400,
      duration_s: 9000,
      name: 'Familiar 70km endurance loop',
      source: 'familiar_segments',
      familiarityScore: { familiarityPercent: 80 },
    });

    const candidates = await generateRouteCandidatesFromNaturalLanguage('familiar ne loop', {
      accessToken: 'tok',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].familiarity_percent).toBe(80);
    expect(generateIterativeRoute).not.toHaveBeenCalled();
  });
});
