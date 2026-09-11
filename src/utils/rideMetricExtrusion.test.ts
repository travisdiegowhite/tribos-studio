import { describe, it, expect } from 'vitest';
import {
  buildExtrusionCollection,
  extentMeters,
  extrusionScaleForCoords,
  heightForNorm,
  segmentQuad,
  EXTRUSION_HEIGHT_CLAMP_M,
  EXTRUSION_WIDTH_CLAMP_M,
  type LngLat,
} from './rideMetricExtrusion';

const boulder: LngLat = [-105.27, 40.015];

describe('extentMeters', () => {
  it('measures the longer bounding-box side', () => {
    // 0.1° of latitude ≈ 11.1 km; the longitude span is shorter at 40°N
    const m = extentMeters([[-105.3, 40.0], [-105.2, 40.1]]);
    expect(m).toBeGreaterThan(11_000);
    expect(m).toBeLessThan(11_200);
  });

  it('is zero for fewer than two points', () => {
    expect(extentMeters([])).toBe(0);
    expect(extentMeters([boulder])).toBe(0);
  });
});

describe('extrusionScaleForCoords', () => {
  it('scales with the ride and stays inside the clamps', () => {
    const small = extrusionScaleForCoords([[-105.3, 40.0], [-105.29, 40.01]]);
    const big = extrusionScaleForCoords([[-105.3, 40.0], [-104.0, 41.0]]);
    expect(small.widthM).toBe(EXTRUSION_WIDTH_CLAMP_M[0]);
    expect(small.maxHeightM).toBe(EXTRUSION_HEIGHT_CLAMP_M[0]);
    expect(big.widthM).toBe(EXTRUSION_WIDTH_CLAMP_M[1]);
    expect(big.maxHeightM).toBe(EXTRUSION_HEIGHT_CLAMP_M[1]);
    // An 11 km-tall ride lands between the clamps (≈ 278 m walls)
    const mid = extrusionScaleForCoords([[-105.3, 40.0], [-105.25, 40.1]]);
    expect(mid.maxHeightM).toBeGreaterThan(EXTRUSION_HEIGHT_CLAMP_M[0]);
    expect(mid.maxHeightM).toBeLessThan(EXTRUSION_HEIGHT_CLAMP_M[1]);
    expect(mid.minHeightM).toBeGreaterThan(0);
    expect(mid.minHeightM).toBeLessThan(mid.maxHeightM);
  });
});

describe('heightForNorm', () => {
  const scale = { widthM: 10, minHeightM: 5, maxHeightM: 205 };
  it('maps 0–1 onto the floor–ceiling range and clamps outside it', () => {
    expect(heightForNorm(0, scale)).toBe(5);
    expect(heightForNorm(1, scale)).toBe(205);
    expect(heightForNorm(0.5, scale)).toBe(105);
    expect(heightForNorm(2, scale)).toBe(205);
    expect(heightForNorm(-1, scale)).toBe(5);
  });
  it('gives a null reading the floor so the ribbon stays continuous', () => {
    expect(heightForNorm(null, scale)).toBe(5);
    expect(heightForNorm(NaN, scale)).toBe(5);
  });
});

describe('segmentQuad', () => {
  it('produces a closed rectangle of the requested width across the track', () => {
    const a: LngLat = [-105.27, 40.0];
    const b: LngLat = [-105.27, 40.001]; // due north, ~111 m
    const ring = segmentQuad(a, b, 20);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    // Width is measured in longitude at this latitude: 20 m ≈ 0.000234°
    const lngs = ring.slice(0, 4).map((p) => p[0]);
    const spanDeg = Math.max(...lngs) - Math.min(...lngs);
    const spanM = spanDeg * 111_320 * Math.cos((40.0005 * Math.PI) / 180);
    expect(spanM).toBeCloseTo(20, 0);
    // The rectangle overlaps past both endpoints along the track
    const lats = ring.slice(0, 4).map((p) => p[1]);
    expect(Math.min(...lats)).toBeLessThan(a[1]);
    expect(Math.max(...lats)).toBeGreaterThan(b[1]);
  });

  it('handles a zero-length segment without NaNs', () => {
    const ring = segmentQuad(boulder, boulder, 10);
    expect(ring).toHaveLength(5);
    for (const [lng, lat] of ring) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });
});

describe('buildExtrusionCollection', () => {
  it('emits one polygon per segment carrying height and color', () => {
    const scale = { widthM: 10, minHeightM: 3, maxHeightM: 103 };
    const fc = buildExtrusionCollection(
      [
        { coordinates: [[-105.27, 40.0], [-105.27, 40.001]], norm: 0.5, color: '#D4600A' },
        { coordinates: [[-105.27, 40.001], [-105.27, 40.002]], norm: null, color: '#666666' },
      ],
      scale,
    );
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ height: 53, color: '#D4600A', norm: 0.5 });
    expect(fc.features[1].properties.height).toBe(3);
    expect(fc.features[0].geometry.type).toBe('Polygon');
    expect(fc.features[0].geometry.coordinates[0]).toHaveLength(5);
  });
});
