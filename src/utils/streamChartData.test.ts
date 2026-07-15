import { describe, it, expect } from 'vitest';
import {
  buildStreamRows,
  cumulativeDistancesKm,
  downsampleRows,
  formatElapsed,
  lttbIndices,
  niceTicks,
  rollingAverage,
  smoothRows,
  smoothingWindowForCount,
} from './streamChartData';
import type { StreamRow } from './streamChartData';

const makeRow = (x: number, power: number | null): StreamRow => ({
  x,
  power,
  heartRate: null,
  speed_kmh: null,
  cadence: null,
  elevation_m: null,
});

describe('cumulativeDistancesKm', () => {
  it('starts at 0 and accumulates ~111 km per degree of latitude', () => {
    const distances_km = cumulativeDistancesKm([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(distances_km[0]).toBe(0);
    expect(distances_km[1]).toBeGreaterThan(110);
    expect(distances_km[1]).toBeLessThan(112);
    expect(distances_km[2]).toBeCloseTo(distances_km[1] * 2, 1);
  });

  it('is monotonically non-decreasing', () => {
    const distances_km = cumulativeDistancesKm([
      [-105.5, 39.9],
      [-105.51, 39.91],
      [-105.51, 39.91], // repeated point
      [-105.52, 39.9],
    ]);
    for (let i = 1; i < distances_km.length; i++) {
      expect(distances_km[i]).toBeGreaterThanOrEqual(distances_km[i - 1]);
    }
  });

  it('handles empty input', () => {
    expect(cumulativeDistancesKm([])).toEqual([]);
  });
});

describe('rollingAverage', () => {
  it('is identity for window 1', () => {
    expect(rollingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('coerces even windows to odd', () => {
    // window 4 → 5 (centered, ±2)
    expect(rollingAverage([0, 0, 10, 0, 0], 4)[2]).toBe(2);
  });

  it('averages a centered window', () => {
    expect(rollingAverage([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  it('excludes nulls from the window instead of zero-filling', () => {
    const out = rollingAverage([200, null, 200, null, 200], 3);
    expect(out[0]).toBe(200);
    expect(out[2]).toBe(200);
    expect(out[4]).toBe(200);
  });

  it('keeps null source values null', () => {
    expect(rollingAverage([100, null, 100], 3)[1]).toBeNull();
  });

  it('handles all-null input', () => {
    expect(rollingAverage([null, null], 3)).toEqual([null, null]);
  });
});

describe('smoothingWindowForCount', () => {
  it('returns 1 (no-op) for already-sparse data', () => {
    expect(smoothingWindowForCount(300)).toBe(1);
    expect(smoothingWindowForCount(0)).toBe(1);
  });

  it('grows with point count and is always odd', () => {
    const w5000 = smoothingWindowForCount(5000);
    const w1000 = smoothingWindowForCount(1000);
    expect(w5000).toBeGreaterThan(w1000);
    expect(w5000 % 2).toBe(1);
    expect(w1000 % 2).toBe(1);
  });

  it('is clamped to 31', () => {
    expect(smoothingWindowForCount(1_000_000)).toBe(31);
  });
});

describe('lttbIndices', () => {
  it('returns all indices when threshold >= length', () => {
    expect(lttbIndices([0, 1, 2], [1, 2, 3], 5)).toEqual([0, 1, 2]);
  });

  it('returns exactly threshold indices, sorted, including first and last', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    const ys = xs.map((x) => Math.sin(x / 10) * 100);
    const indices = lttbIndices(xs, ys, 20);
    expect(indices).toHaveLength(20);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(99);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it('preserves a single power spike in a flat series (regression vs stride decimation)', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const ys = xs.map(() => 200 as number | null);
    ys[537] = 1000; // sprint spike that stride sampling would skip
    const indices = lttbIndices(xs, ys as Array<number | null>, 50);
    expect(indices).toContain(537);
  });

  it('is null-safe: skips nulls without NaN-poisoning and never returns NaN indices', () => {
    const xs = Array.from({ length: 200 }, (_, i) => i);
    const ys: Array<number | null> = xs.map((x) => (x % 7 === 0 ? null : 150));
    ys[99] = 800;
    const indices = lttbIndices(xs, ys, 30);
    expect(indices.every((i) => Number.isInteger(i) && i >= 0 && i < 200)).toBe(true);
    expect(indices).toContain(99);
  });

  it('handles an entirely-null series', () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const ys: Array<number | null> = xs.map(() => null);
    const indices = lttbIndices(xs, ys, 10);
    expect(indices).toHaveLength(10);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(49);
  });
});

describe('downsampleRows', () => {
  it('passes through when under the target', () => {
    const rows = [makeRow(0, 100), makeRow(1, 110)];
    expect(downsampleRows(rows, 400)).toBe(rows);
  });

  it('keeps parallel series aligned — the spike row carries its original companions', () => {
    const rows: StreamRow[] = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      power: i === 400 ? 950 : 210,
      heartRate: i === 400 ? 188 : 140,
      speed_kmh: 30,
      cadence: 90,
      elevation_m: 1600 + i,
    }));
    const out = downsampleRows(rows, 60);
    const spike = out.find((r) => r.power === 950);
    expect(spike).toBeDefined();
    expect(spike!.heartRate).toBe(188);
    expect(spike!.elevation_m).toBe(2000);
  });

  it('falls back to heart rate as primary when power is absent', () => {
    const rows: StreamRow[] = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      power: null,
      heartRate: i === 250 ? 195 : 130,
      speed_kmh: null,
      cadence: null,
      elevation_m: null,
    }));
    const out = downsampleRows(rows, 50);
    expect(out.some((r) => r.heartRate === 195)).toBe(true);
  });
});

describe('smoothRows', () => {
  it('smooths only the requested keys', () => {
    const rows: StreamRow[] = [
      { x: 0, power: 100, heartRate: 100, speed_kmh: 10, cadence: 80, elevation_m: 5 },
      { x: 1, power: 400, heartRate: 160, speed_kmh: 40, cadence: 110, elevation_m: 6 },
      { x: 2, power: 100, heartRate: 100, speed_kmh: 10, cadence: 80, elevation_m: 7 },
    ];
    const out = smoothRows(rows, ['power', 'heartRate'], 3);
    expect(out[1].power).toBe(200);
    expect(out[1].heartRate).toBe(120);
    expect(out[1].speed_kmh).toBe(40); // untouched
    expect(out[1].elevation_m).toBe(6); // untouched
  });

  it('is a no-op for window 1', () => {
    const rows = [makeRow(0, 100), makeRow(1, 500)];
    expect(smoothRows(rows, ['power'], 1)).toBe(rows);
  });
});

describe('niceTicks', () => {
  it('uses a step of 10 for a ~90 km ride', () => {
    expect(niceTicks(0, 87, 10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it('uses a step of 5 for a 30 km ride', () => {
    expect(niceTicks(0, 30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });

  it('produces sub-km steps for a zoomed span', () => {
    const ticks = niceTicks(12.4, 15.1);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks[0]).toBeGreaterThanOrEqual(12.4);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(15.1);
    expect(ticks[1] - ticks[0]).toBeLessThan(1);
  });

  it('never exceeds maxTickCount', () => {
    for (const [min, max, count] of [
      [0, 87, 10],
      [0, 30, 8],
      [3.2, 3.9, 6],
      [0, 12345, 8],
    ] as Array<[number, number, number]>) {
      expect(niceTicks(min, max, count).length).toBeLessThanOrEqual(count + 1);
    }
  });

  it('handles degenerate ranges', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe('buildStreamRows', () => {
  it('uses distance mode when coords are present', () => {
    const { rows, xMode } = buildStreamRows({
      coords: [
        [0, 0],
        [0, 0.01],
      ],
      power: [200, 210],
    });
    expect(xMode).toBe('distance_km');
    expect(rows[0].x).toBe(0);
    expect(rows[1].x).toBeCloseTo(1.11, 1);
  });

  it('uses time mode when coords are absent but a duration is known', () => {
    const { rows, xMode } = buildStreamRows(
      { power: [200, 210, 220, 230, 240] },
      { durationSeconds: 3600 }
    );
    expect(xMode).toBe('time_s');
    expect(rows[0].x).toBe(0);
    expect(rows[rows.length - 1].x).toBe(3600);
  });

  it('falls back to index mode', () => {
    const { rows, xMode } = buildStreamRows({ heartRate: [130, 140, 150] });
    expect(xMode).toBe('index');
    expect(rows.map((r) => r.x)).toEqual([0, 1, 2]);
  });

  it('converts speed from m/s to km/h', () => {
    const { rows } = buildStreamRows({ speed: [10] }, { durationSeconds: 60 });
    expect(rows[0].speed_kmh).toBeCloseTo(36, 5);
  });

  it('null-filters FIT sentinel values', () => {
    const { rows } = buildStreamRows({
      power: [65535, 250],
      heartRate: [255, 150],
      speed: [50, 10],
      cadence: [255, 90],
    });
    expect(rows[0].power).toBeNull();
    expect(rows[0].heartRate).toBeNull();
    expect(rows[0].speed_kmh).toBeNull();
    expect(rows[0].cadence).toBeNull();
    expect(rows[1].power).toBe(250);
  });

  it('handles missing streams', () => {
    expect(buildStreamRows(null).rows).toEqual([]);
    expect(buildStreamRows({}).rows).toEqual([]);
  });
});

describe('formatElapsed', () => {
  it('formats minutes and seconds', () => {
    expect(formatElapsed(130)).toBe('2:10');
  });

  it('formats hours', () => {
    expect(formatElapsed(5025)).toBe('1:23:45');
  });

  it('clamps negatives to zero', () => {
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
