import { describe, it, expect } from 'vitest';
import { finalizeHeroState, prescriptionIsRun } from '../getToday';
import { deriveIntervalSegments, intervalColoringEnabled } from '../deriveIntervalSegments';
import { formatDistanceKm, formatElevationM, formatDurationMin } from '../units';
import { formVerdict } from '../athleteState';
import { mapRowToRecentRide, filterRidesNearLatest } from '../../today/shared/recentRides';
import { todayFixture, fixtureRecentRides } from '../fixtures/todayFixture';
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

describe('recent rides (hero fallback helpers)', () => {
  it('maps a row with canonical columns', () => {
    const r = mapRowToRecentRide({
      id: 'a1',
      name: 'Gravel',
      start_date: '2026-06-17T13:00:00Z',
      provider: 'strava',
      distance_meters: 42100,
      elevation_gain_meters: 410,
      duration_seconds: 5400,
      polyline: 'abc',
    });
    expect(r.distanceKm).toBeCloseTo(42.1, 1);
    expect(r.elevationM).toBe(410);
    expect(r.durationSec).toBe(5400);
    expect(r.polyline).toBe('abc');
  });

  it('falls back to legacy distance/duration and nested Strava polyline', () => {
    const r = mapRowToRecentRide({
      id: 'a2',
      name: null,
      start_date: '2026-06-15T13:00:00Z',
      distance: 31700, // legacy meters
      total_elevation_gain: 260,
      moving_time: 4200,
      map: { summary_polyline: 'xyz' },
    });
    expect(r.name).toBe('Untitled Ride');
    expect(r.distanceKm).toBeCloseTo(31.7, 1);
    expect(r.durationSec).toBe(4200);
    expect(r.polyline).toBe('xyz');
  });

  it('drops a geographically distant (indoor/bogus) ride', () => {
    const near = { id: 'n1', coords: [[-105.27, 40.02]] as Array<[number, number]> };
    const near2 = { id: 'n2', coords: [[-105.25, 40.03]] as Array<[number, number]> };
    const farOutlier = { id: 'f1', coords: [[0, 0]] as Array<[number, number]> };
    const kept = filterRidesNearLatest([near, near2, farOutlier]);
    expect(kept.map((r) => r.id)).toEqual(['n1', 'n2']);
  });

  it('fixture provides rides with polylines for the hero fallback', () => {
    expect(fixtureRecentRides.length).toBeGreaterThan(0);
    expect(fixtureRecentRides.every((r) => r.polyline)).toBe(true);
  });
});

describe('formVerdict', () => {
  it('maps Form Score to a plain-language verdict (spec §5 bands)', () => {
    expect(formVerdict(null)).toBe('building baseline');
    expect(formVerdict(25)).toBe('too fresh — add load');
    expect(formVerdict(15)).toBe('fresh — cleared for quality');
    expect(formVerdict(0)).toBe('grey zone — cleared for quality');
    expect(formVerdict(-15)).toBe('productive load — steady aerobic');
    expect(formVerdict(-31)).toBe('overreached — recover');
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
