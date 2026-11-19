import { describe, it, expect } from 'vitest';
import {
  combinePowerCurves,
  formatRangeKm,
  roundRangeKm,
  sliceCoordsByKm,
  sliceGeometryByKm,
} from './visualData';

// 0.001° latitude ≈ 0.111 km per step.
const coords: Array<[number, number]> = Array.from({ length: 11 }, (_, i) => [-105, 40 + i * 0.001]);

describe('sliceCoordsByKm', () => {
  it('returns the whole track without a range', () => {
    expect(sliceCoordsByKm(coords, null)).toHaveLength(11);
  });
  it('keeps only points inside the range', () => {
    const sliced = sliceCoordsByKm(coords, [0.2, 0.6]);
    expect(sliced[0]).toEqual(coords[2]);
    expect(sliced[sliced.length - 1]).toEqual(coords[5]);
  });
});

describe('sliceGeometryByKm', () => {
  it('slices a MultiLineString into one LineString', () => {
    const geom: GeoJSON.MultiLineString = {
      type: 'MultiLineString',
      coordinates: [coords.slice(0, 6), coords.slice(6)],
    };
    const out = sliceGeometryByKm(geom, [0.4, 0.9]);
    expect(out?.type).toBe('LineString');
  });
  it('falls back to the full geometry when the range is past the end', () => {
    const geom: GeoJSON.LineString = { type: 'LineString', coordinates: coords };
    expect(sliceGeometryByKm(geom, [50, 60])).toBe(geom);
  });
});

describe('combinePowerCurves', () => {
  it('keeps the best value per duration and skips junk', () => {
    expect(
      combinePowerCurves([
        { '5s': 800, '60s': 400 },
        { '5s': 900, '60s': null, '300s': 300 },
        null,
        { '60s': Number.NaN },
      ]),
    ).toEqual({ '5s': 900, '60s': 400, '300s': 300 });
  });
});

describe('labels', () => {
  it('formats km and miles', () => {
    expect(formatRangeKm([1.6, 3.2])).toBe('1.6–3.2 km');
    expect(formatRangeKm([1.609344, 3.218688], true)).toBe('1.0–2.0 mi');
  });
  it('orders and rounds a dragged range', () => {
    expect(roundRangeKm(5.26, 2.14)).toEqual([2.1, 5.3]);
  });
});
