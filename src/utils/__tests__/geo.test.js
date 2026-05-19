import { describe, expect, it } from 'vitest';

import { computeBboxAround, computeDirectionalBias } from '../geo';

describe('computeBboxAround', () => {
  it('produces a bbox centered on the input coordinate', () => {
    const bbox = computeBboxAround([-105.0, 40.0], 10);
    const midLat = (bbox.minLat + bbox.maxLat) / 2;
    const midLng = (bbox.minLng + bbox.maxLng) / 2;
    expect(midLat).toBeCloseTo(40.0, 6);
    expect(midLng).toBeCloseTo(-105.0, 6);
  });

  it('lat span is roughly 2 * radiusKm / 111', () => {
    const bbox = computeBboxAround([-105.0, 40.0], 10);
    const latSpan = bbox.maxLat - bbox.minLat;
    // ~0.18 degrees for 10km radius (20km diameter)
    expect(latSpan).toBeCloseTo((10 * 2) / 111, 3);
  });

  it('lng span widens at higher latitudes (cos compensation)', () => {
    const equator = computeBboxAround([0, 0], 10);
    const high = computeBboxAround([0, 60], 10);
    const equatorLngSpan = equator.maxLng - equator.minLng;
    const highLngSpan = high.maxLng - high.minLng;
    // cos(60°) = 0.5, so the lng span at 60° should be ~2× the equator span
    expect(highLngSpan / equatorLngSpan).toBeCloseTo(2, 1);
  });

  it('handles negative latitudes', () => {
    const bbox = computeBboxAround([-105.0, -40.0], 5);
    expect(bbox.minLat).toBeLessThan(-40);
    expect(bbox.maxLat).toBeGreaterThan(-40);
  });
});

describe('computeDirectionalBias', () => {
  // All segments below are anchored to start [0, 0] so the math is easy
  // to verify. Each "segment" has start/end lat/lng one degree apart in
  // the named direction.
  const start = [0, 0];

  it('returns all zeros for empty segments', () => {
    expect(computeDirectionalBias([], start)).toEqual({
      east: 0, west: 0, north: 0, south: 0,
    });
  });

  it('shares sum to ~1.0 for a single segment', () => {
    const segs = [{ start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0 }];
    const bias = computeDirectionalBias(segs, start);
    const total = bias.east + bias.west + bias.north + bias.south;
    expect(total).toBeCloseTo(1.0, 1);
    expect(bias.east).toBeCloseTo(1.0, 1);
  });

  it('buckets eastern segments to east', () => {
    const segs = [
      { start_lat: 0, start_lng: 0.1, end_lat: 0, end_lng: 0.5 },
      { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0 },
    ];
    const bias = computeDirectionalBias(segs, start);
    expect(bias.east).toBeGreaterThan(0.9);
  });

  it('buckets segments by larger axis (east-west vs north-south)', () => {
    const segs = [
      // Strongly eastern midpoint (|dLng|=1.0, |dLat|=0.1)
      { start_lat: 0.05, start_lng: 0.9, end_lat: 0.15, end_lng: 1.1 },
      // Strongly northern midpoint (|dLng|=0.1, |dLat|=1.0)
      { start_lat: 0.9, start_lng: 0.05, end_lat: 1.1, end_lng: 0.15 },
    ];
    const bias = computeDirectionalBias(segs, start);
    expect(bias.east).toBeGreaterThan(0);
    expect(bias.north).toBeGreaterThan(0);
    expect(bias.south).toBe(0);
    expect(bias.west).toBe(0);
  });

  it('splits mileage across four cardinal directions roughly evenly', () => {
    const segs = [
      // East segment, midpoint (0, 1)
      { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.5 },
      // West segment, midpoint (0, -1)
      { start_lat: 0, start_lng: -1.5, end_lat: 0, end_lng: -0.5 },
      // North segment, midpoint (1, 0)
      { start_lat: 0.5, start_lng: 0, end_lat: 1.5, end_lng: 0 },
      // South segment, midpoint (-1, 0)
      { start_lat: -1.5, start_lng: 0, end_lat: -0.5, end_lng: 0 },
    ];
    const bias = computeDirectionalBias(segs, start);
    // All four have ~same haversine length, so each should be ~0.25.
    // Latitude segments are slightly longer at the equator boundary,
    // so allow modest tolerance.
    expect(bias.east).toBeCloseTo(0.25, 1);
    expect(bias.west).toBeCloseTo(0.25, 1);
    expect(bias.north).toBeCloseTo(0.25, 1);
    expect(bias.south).toBeCloseTo(0.25, 1);
  });

  it('skips segments with non-finite coordinates', () => {
    const segs = [
      { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0 },
      { start_lat: null, start_lng: 'x', end_lat: undefined, end_lng: NaN },
    ];
    const bias = computeDirectionalBias(segs, start);
    expect(bias.east).toBeCloseTo(1.0, 1);
  });

  describe('recency weighting', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    it('with recencyWeight=0, recent and old segments contribute equally', () => {
      const segs = [
        // East: ridden today
        { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0,
          last_ridden_at: new Date(now).toISOString() },
        // West: ridden 90 days ago (within decay window)
        { start_lat: 0, start_lng: -1.0, end_lat: 0, end_lng: -0.5,
          last_ridden_at: new Date(now - 90 * dayMs).toISOString() },
      ];
      const bias = computeDirectionalBias(segs, start, 0, 180);
      expect(bias.east).toBeCloseTo(0.5, 1);
      expect(bias.west).toBeCloseTo(0.5, 1);
    });

    it('with recencyWeight=100, today-ridden segments dominate', () => {
      const segs = [
        // East: ridden today (multiplier ≈ 2.0)
        { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0,
          last_ridden_at: new Date(now).toISOString() },
        // West: ridden at the decay cutoff (multiplier ≈ 1.0)
        { start_lat: 0, start_lng: -1.0, end_lat: 0, end_lng: -0.5,
          last_ridden_at: new Date(now - 180 * dayMs).toISOString() },
      ];
      const bias = computeDirectionalBias(segs, start, 100, 180);
      // East should weigh roughly 2× as much as west
      expect(bias.east).toBeGreaterThan(bias.west);
      expect(bias.east / bias.west).toBeGreaterThan(1.5);
    });

    it('missing last_ridden_at gets the neutral (1.0) multiplier', () => {
      const segs = [
        { start_lat: 0, start_lng: 0.5, end_lat: 0, end_lng: 1.0 },
        { start_lat: 0, start_lng: -1.0, end_lat: 0, end_lng: -0.5 },
      ];
      const bias = computeDirectionalBias(segs, start, 100, 180);
      expect(bias.east).toBeCloseTo(0.5, 1);
      expect(bias.west).toBeCloseTo(0.5, 1);
    });
  });
});
