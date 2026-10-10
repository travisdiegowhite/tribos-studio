import { describe, it, expect } from 'vitest';
import {
  binEffort,
  gridSectorCount,
  lineBinCount,
  sectorBounds,
  sectorIndexAt,
  sectorMedians,
  sectorSpreads,
} from './repeatSectors';
import type { StreamRow } from './streamChartData';

const row = (x: number, power: number | null): StreamRow => ({
  x,
  power,
  heartRate: null,
  speed_kmh: null,
  cadence: null,
  elevation_m: null,
});

describe('sectorBounds', () => {
  it('splits the length into equal sectors ending exactly at the length', () => {
    const edges = sectorBounds(10, 4);
    expect(edges).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('clamps the counts for short and long anchors', () => {
    expect(gridSectorCount(2)).toBe(4);
    expect(gridSectorCount(30)).toBe(10);
    expect(gridSectorCount(200)).toBe(12);
    expect(lineBinCount(1)).toBe(8);
    expect(lineBinCount(200)).toBe(60);
  });

  it('puts the end of the anchor in the last sector', () => {
    const edges = sectorBounds(10, 4);
    expect(sectorIndexAt(edges, 0)).toBe(0);
    expect(sectorIndexAt(edges, 10)).toBe(3);
    expect(sectorIndexAt(edges, 5.1)).toBe(2);
  });
});

describe('binEffort', () => {
  it('leaves a sector blank when too few samples landed in it', () => {
    // Dense in sector 0, a single sample on the straight in sector 1.
    const rows = [row(0, 200), row(1, 210), row(2, 220), row(4, 400), row(5, 180)];
    const bins = binEffort(rows, 'power', sectorBounds(6, 2), 3);
    expect(bins[0].mean).not.toBeNull();
    expect(bins[0].n).toBe(3);
    expect(bins[1].mean).toBeNull();
    expect(bins[1].n).toBe(2);
  });

  it('weights samples by the road they represent', () => {
    // Three bend samples crammed at 0–0.1 km at 100 W, then two on the
    // straight at 300 W that speak for the rest of the sector.
    const rows = [row(0, 100), row(0.05, 100), row(0.1, 100), row(0.6, 300), row(1, 300)];
    const [bin] = binEffort(rows, 'power', sectorBounds(1, 1), 1);
    // A plain mean would be 180; the straight's samples pull it above 200.
    expect(bin.mean!).toBeGreaterThan(200);
  });

  it('ignores nulls and samples outside the anchor', () => {
    const rows = [row(-1, 999), row(0.5, 200), row(1, null), row(1.5, 200), row(3, 999)];
    const [bin] = binEffort(rows, 'power', sectorBounds(2, 1), 2);
    expect(bin).toEqual({ mean: 200, n: 2 });
  });

  it('copes with rows in descending x (a reverse-aligned effort)', () => {
    const rows = [row(2, 300), row(1.5, 300), row(1, 300), row(0.5, 100), row(0, 100)];
    const bins = binEffort(rows, 'power', sectorBounds(2, 2), 1);
    expect(bins[0].mean).toBeCloseTo(100);
    expect(bins[1].mean).toBeCloseTo(300);
  });
});

describe('sectorMedians / sectorSpreads', () => {
  it('takes the median and spread of the filled cells only', () => {
    const a = [{ mean: 100, n: 3 }, { mean: null, n: 0 }];
    const b = [{ mean: 200, n: 3 }, { mean: 150, n: 3 }];
    const c = [{ mean: 400, n: 3 }, { mean: null, n: 1 }];
    expect(sectorMedians([a, b, c])).toEqual([200, 150]);
    expect(sectorMedians([a, b])).toEqual([150, 150]);
    expect(sectorSpreads([a, b, c])).toEqual([300, 0]);
  });
});
