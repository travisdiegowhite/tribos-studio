/**
 * Pure-geometry tests for the activity-chart model layer: x-axis derivation,
 * scales/window math, per-column aggregation, zone band rects, crosshair.
 */

import { describe, it, expect } from 'vitest';
import { xAxisFor, hasTimeAxis, seriesFor, type NormalizedStreams } from './streamTypes';
import {
  scaleValue,
  invertScale,
  windowIndices,
  windowMax,
  yDomainMax,
  xAxisTicks,
  formatXTick,
} from './chartScales';
import { aggregateColumns } from './columnAggregate';
import { zoneBandRects } from './zoneBands';
import { nearestIndex } from './crosshair';
import { zonesFromFtp } from '../../../utils/powerZones';

const perSecond: NormalizedStreams = {
  version: 1,
  tier: 'per_second',
  source: 'fit_storage',
  sample_seconds: 1,
  t: [0, 1, 2, 3, 63],
  power: [100, 200, null, 300, 250],
};

const simplified: NormalizedStreams = {
  version: 1,
  tier: 'simplified',
  source: 'activity_streams',
  sample_seconds: null,
  power: [100, 200, 300],
  distance_m: [0, 500, null],
  coords: [
    [-105.3, 40.0],
    [-105.29, 40.0],
    [-105.28, 40.0],
  ],
};

describe('xAxisFor', () => {
  it('uses the real time axis when present', () => {
    const axis = xAxisFor(perSecond)!;
    expect(axis.xMode).toBe('time_s');
    expect(axis.xs).toEqual([0, 1, 2, 3, 63]);
    expect(hasTimeAxis(perSecond)).toBe(true);
  });

  it('uses distance_m (km, forward-filling nulls) for the simplified tier', () => {
    const axis = xAxisFor(simplified)!;
    expect(axis.xMode).toBe('distance_km');
    expect(axis.xs[0]).toBe(0);
    expect(axis.xs[1]).toBe(0.5);
    expect(axis.xs[2]).toBe(0.5); // null forward-filled, never a fake clock
  });

  it('falls back to cumulative haversine over coords', () => {
    const { distance_m: _unused, ...noDistance } = simplified;
    const axis = xAxisFor(noDistance)!;
    expect(axis.xMode).toBe('distance_km');
    expect(axis.xs[2]).toBeGreaterThan(axis.xs[1]);
  });

  it('returns null when nothing can form an axis', () => {
    expect(xAxisFor({ version: 1, tier: 'summary', source: 'none', sample_seconds: null })).toBeNull();
  });
});

describe('seriesFor', () => {
  it('returns arrays with data and null otherwise', () => {
    expect(seriesFor(perSecond, 'power')).toHaveLength(5);
    expect(seriesFor(perSecond, 'hr')).toBeNull();
  });
});

describe('scales and windows', () => {
  const scale = { domainMin: 0, domainMax: 100, rangeMin: 0, rangeMax: 800 };

  it('scaleValue/invertScale round-trip', () => {
    expect(scaleValue(50, scale)).toBe(400);
    expect(invertScale(400, scale)).toBe(50);
    expect(invertScale(scaleValue(37.5, scale), scale)).toBeCloseTo(37.5);
  });

  it('windowIndices finds the inclusive index range by binary search', () => {
    const xs = [0, 10, 20, 30, 40, 50];
    expect(windowIndices(xs, 10, 40)).toEqual([1, 4]);
    expect(windowIndices(xs, 11, 39)).toEqual([2, 3]);
    expect(windowIndices(xs, -5, 500)).toEqual([0, 5]);
    expect(windowIndices(xs, 60, 70)).toBeNull();
    expect(windowIndices(xs, 12, 13)).toBeNull(); // between samples
  });

  it('windowMax skips nulls', () => {
    expect(windowMax([1, null, 5, 3], 0, 3)).toBe(5);
    expect(windowMax([null, null], 0, 1)).toBeNull();
  });

  it('yDomainMax pads and rounds to clean steps', () => {
    expect(yDomainMax(286)).toBe(300);
    expect(yDomainMax(950)).toBe(1000);
    expect(yDomainMax(null)).toBe(1);
  });

  it('xAxisTicks stay inside the window and format per mode', () => {
    const ticks = xAxisTicks(0, 3600, 'time_s');
    expect(ticks.every((t) => t.value >= 0 && t.value <= 3600)).toBe(true);
    expect(ticks.some((t) => t.label.includes(':'))).toBe(true);
    expect(formatXTick(12.34, 'distance_km')).toBe('12.3');
  });
});

describe('aggregateColumns', () => {
  it('keeps per-column max (peak-preserving) and mean', () => {
    const xs = [0, 1, 2, 3];
    const values = [100, 900, 200, 300];
    const { maxs, means, mins } = aggregateColumns(xs, values, 0, 3, 0, 4, 2);
    expect(maxs).toEqual([900, 300]);
    expect(mins).toEqual([100, 200]);
    expect(means).toEqual([500, 250]);
  });

  it('leaves all-null columns null (dropout gaps stay visible)', () => {
    const xs = [0, 1, 2, 3];
    const values = [100, null, null, 300];
    const { maxs } = aggregateColumns(xs, values, 0, 3, 0, 4, 4);
    expect(maxs).toEqual([100, null, null, 300]);
  });

  it('clamps out-of-window samples into edge columns', () => {
    const xs = [0, 5, 10];
    const values = [1, 2, 3];
    const { maxs } = aggregateColumns(xs, values, 0, 2, 0, 10, 2);
    expect(maxs[1]).toBe(3); // x=10 lands in the last column, not out of range
  });
});

describe('zoneBandRects', () => {
  const zones = zonesFromFtp(200)!; // bounds 0/110/150/180/210/240/300

  it('produces seam-free bottom-up rects clipped to the y-domain', () => {
    const rects = zoneBandRects(zones, 300, 300);
    expect(rects[0].zoneIndex).toBe(0);
    expect(rects[0].yBottomPx).toBe(300); // z1 starts at the baseline
    expect(rects[0].yTopPx).toBe(300 - 110);
    // adjacent rects share edges exactly
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].yBottomPx).toBeCloseTo(rects[i - 1].yTopPx);
    }
    // top band reaches the plot top
    expect(rects[rects.length - 1].yTopPx).toBe(0);
  });

  it('drops bands above the visible max (easy ride: no red band)', () => {
    const rects = zoneBandRects(zones, 160, 300); // max power 160W → z1..z3 only
    expect(rects).toHaveLength(3);
    expect(rects[2].yTopPx).toBe(0);
  });

  it('handles degenerate inputs', () => {
    expect(zoneBandRects(zones, 0, 300)).toEqual([]);
    expect(zoneBandRects(zones, 300, 0)).toEqual([]);
  });
});

describe('nearestIndex', () => {
  const xs = [0, 10, 20, 30];

  it('snaps to the closest sample', () => {
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 35)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
