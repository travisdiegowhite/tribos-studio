import { describe, it, expect } from 'vitest';
import {
  COMFORT_LEVELS,
  COMFORT_RULES,
  DEFAULT_COMFORT_LEVEL,
  allComfortCopy,
  classStatus,
  classesForLevel,
  comfortCard,
  comfortLevelFromTolerance,
  toComfortLevel,
  toleranceForComfortLevel,
} from '../comfortLevels';
import { REASONS } from '../comfortClass';
import { VALIDATOR_REASONS } from '../comfortValidator';

const ABSOLUTES = /\b(never|always|guarantee[sd]?|guaranteed)\b/i;

describe('copy rule: no absolutes in rider-facing strings', () => {
  it('comfort card and labels', () => {
    for (const s of allComfortCopy()) expect(s).not.toMatch(ABSOLUTES);
  });

  it('heads-up reasons', () => {
    for (const s of [...Object.values(REASONS), ...Object.values(VALIDATOR_REASONS)]) {
      expect(s).not.toMatch(ABSOLUTES);
    }
  });

  it('the test regex catches what it should', () => {
    expect('Never on a highway').toMatch(ABSOLUTES);
    expect('Guaranteed quiet').toMatch(ABSOLUTES);
  });
});

describe('spec §2 table', () => {
  it.each([
    [1, [1], [2, 3], [4, 5, 'X']],
    [2, [1, 2], [3, 4], [5, 'X']],
    [3, [1, 2, 3], [4, 5], ['X']],
    [4, [1, 2, 3, 4], [5], ['X']],
    [5, [1, 2, 3, 4, 5], [], ['X']],
  ] as const)('level %i', (level, free, flagged, keptOff) => {
    expect(classesForLevel(level)).toEqual({ free, flagged, keptOff });
  });

  it('X is blocked at every level', () => {
    for (const l of COMFORT_LEVELS) expect(classStatus('X', l)).toBe('blocked');
  });

  it('default is 2', () => {
    expect(DEFAULT_COMFORT_LEVEL).toBe(2);
  });
});

describe('card copy is derived from the rules', () => {
  it('lists what the rules allow', () => {
    const card = comfortCard(2);
    expect(card.label).toBe('Easy');
    expect(card.roadsLike).toEqual(['Paths and quiet streets', 'Quiet connectors and bike lanes']);
    expect(card.shortFlaggedStretchesOnly).toEqual(['Busier roads with room for you', 'Fast roads with a shoulder']);
    expect(card.keptOff).toEqual(['Fast roads with no space', 'Roads closed to bikes']);
  });

  it('says nothing is flagged at Direct', () => {
    expect(comfortCard(5).shortFlaggedStretchesOnly).toEqual(['Nothing is flagged at this level']);
  });

  it('flagged window size is one config value', () => {
    expect(COMFORT_RULES.flaggedLevelsAbove).toBe(2);
    expect(Math.round(COMFORT_RULES.maxStretchM)).toBe(805);
    expect(COMFORT_RULES.maxFlaggedShare).toBe(0.1);
  });
});

describe('legacy traffic_tolerance mapping', () => {
  it('low/medium/high → 2/3/4 (spec §5.4)', () => {
    expect(comfortLevelFromTolerance('low')).toBe(2);
    expect(comfortLevelFromTolerance('medium')).toBe(3);
    expect(comfortLevelFromTolerance('high')).toBe(4);
    expect(comfortLevelFromTolerance(null)).toBe(2);
  });

  it('1–2→low, 3→medium, 4–5→high for three-setting routers', () => {
    expect(COMFORT_LEVELS.map(toleranceForComfortLevel)).toEqual(['low', 'low', 'medium', 'high', 'high']);
  });

  it('coerces stored values', () => {
    expect(toComfortLevel(3)).toBe(3);
    expect(toComfortLevel('4')).toBe(4);
    expect(toComfortLevel('high')).toBe(4);
    expect(toComfortLevel(9)).toBe(2);
    expect(toComfortLevel(undefined, 3)).toBe(3);
  });
});
