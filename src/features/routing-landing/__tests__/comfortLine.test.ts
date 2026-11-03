import { describe, it, expect } from 'vitest';
import type { Coordinate } from '../../../types/geo';
import { toneFeatures, lineBounds } from '../comfortLine';

const coords: Coordinate[] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]];
const seg = (tone: string) => ({ tone }) as never;

describe('toneFeatures', () => {
  it('joins same-tone segments and shares end points between runs', () => {
    const fc = toneFeatures(coords, { segments: [seg('within'), seg('within'), seg('flagged'), seg('unknown')] });
    expect(fc.features.map((f) => f.properties.tone)).toEqual(['within', 'flagged', 'unknown']);
    expect(fc.features[0].geometry.coordinates).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(fc.features[1].geometry.coordinates).toEqual([[0, 2], [0, 3]]);
    expect(fc.features[2].geometry.coordinates).toEqual([[0, 3], [0, 4]]);
  });

  it('one tone is one line', () => {
    const fc = toneFeatures(coords, { segments: [seg('at'), seg('at'), seg('at'), seg('at')] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(5);
  });

  it('empty route, no features', () => {
    expect(toneFeatures([], { segments: [] }).features).toEqual([]);
  });
});

describe('lineBounds', () => {
  it('boxes the line', () => {
    expect(lineBounds([[-105, 40], [-104, 41], [-105.5, 39.5]])).toEqual([-105.5, 39.5, -104, 41]);
    expect(lineBounds([])).toBeNull();
  });
});
