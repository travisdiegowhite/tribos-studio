import { describe, it, expect } from 'vitest';
import { finalizeHeroState, prescriptionIsRun } from '../getToday';
import { deriveIntervalSegments, intervalColoringEnabled } from '../deriveIntervalSegments';
import { formatDistanceKm, formatElevationM, formatDurationMin } from '../units';
import { formVerdict } from '../athleteState';
import { todayFixture } from '../fixtures/todayFixture';
import type { TodayRoute } from '../types';

function route(matchPct: number, hasGeo = true): TodayRoute {
  return {
    id: 'r',
    name: 'R',
    geojson: hasGeo ? { type: 'LineString', coordinates: [[0, 0], [1, 1]] } : null,
    polyline: null,
    distanceKm: 10,
    elevationGainM: 100,
    matchPct,
    intervalSegments: [],
    start: [0, 0],
  };
}

describe('finalizeHeroState', () => {
  it('keeps non-generating states untouched', () => {
    expect(finalizeHeroState('rest', null)).toBe('rest');
    expect(finalizeHeroState('suggested', null)).toBe('suggested');
    expect(finalizeHeroState('first-run', null)).toBe('first-run');
  });

  it('promotes generating → matched on a good match', () => {
    expect(finalizeHeroState('generating', route(100))).toBe('matched');
    expect(finalizeHeroState('generating', route(75))).toBe('matched');
  });

  it('falls to generated on a weak/absent match', () => {
    expect(finalizeHeroState('generating', route(50))).toBe('generated');
    expect(finalizeHeroState('generating', route(95, false))).toBe('generated');
    expect(finalizeHeroState('generating', null)).toBe('generated');
  });
});

describe('deriveIntervalSegments (gated)', () => {
  it('returns [] while interval coloring is gated off (default build)', () => {
    expect(intervalColoringEnabled()).toBe(false);
    const segs = deriveIntervalSegments(
      { type: 'tempo', title: 'T', durationMin: 60, targetRSS: 80, structure: '3x10min @ tempo', workoutId: 'w' },
      200,
    );
    expect(segs).toEqual([]);
  });
});

describe('units', () => {
  it('formats distance per unit system', () => {
    expect(formatDistanceKm(10, 'metric')).toBe('10.0 km');
    expect(formatDistanceKm(1.609344, 'imperial')).toBe('1.0 mi');
  });
  it('formats elevation per unit system', () => {
    expect(formatElevationM(100, 'metric')).toBe('100 m');
    expect(formatElevationM(0.3048, 'imperial')).toBe('1 ft');
  });
  it('formats duration', () => {
    expect(formatDurationMin(45)).toBe('45 min');
    expect(formatDurationMin(90)).toBe('1h 30m');
    expect(formatDurationMin(120)).toBe('2 h');
  });
});

describe('prescriptionIsRun (sport gate)', () => {
  const base = { durationMin: 40, targetRSS: 45, structure: null, workoutId: 'w' };
  it('detects a run from type or title', () => {
    expect(prescriptionIsRun({ ...base, type: 'run', title: 'Intervals' })).toBe(true);
    // generic type, run only in the title — the screenshot case
    expect(prescriptionIsRun({ ...base, type: 'endurance', title: 'Easy Aerobic Run' })).toBe(true);
  });
  it('treats rides as non-run', () => {
    expect(prescriptionIsRun({ ...base, type: 'tempo', title: 'Tempo Intervals' })).toBe(false);
    expect(prescriptionIsRun(null)).toBe(false);
  });
});

describe('formVerdict', () => {
  it('maps Form Score to a plain-language verdict', () => {
    expect(formVerdict(null)).toBe('building baseline');
    expect(formVerdict(20)).toBe('fresh — add load');
    expect(formVerdict(8)).toBe('primed — cleared for quality');
    expect(formVerdict(0)).toBe('cleared for quality');
    expect(formVerdict(-15)).toBe('steady aerobic only');
    expect(formVerdict(-30)).toBe('keep it easy — recover');
  });
});

describe('todayFixture is internally coherent', () => {
  it('matched state agrees with a strong route match and a real prescription', () => {
    expect(todayFixture.heroState).toBe('matched');
    expect(todayFixture.prescription).not.toBeNull();
    expect(todayFixture.prescription?.type).not.toBe('rest');
    expect(todayFixture.route?.matchPct ?? 0).toBeGreaterThanOrEqual(75);
    expect(todayFixture.athleteState.fs).not.toBeNull();
  });

  it('fills the fitness story and forward outlook', () => {
    expect(todayFixture.athleteState.fitnessHistory.length).toBeGreaterThanOrEqual(2);
    expect(todayFixture.athleteState.fitnessEmpty).toBe(false);
    expect(todayFixture.athleteState.formVerdict).toBeTruthy();
    expect(todayFixture.outlook.line).toContain('Gravel Worlds');
  });
});
