import { describe, it, expect, vi, beforeEach } from 'vitest';

const measureRouteStress = vi.fn();
vi.mock('../roadAttributes', () => ({
  measureRouteStress: (...a: unknown[]) => measureRouteStress(...a),
}));
vi.mock('../brouter', () => ({
  getBRouterDirections: vi.fn(),
  BROUTER_PROFILES: { GRAVEL: 'gravel', TREKKING: 'trekking', SAFETY: 'safety', MTB: 'mtb', FASTBIKE: 'fastbike' },
}));

import {
  detourAllowance,
  kmOverTolerance,
  calmMetric,
  pickCalmest,
  measureCandidates,
  brouterCandidateProfiles,
  gatherCandidates,
  STRESS_MEASURE_TIMEOUT_MS,
} from '../routeAlternates';
import type { StressSummary } from '../trafficStress';

function summary(kmByLts: Partial<Record<1 | 2 | 3 | 4, number>>, stressScore = 0.3): StressSummary {
  const k = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, ...kmByLts };
  const knownKm = k[1] + k[2] + k[3] + k[4];
  return {
    totalKm: knownKm,
    knownKm,
    kmByLts: k,
    quietPct: knownKm > 0 ? Math.round(((k[1] + k[2]) / knownKm) * 100) : 0,
    unknownPct: 0,
    stressScore,
    lts4Km: k[4],
    maxContinuousLts4Km: k[4],
  };
}

const line = (n: number) => Array.from({ length: n }, (_, i) => [-105 + i * 0.001, 40] as [number, number]);

beforeEach(() => {
  measureRouteStress.mockReset();
});

describe('detourAllowance / kmOverTolerance / calmMetric', () => {
  it('allows a longer detour for a quieter rider', () => {
    expect(detourAllowance('low')).toBe(0.25);
    expect(detourAllowance('medium')).toBe(0.15);
    expect(detourAllowance(null)).toBe(0.15);
    expect(detourAllowance('high')).toBe(0.05);
  });

  it('counts km above the tolerated LTS', () => {
    const s = summary({ 1: 5, 2: 3, 3: 2, 4: 1 });
    expect(kmOverTolerance(s, 'low')).toBe(3); // LTS 3 + 4
    expect(kmOverTolerance(s, 'medium')).toBe(1); // LTS 4
    expect(kmOverTolerance(s, 'high')).toBe(0);
    expect(calmMetric(s, 'medium')).toBeCloseTo(1 + 0.25 * 0.3 * 11, 6);
  });
});

describe('pickCalmest', () => {
  const primary = { coordinates: line(5), distance_m: 20000, source: 'stadia_maps', stressSummary: summary({ 1: 10, 3: 6, 4: 4 }, 0.5) };

  it('keeps the primary when nothing is measured or nothing is better', () => {
    expect(pickCalmest([{ ...primary, stressSummary: null }, { ...primary }], 'medium').index).toBe(0);
    expect(pickCalmest([primary, { ...primary, stressSummary: null }], 'medium').index).toBe(0);
    expect(pickCalmest([primary, { ...primary }], 'medium').index).toBe(0);
  });

  it('switches to a clearly calmer line inside the detour allowance', () => {
    const calmer = { ...primary, source: 'brouter', distance_m: 22000, stressSummary: summary({ 1: 16, 2: 5, 3: 1 }, 0.1) };
    const pick = pickCalmest([primary, calmer], 'medium');
    expect(pick.index).toBe(1);
    expect(pick.km_over_before).toBe(4);
    expect(pick.km_over_after).toBe(0);
    expect(pick.extra_km).toBe(2);
    expect(pick.considered).toBe(2);
  });

  it('ignores a calmer line that is too long for the tolerance', () => {
    const calmer = { ...primary, distance_m: 24000, stressSummary: summary({ 1: 24 }, 0) }; // +20%
    expect(pickCalmest([primary, calmer], 'medium').index).toBe(0); // allowance 15%
    expect(pickCalmest([primary, calmer], 'low').index).toBe(1); // allowance 25%
  });

  it('ignores a marginal gain', () => {
    const slightly = { ...primary, distance_m: 20000, stressSummary: summary({ 1: 10, 3: 6, 4: 3.9 }, 0.5) };
    expect(pickCalmest([primary, slightly], 'medium').index).toBe(0);
  });

  it('for a quiet rider, LTS 3 counts as over', () => {
    const noLts4 = { ...primary, distance_m: 21000, stressSummary: summary({ 1: 10, 3: 11 }, 0.4) };
    const noLts3 = { ...primary, distance_m: 23000, stressSummary: summary({ 1: 12, 2: 9, 4: 2 }, 0.3) };
    expect(pickCalmest([primary, noLts4, noLts3], 'medium').index).toBe(1);
    expect(pickCalmest([primary, noLts4, noLts3], 'low').index).toBe(2);
  });
});

describe('measureCandidates', () => {
  it('measures every unmeasured candidate in parallel, passing its tags, capped and fail-soft', async () => {
    vi.useFakeTimers();
    try {
      const s = summary({ 1: 2 });
      measureRouteStress
        .mockResolvedValueOnce({ summary: s })
        .mockReturnValueOnce(new Promise(() => {})) // never answers → capped
        .mockRejectedValueOnce(new Error('down'));
      const tagged = [{ id: -1, geometry: line(2), tags: {} }];
      const pending = measureCandidates([
        { coordinates: line(3), taggedWays: tagged },
        { coordinates: line(3) },
        { coordinates: line(3) },
        { coordinates: line(3), stressSummary: s },
      ]);
      await vi.advanceTimersByTimeAsync(STRESS_MEASURE_TIMEOUT_MS + 10);
      const out = await pending;
      expect(out.map((c) => c.stressSummary)).toEqual([s, null, null, s]);
      expect(measureRouteStress).toHaveBeenCalledTimes(3);
      expect(measureRouteStress.mock.calls[0][1]).toEqual({ taggedWays: tagged });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('brouterCandidateProfiles / gatherCandidates', () => {
  it('tries trekking for a medium rider, trekking + safety for a quiet one, nothing for direct', () => {
    expect(brouterCandidateProfiles('medium')).toEqual(['trekking']);
    expect(brouterCandidateProfiles(null)).toEqual(['trekking']);
    expect(brouterCandidateProfiles('low')).toEqual(['trekking', 'safety']);
    expect(brouterCandidateProfiles('high')).toEqual([]);
  });

  it('gathers primary + its alternates + BRouter lines, normalised and measured', async () => {
    const s = summary({ 1: 3 });
    measureRouteStress.mockResolvedValue({ summary: s });
    const fetchBRouter = vi.fn(async (_pts: unknown, { profile }: { profile: string }) =>
      profile === 'safety'
        ? null
        : { coordinates: line(4), distance_m: 21000, duration_s: 3000, elevation: { ascent: 50, descent: 40 }, taggedWays: [] },
    );
    const primary = {
      coordinates: line(5),
      distance_m: 20000,
      source: 'stadia_maps',
      alternates: [{ coordinates: line(5), distance_m: 20500, source: 'stadia_maps' }],
    };
    const out = await gatherCandidates([[-105, 40], [-104.9, 40]], primary, { tolerance: 'low', fetchBRouter });
    expect(fetchBRouter).toHaveBeenCalledTimes(2);
    expect(fetchBRouter.mock.calls[0][1]).toEqual({ profile: 'trekking' });
    expect(out.map((c) => c.source)).toEqual(['stadia_maps', 'stadia_maps', 'brouter']);
    expect('alternates' in out[0]).toBe(false);
    expect(out[2]).toMatchObject({ profile: 'trekking', distance_m: 21000, elevationGain: 50, confidence: 0.9 });
    expect(out.every((c) => c.stressSummary === s)).toBe(true);
  });

  it('does not re-request the profile the primary already is', async () => {
    measureRouteStress.mockResolvedValue({ summary: summary({ 1: 1 }) });
    const fetchBRouter = vi.fn(async (_pts: unknown, _o: { profile: string }) => null);
    await gatherCandidates([[-105, 40], [-104.9, 40]], { coordinates: line(3), source: 'brouter', profile: 'trekking' }, { tolerance: 'low', fetchBRouter });
    expect(fetchBRouter).toHaveBeenCalledTimes(1);
    expect(fetchBRouter.mock.calls[0][1]).toEqual({ profile: 'safety' });
  });
});
