import { describe, it, expect } from 'vitest';
import {
  COMFORT_LEVELS,
  DEFAULT_COMFORT_LEVEL,
  isComfortLevel,
  comfortLevelFromTolerance,
  toleranceForComfortLevel,
  resolveComfortLevel,
} from './comfortLevel.js';
import * as browser from '../../src/utils/comfortLevels';

describe('api comfortLevel mirrors src/utils/comfortLevels.ts', () => {
  it('has the same levels and default', () => {
    expect(COMFORT_LEVELS).toEqual([...browser.COMFORT_LEVELS]);
    expect(DEFAULT_COMFORT_LEVEL).toBe(browser.DEFAULT_COMFORT_LEVEL);
  });

  it.each(['low', 'medium', 'high'])('maps tolerance %s the same way', (t) => {
    expect(comfortLevelFromTolerance(t)).toBe(browser.comfortLevelFromTolerance(t));
  });

  it.each([1, 2, 3, 4, 5])('maps level %i the same way', (l) => {
    expect(toleranceForComfortLevel(l)).toBe(browser.toleranceForComfortLevel(l));
  });
});

describe('isComfortLevel', () => {
  it('accepts integers 1–5 only', () => {
    expect([1, 2, 3, 4, 5].every(isComfortLevel)).toBe(true);
    for (const bad of [0, 6, 2.5, '2', null, undefined, 'low']) expect(isComfortLevel(bad)).toBe(false);
  });
});

describe('resolveComfortLevel', () => {
  it('prefers the stored level', () => {
    expect(resolveComfortLevel({ comfort_level: 1, traffic_tolerance: 'low' })).toEqual({ level: 1, source: 'stored' });
  });
  it('derives from tolerance before migration 139 or before a level is chosen', () => {
    expect(resolveComfortLevel({ traffic_tolerance: 'medium' })).toEqual({ level: 3, source: 'tolerance' });
    expect(resolveComfortLevel({ comfort_level: null, traffic_tolerance: 'high' })).toEqual({ level: 4, source: 'tolerance' });
  });
  it('defaults a rider with no row to Comfort 2', () => {
    expect(resolveComfortLevel(null)).toEqual({ level: 2, source: 'default' });
  });
});
