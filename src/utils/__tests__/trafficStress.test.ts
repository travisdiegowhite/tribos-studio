import { describe, it, expect } from 'vitest';
import {
  ltsForTags,
  parseMaxspeedKph,
  bikeFacility,
  maxLtsForTolerance,
  summarizeStress,
  facilityForTags,
  summarizeFacilities,
  LTS_COLORS,
  LTS_LABELS,
} from '../trafficStress';

describe('parseMaxspeedKph', () => {
  it('parses plain, mph and km/h forms', () => {
    expect(parseMaxspeedKph('50')).toBe(50);
    expect(parseMaxspeedKph('25 mph')).toBeCloseTo(40.2, 1);
    expect(parseMaxspeedKph('30 km/h')).toBe(30);
    expect(parseMaxspeedKph('30kph')).toBe(30);
  });

  it('returns null for words and garbage', () => {
    expect(parseMaxspeedKph('walk')).toBeNull();
    expect(parseMaxspeedKph('none')).toBeNull();
    expect(parseMaxspeedKph('signals')).toBeNull();
    expect(parseMaxspeedKph(undefined)).toBeNull();
    expect(parseMaxspeedKph('')).toBeNull();
  });
});

describe('bikeFacility', () => {
  it('ranks separated > lane > shoulder > shared', () => {
    expect(bikeFacility({ highway: 'cycleway' })).toBe('separated');
    expect(bikeFacility({ highway: 'residential', 'cycleway:right': 'track' })).toBe('separated');
    expect(bikeFacility({ highway: 'tertiary', cycleway: 'lane' })).toBe('lane');
    expect(bikeFacility({ highway: 'tertiary', shoulder: 'yes' })).toBe('shoulder');
    expect(bikeFacility({ highway: 'tertiary', 'shoulder:width': '1.5' })).toBe('shoulder');
    expect(bikeFacility({ highway: 'tertiary', cycleway: 'shared_lane' })).toBe('shared');
    expect(bikeFacility({ highway: 'tertiary', cycleway: 'no' })).toBe('none');
    expect(bikeFacility({ highway: 'tertiary', cycleway: 'lane', shoulder: 'yes' })).toBe('lane');
  });
});

describe('ltsForTags', () => {
  // Rows are (description, tags, expected LTS).
  const cases: Array<[string, Record<string, string>, number]> = [
    ['no highway tag', { surface: 'gravel' }, 0],
    ['proposed road', { highway: 'proposed' }, 0],
    ['dedicated cycleway', { highway: 'cycleway' }, 1],
    ['gravel track', { highway: 'track', surface: 'gravel' }, 1],
    ['designated path', { highway: 'path', bicycle: 'designated' }, 1],
    ['protected track on a busy road', { highway: 'primary', maxspeed: '45 mph', 'cycleway:right': 'track' }, 1],
    ['motorway', { highway: 'motorway' }, 4],
    ['living street', { highway: 'living_street' }, 1],
    ['service road', { highway: 'service' }, 1],
    ['30 km/h residential', { highway: 'residential', maxspeed: '30' }, 1],
    ['25 mph residential, no lane', { highway: 'residential', maxspeed: '25 mph' }, 2],
    ['residential, no maxspeed (assumed 40)', { highway: 'residential' }, 2],
    ['residential with street parking', { highway: 'residential', maxspeed: '25 mph', 'parking:lane:both': 'parallel' }, 3],
    ['unclassified, no tags (assumed 50, 2 lanes)', { highway: 'unclassified' }, 3],
    ['tertiary 50 km/h 2 lanes', { highway: 'tertiary', maxspeed: '50', lanes: '2' }, 3],
    ['tertiary 35 mph 4 lanes', { highway: 'tertiary', maxspeed: '35 mph', lanes: '4' }, 4],
    ['secondary 60 km/h no lane', { highway: 'secondary', maxspeed: '60' }, 4],
    ['primary no lane, slow', { highway: 'primary', maxspeed: '40' }, 4],
    ['trunk', { highway: 'trunk' }, 4],
    ['45 mph 4-lane no shoulder', { highway: 'secondary', maxspeed: '45 mph', lanes: '4' }, 4],
    ['45 mph 4-lane with bike lane', { highway: 'secondary', maxspeed: '45 mph', lanes: '4', cycleway: 'lane' }, 4],
    ['40 mph 2-lane with bike lane', { highway: 'secondary', maxspeed: '40 mph', lanes: '2', cycleway: 'lane' }, 3],
    ['30 mph with bike lane', { highway: 'tertiary', maxspeed: '30 mph', cycleway: 'lane' }, 2],
    ['25 mph 2-lane with bike lane', { highway: 'residential', maxspeed: '25 mph', lanes: '2', cycleway: 'lane' }, 1],
    ['25 mph bike lane beside parking', { highway: 'residential', maxspeed: '25 mph', cycleway: 'lane', 'parking:right': 'parallel' }, 2],
    ['55 km/h tertiary with paved shoulder', { highway: 'tertiary', maxspeed: '55', shoulder: 'yes' }, 3],
    ['40 km/h road with shoulder is at least 2', { highway: 'residential', maxspeed: '40', shoulder: 'both' }, 2],
    ['sharrow on 30 mph road is one worse than a lane', { highway: 'tertiary', maxspeed: '30 mph', cycleway: 'shared_lane' }, 3],
    ['70 mph shoulder is still 4', { highway: 'primary', maxspeed: '70 mph', shoulder: 'yes' }, 4],
  ];

  it.each(cases)('%s → LTS %i', (_name, tags, expected) => {
    expect(ltsForTags(tags)).toBe(expected);
  });

  it('is 0 for null input', () => {
    expect(ltsForTags(null)).toBe(0);
    expect(ltsForTags(undefined)).toBe(0);
  });
});

describe('maxLtsForTolerance', () => {
  it('maps low/medium/high to 2/3/4, defaulting to 3', () => {
    expect(maxLtsForTolerance('low')).toBe(2);
    expect(maxLtsForTolerance('medium')).toBe(3);
    expect(maxLtsForTolerance('high')).toBe(4);
    expect(maxLtsForTolerance(null)).toBe(3);
  });
});

describe('summarizeStress', () => {
  // 11 vertices east along 40°N, each step 0.001° ≈ 85 m.
  const line = Array.from({ length: 11 }, (_, i) => [-105 + i * 0.001, 40]);

  it('weights by segment length and finds the longest LTS 4 run', () => {
    const lts = [1, 1, 2, 4, 4, 4, 2, 0, 4, 3];
    const s = summarizeStress(lts, line);
    expect(s.totalKm).toBeCloseTo(0.853, 2);
    expect(s.kmByLts[0]).toBeCloseTo(0.085, 2);
    expect(s.knownKm).toBeCloseTo(s.totalKm - s.kmByLts[0], 3);
    expect(s.lts4Km).toBeCloseTo(4 * 0.0853, 2);
    expect(s.maxContinuousLts4Km).toBeCloseTo(3 * 0.0853, 2);
    expect(s.unknownPct).toBe(10);
    // Known: 9 segments; LTS 1–2 = 4 of them.
    expect(s.quietPct).toBe(44);
    expect(s.stressScore).toBeGreaterThan(0.4);
    expect(s.stressScore).toBeLessThan(0.6);
  });

  it('is all quiet with zero stress on a calm route', () => {
    const s = summarizeStress(Array(10).fill(1), line);
    expect(s.quietPct).toBe(100);
    expect(s.stressScore).toBe(0);
    expect(s.lts4Km).toBe(0);
  });

  it('falls back to equal weights when geometry does not line up', () => {
    const s = summarizeStress([1, 4], null);
    expect(s.quietPct).toBe(50);
    expect(s.stressScore).toBe(0.5);
  });

  it('reports 100% unknown for an empty input', () => {
    const s = summarizeStress([], line);
    expect(s.unknownPct).toBe(100);
    expect(s.quietPct).toBe(0);
  });
});

describe('palette', () => {
  it('has a color and label for every level', () => {
    for (const level of [0, 1, 2, 3, 4] as const) {
      expect(LTS_COLORS[level]).toMatch(/^#/);
      expect(LTS_LABELS[level].length).toBeGreaterThan(0);
    }
  });
});

describe('facilityForTags', () => {
  it.each([
    [{ highway: 'cycleway' }, 'protected'],
    [{ highway: 'residential', cycleway: 'track' }, 'protected'],
    [{ highway: 'secondary', 'cycleway:right': 'sidepath' }, 'protected'],
    [{ highway: 'path', bicycle: 'designated' }, 'protected'],
    [{ highway: 'path' }, 'trail'],
    [{ highway: 'track', surface: 'gravel' }, 'trail'],
    [{ highway: 'footway' }, 'trail'],
    [{ highway: 'bridleway' }, 'trail'],
    [{ highway: 'primary', cycleway: 'lane' }, 'lane'],
    [{ highway: 'primary', 'cycleway:both': 'lane' }, 'lane'],
    [{ highway: 'secondary', shoulder: 'yes' }, 'shoulder'],
    [{ highway: 'secondary', 'shoulder:width': '1.5' }, 'shoulder'],
    [{ highway: 'residential', cycleway: 'shared_lane' }, 'shared'],
    [{ highway: 'residential' }, 'none'],
    [{ highway: 'primary', cycleway: 'no' }, 'none'],
  ] as const)('%o → %s', (tags, kind) => {
    expect(facilityForTags({ ...tags })).toBe(kind);
  });

  it('is unknown without tags or a highway', () => {
    expect(facilityForTags(null)).toBe('unknown');
    expect(facilityForTags({})).toBe('unknown');
    expect(facilityForTags({ surface: 'asphalt' })).toBe('unknown');
  });
});

describe('summarizeFacilities', () => {
  const line = Array.from({ length: 11 }, (_, i) => [-105 + i * 0.001, 40]);

  it('weights by segment length and counts only protected + lane + shoulder toward the share', () => {
    const kinds = ['protected', 'lane', 'lane', 'shoulder', 'trail', 'trail', 'shared', 'none', 'none', 'unknown'] as const;
    const s = summarizeFacilities(kinds, line);
    expect(s.totalKm).toBeCloseTo(0.853, 2);
    expect(s.knownKm).toBeCloseTo(0.768, 2);
    expect(s.facilityKm).toBeCloseTo(4 * 0.0853, 2);
    expect(s.facilityPct).toBe(44); // 4 of 9 known
    expect(s.kmByKind.trail).toBeCloseTo(2 * 0.0853, 2);
    expect(s.kmByKind.unknown).toBeCloseTo(0.0853, 2);
  });

  it('falls back to equal weights and reports 0% for nothing known', () => {
    expect(summarizeFacilities(['lane', 'none'], null).facilityPct).toBe(50);
    expect(summarizeFacilities([], line).facilityPct).toBe(0);
    expect(summarizeFacilities(['unknown', 'unknown'], null).facilityPct).toBe(0);
  });
});
