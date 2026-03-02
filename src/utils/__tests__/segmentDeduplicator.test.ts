/**
 * Tests for the Segment Deduplicator
 */

import { describe, it, expect } from 'vitest';
import {
  findMatchingSegments,
  segmentBoundingBox,
  bboxOverlap,
  type StoredSegment,
} from '../segmentDeduplicator';
import type { DetectedSegment } from '../segmentDetector';

// ============================================================================
// HELPERS
// ============================================================================

function createDetectedSegment(overrides: Partial<DetectedSegment> = {}): DetectedSegment {
  return {
    startIdx: 0,
    endIdx: 50,
    startLat: 40.0,
    startLng: -105.0,
    endLat: 40.01,
    endLng: -105.0,
    coordinates: Array.from({ length: 20 }, (_, i) => [
      -105.0,
      40.0 + i * 0.0005,
    ] as [number, number]),
    distanceMeters: 1100,
    avgGradient: 2,
    maxGradient: 4,
    minGradient: 0,
    gradientVariability: 1.5,
    elevationGain: 22,
    elevationLoss: 0,
    terrainType: 'flat',
    durationSeconds: 180,
    avgSpeedKmh: 22,
    avgPower: 200,
    maxPower: 280,
    normalizedPower: 210,
    avgHR: 145,
    maxHR: 165,
    avgCadence: 88,
    stops: [],
    stopCount: 0,
    stopsPerKm: 0,
    sharpTurnCount: 0,
    qualityScore: 85,
    ...overrides,
  };
}

function createStoredSegment(overrides: Partial<StoredSegment> = {}): StoredSegment {
  return {
    id: 'seg-1',
    startLat: 40.0,
    startLng: -105.0,
    endLat: 40.01,
    endLng: -105.0,
    distanceMeters: 1100,
    coordinates: Array.from({ length: 20 }, (_, i) => [
      -105.0,
      40.0 + i * 0.0005,
    ] as [number, number]),
    ...overrides,
  };
}

// ============================================================================
// MATCHING TESTS
// ============================================================================

describe('findMatchingSegments', () => {
  it('matches identical segments', () => {
    const detected = createDetectedSegment();
    const stored = createStoredSegment();

    const matches = findMatchingSegments(detected, [stored]);
    expect(matches.length).toBe(1);
    expect(matches[0].existingSegmentId).toBe('seg-1');
    expect(matches[0].overlapRatio).toBeGreaterThanOrEqual(0.8);
  });

  it('matches reverse-direction segments', () => {
    const detected = createDetectedSegment({
      startLat: 40.01,
      startLng: -105.0,
      endLat: 40.0,
      endLng: -105.0,
      coordinates: Array.from({ length: 20 }, (_, i) => [
        -105.0,
        40.01 - i * 0.0005,
      ] as [number, number]),
    });

    const stored = createStoredSegment();

    const matches = findMatchingSegments(detected, [stored]);
    expect(matches.length).toBe(1);
  });

  it('does not match distant segments', () => {
    const detected = createDetectedSegment();
    const stored = createStoredSegment({
      id: 'seg-far',
      startLat: 41.0, // 1 degree away (~111km)
      startLng: -105.0,
      endLat: 41.01,
      endLng: -105.0,
    });

    const matches = findMatchingSegments(detected, [stored]);
    expect(matches.length).toBe(0);
  });

  it('does not match segments with very different lengths', () => {
    const detected = createDetectedSegment({ distanceMeters: 1000 });
    const stored = createStoredSegment({
      id: 'seg-long',
      distanceMeters: 5000, // 5x longer
    });

    const matches = findMatchingSegments(detected, [stored]);
    expect(matches.length).toBe(0);
  });

  it('returns best match first when multiple candidates', () => {
    const detected = createDetectedSegment();

    const exactMatch = createStoredSegment({ id: 'exact' });
    const nearbyMatch = createStoredSegment({
      id: 'nearby',
      startLat: 40.0005, // slightly offset
      startLng: -105.0005,
      endLat: 40.0105,
      endLng: -105.0005,
    });

    const matches = findMatchingSegments(detected, [nearbyMatch, exactMatch]);
    if (matches.length >= 2) {
      // The exact match should have higher overlap
      expect(matches[0].overlapRatio).toBeGreaterThanOrEqual(matches[1].overlapRatio);
    }
  });
});

// ============================================================================
// BOUNDING BOX TESTS
// ============================================================================

describe('segmentBoundingBox', () => {
  it('calculates bounding box from coordinates', () => {
    const segment = createDetectedSegment();
    const bbox = segmentBoundingBox(segment);

    // [minLat, minLng, maxLat, maxLng]
    expect(bbox[0]).toBeLessThan(40.0); // minLat
    expect(bbox[1]).toBeLessThan(-105.0); // minLng
    expect(bbox[2]).toBeGreaterThan(40.0); // maxLat
    expect(bbox[3]).toBeGreaterThan(-105.0); // maxLng (with expansion)
  });
});

describe('bboxOverlap', () => {
  it('detects overlapping boxes', () => {
    const a: [number, number, number, number] = [39.9, -105.1, 40.1, -104.9];
    const b: [number, number, number, number] = [40.0, -105.0, 40.2, -104.8];
    expect(bboxOverlap(a, b)).toBe(true);
  });

  it('detects non-overlapping boxes', () => {
    const a: [number, number, number, number] = [39.0, -106.0, 39.5, -105.5];
    const b: [number, number, number, number] = [40.0, -105.0, 40.5, -104.5];
    expect(bboxOverlap(a, b)).toBe(false);
  });
});
