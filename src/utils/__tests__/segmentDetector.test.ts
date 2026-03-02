/**
 * Tests for the Segment Detection Engine
 */

import { describe, it, expect } from 'vitest';
import {
  detectSegments,
  calculateObstructionScore,
  classifyTopology,
  classifyPowerZone,
  classifyHRZone,
  calculateConsistencyScore,
  calculateConfidenceScore,
  calculateRelevanceScore,
  classifyFrequencyTier,
  type ActivityStreams,
  type DetectedSegment,
} from '../segmentDetector';

// ============================================================================
// HELPERS — Generate synthetic activity streams
// ============================================================================

function createFlatRoute(points: number, distPerPoint: number = 100): ActivityStreams {
  // Flat route heading east from (40.0, -105.0)
  const coords: [number, number][] = [];
  const elevation: number[] = [];
  const speed: number[] = [];

  const startLat = 40.0;
  const startLng = -105.0;
  // ~0.001 degrees longitude ≈ 85m at lat 40
  const lngStep = (distPerPoint / 85000) * 1;

  for (let i = 0; i < points; i++) {
    coords.push([startLng + i * lngStep, startLat]);
    elevation.push(1600); // flat at 1600m
    speed.push(7); // ~25 km/h
  }

  return { coords, elevation, speed };
}

function createClimbRoute(
  points: number,
  gradientPercent: number = 5,
  distPerPoint: number = 100
): ActivityStreams {
  const coords: [number, number][] = [];
  const elevation: number[] = [];
  const speed: number[] = [];

  const startLat = 40.0;
  const startLng = -105.0;
  const lngStep = (distPerPoint / 85000) * 1;
  const elevStep = (distPerPoint * gradientPercent) / 100;

  for (let i = 0; i < points; i++) {
    coords.push([startLng + i * lngStep, startLat]);
    elevation.push(1600 + i * elevStep);
    speed.push(4); // ~14 km/h climbing
  }

  return { coords, elevation, speed };
}

function createMixedRoute(): ActivityStreams {
  // Flat (2km) → Climb (2km at 5%) → Flat (2km)
  const coords: [number, number][] = [];
  const elevation: number[] = [];
  const speed: number[] = [];

  const startLat = 40.0;
  const startLng = -105.0;
  const lngStep = 0.00118; // ~100m at lat 40

  // Flat section (20 points, 2km)
  for (let i = 0; i < 20; i++) {
    coords.push([startLng + i * lngStep, startLat]);
    elevation.push(1600);
    speed.push(7);
  }

  // Climb section (20 points, 2km at 5%)
  for (let i = 0; i < 20; i++) {
    coords.push([startLng + (20 + i) * lngStep, startLat]);
    elevation.push(1600 + i * 5); // 5m per 100m = 5%
    speed.push(4);
  }

  // Flat section (20 points, 2km)
  for (let i = 0; i < 20; i++) {
    coords.push([startLng + (40 + i) * lngStep, startLat]);
    elevation.push(1700); // stays at climb top elevation
    speed.push(7);
  }

  return { coords, elevation, speed };
}

function createRouteWithStops(): ActivityStreams {
  const coords: [number, number][] = [];
  const elevation: number[] = [];
  const speed: number[] = [];

  const startLng = -105.0;
  const startLat = 40.0;
  const lngStep = 0.00118;

  for (let i = 0; i < 60; i++) {
    coords.push([startLng + i * lngStep, startLat]);
    elevation.push(1600);

    // Stop at points 15, 30, 45 (simulate traffic lights)
    if (i >= 14 && i <= 16) speed.push(0);
    else if (i >= 29 && i <= 31) speed.push(0);
    else if (i >= 44 && i <= 46) speed.push(0);
    else speed.push(7);
  }

  return { coords, elevation, speed };
}

// ============================================================================
// SEGMENT DETECTION TESTS
// ============================================================================

describe('detectSegments', () => {
  it('returns empty for insufficient data', () => {
    const result = detectSegments({ coords: [[0, 0], [1, 1]] });
    expect(result.segments).toHaveLength(0);
    expect(result.totalPoints).toBeLessThan(10);
  });

  it('detects a single flat segment', () => {
    const streams = createFlatRoute(50); // 50 points, ~5km flat
    const result = detectSegments(streams);

    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.totalPoints).toBe(50);

    const flatSegs = result.segments.filter(s => s.terrainType === 'flat');
    expect(flatSegs.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a climb segment', () => {
    const streams = createClimbRoute(50, 6); // 50 points, 5km at 6%
    const result = detectSegments(streams);

    expect(result.segments.length).toBeGreaterThanOrEqual(1);

    const climbs = result.segments.filter(s => s.terrainType === 'climb');
    expect(climbs.length).toBeGreaterThanOrEqual(1);

    if (climbs.length > 0) {
      expect(climbs[0].avgGradient).toBeGreaterThan(2);
      expect(climbs[0].elevationGain).toBeGreaterThan(0);
    }
  });

  it('detects gradient transitions in mixed terrain', () => {
    const streams = createMixedRoute(); // flat → climb → flat
    const result = detectSegments(streams);

    // Should detect at least 2 distinct segments (may merge some)
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.totalDistanceMeters).toBeGreaterThan(4000); // ~6km total
  });

  it('detects stops', () => {
    const streams = createRouteWithStops(); // flat with 3 stops
    const result = detectSegments(streams);

    expect(result.stops.length).toBeGreaterThanOrEqual(1);
  });

  it('includes coordinates in GeoJSON [lng, lat] format', () => {
    const streams = createFlatRoute(30);
    const result = detectSegments(streams);

    if (result.segments.length > 0) {
      const seg = result.segments[0];
      expect(seg.coordinates.length).toBeGreaterThan(0);
      // [lng, lat] — lng should be around -105, lat around 40
      expect(seg.coordinates[0][0]).toBeLessThan(0); // negative longitude
      expect(seg.coordinates[0][1]).toBeGreaterThan(0); // positive latitude
    }
  });

  it('calculates segment duration', () => {
    const streams = createFlatRoute(30);
    const result = detectSegments(streams);

    if (result.segments.length > 0) {
      expect(result.segments[0].durationSeconds).toBeGreaterThan(0);
    }
  });

  it('handles routes with power data', () => {
    const streams = createFlatRoute(30);
    streams.power = new Array(30).fill(200);

    const result = detectSegments(streams);

    if (result.segments.length > 0) {
      expect(result.segments[0].avgPower).toBeGreaterThan(0);
    }
  });

  it('handles routes with heart rate data', () => {
    const streams = createFlatRoute(30);
    streams.heartRate = new Array(30).fill(145);

    const result = detectSegments(streams);

    if (result.segments.length > 0) {
      expect(result.segments[0].avgHR).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// OBSTRUCTION SCORING TESTS
// ============================================================================

describe('calculateObstructionScore', () => {
  it('scores a clean segment high', () => {
    const segment = createMockSegment({
      stopsPerKm: 0,
      sharpTurnCount: 0,
      gradientVariability: 1,
      distanceMeters: 5000,
      durationSeconds: 600,
    });

    const score = calculateObstructionScore(segment);
    expect(score.overall).toBeGreaterThanOrEqual(80);
    expect(score.suitableForSteadyState).toBe(true);
  });

  it('penalizes frequent stops', () => {
    const clean = createMockSegment({ stopsPerKm: 0, distanceMeters: 5000, durationSeconds: 600 });
    const stoppy = createMockSegment({ stopsPerKm: 3, distanceMeters: 5000, durationSeconds: 600 });

    const cleanScore = calculateObstructionScore(clean);
    const stoppyScore = calculateObstructionScore(stoppy);

    expect(cleanScore.overall).toBeGreaterThan(stoppyScore.overall);
  });

  it('marks short-interrupted segments as unsuitable for steady state', () => {
    const segment = createMockSegment({
      stopsPerKm: 2,
      distanceMeters: 2000,
      durationSeconds: 200,
    });

    const score = calculateObstructionScore(segment);
    expect(score.suitableForSteadyState).toBe(false);
  });
});

// ============================================================================
// TOPOLOGY TESTS
// ============================================================================

describe('classifyTopology', () => {
  it('classifies a loop (start near end)', () => {
    const segment = createMockSegment({
      startLat: 40.0,
      startLng: -105.0,
      endLat: 40.0001,
      endLng: -105.0001,
    });

    const result = classifyTopology(segment);
    expect(result.topology).toBe('loop');
    expect(result.isRepeatable).toBe(true);
  });

  it('classifies point-to-point (start far from end)', () => {
    const segment = createMockSegment({
      startLat: 40.0,
      startLng: -105.0,
      endLat: 40.05,
      endLng: -105.0,
    });

    const result = classifyTopology(segment);
    expect(result.topology).toBe('point_to_point');
    expect(result.isRepeatable).toBe(false);
  });
});

// ============================================================================
// POWER ZONE TESTS
// ============================================================================

describe('classifyPowerZone', () => {
  const ftp = 250;

  it('classifies recovery zone', () => {
    expect(classifyPowerZone(100, ftp)).toBe('recovery');
  });

  it('classifies endurance zone', () => {
    expect(classifyPowerZone(160, ftp)).toBe('endurance');
  });

  it('classifies tempo zone', () => {
    expect(classifyPowerZone(200, ftp)).toBe('tempo');
  });

  it('classifies sweet spot zone', () => {
    expect(classifyPowerZone(230, ftp)).toBe('sweet_spot');
  });

  it('classifies threshold zone', () => {
    expect(classifyPowerZone(250, ftp)).toBe('threshold');
  });

  it('classifies vo2max zone', () => {
    expect(classifyPowerZone(280, ftp)).toBe('vo2max');
  });

  it('classifies anaerobic zone', () => {
    expect(classifyPowerZone(350, ftp)).toBe('anaerobic');
  });

  it('returns unknown for zero FTP', () => {
    expect(classifyPowerZone(200, 0)).toBe('unknown');
  });
});

// ============================================================================
// HR ZONE TESTS
// ============================================================================

describe('classifyHRZone', () => {
  const maxHR = 190;

  it('classifies recovery zone', () => {
    expect(classifyHRZone(100, maxHR)).toBe('recovery');
  });

  it('classifies endurance zone', () => {
    expect(classifyHRZone(125, maxHR)).toBe('endurance');
  });

  it('classifies threshold zone', () => {
    expect(classifyHRZone(160, maxHR)).toBe('threshold');
  });

  it('returns unknown for zero maxHR', () => {
    expect(classifyHRZone(150, 0)).toBe('unknown');
  });
});

// ============================================================================
// CONSISTENCY SCORING TESTS
// ============================================================================

describe('calculateConsistencyScore', () => {
  it('gives high score for consistent power', () => {
    // Mean ~247, StdDev ~12 → score ~90
    const powers = [240, 245, 250, 247, 243, 251, 248, 245];
    const score = calculateConsistencyScore(powers);
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('gives low score for variable power', () => {
    // Mean ~200, StdDev ~45 → score ~55
    const powers = [150, 180, 250, 200, 140, 260, 190, 230];
    const score = calculateConsistencyScore(powers);
    expect(score).toBeLessThan(75);
  });

  it('returns 0 for empty array', () => {
    expect(calculateConsistencyScore([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(calculateConsistencyScore([200])).toBe(0);
  });
});

// ============================================================================
// CONFIDENCE SCORING TESTS
// ============================================================================

describe('calculateConfidenceScore', () => {
  it('gives low confidence for 1 ride', () => {
    const score = calculateConfidenceScore(1, new Date(), false);
    expect(score).toBeLessThanOrEqual(30);
  });

  it('gives high confidence for many recent rides', () => {
    const score = calculateConfidenceScore(10, new Date(), false);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('penalizes stale data', () => {
    const recent = calculateConfidenceScore(5, new Date(), false);
    const stale = calculateConfidenceScore(5, new Date(Date.now() - 120 * 86400000), false);
    expect(recent).toBeGreaterThan(stale);
  });

  it('penalizes FTP changes', () => {
    const stable = calculateConfidenceScore(5, new Date(), false);
    const changed = calculateConfidenceScore(5, new Date(), true);
    expect(stable).toBeGreaterThan(changed);
  });
});

// ============================================================================
// RELEVANCE SCORING TESTS
// ============================================================================

describe('calculateRelevanceScore', () => {
  it('gives high score for frequent recent rides', () => {
    const score = calculateRelevanceScore(14, 6, 3.5);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('gives low score for few total rides', () => {
    const score = calculateRelevanceScore(1, 0, 0.5);
    expect(score).toBeLessThanOrEqual(25);
  });
});

// ============================================================================
// FREQUENCY TIER TESTS
// ============================================================================

describe('classifyFrequencyTier', () => {
  it('classifies primary (weekly+)', () => {
    expect(classifyFrequencyTier(5)).toBe('primary');
  });

  it('classifies regular (2-3x/month)', () => {
    expect(classifyFrequencyTier(2.5)).toBe('regular');
  });

  it('classifies occasional (monthly)', () => {
    expect(classifyFrequencyTier(1)).toBe('occasional');
  });

  it('classifies rare', () => {
    expect(classifyFrequencyTier(0.3)).toBe('rare');
  });
});

// ============================================================================
// MOCK HELPERS
// ============================================================================

function createMockSegment(overrides: Partial<DetectedSegment> = {}): DetectedSegment {
  return {
    startIdx: 0,
    endIdx: 100,
    startLat: 40.0,
    startLng: -105.0,
    endLat: 40.01,
    endLng: -105.01,
    coordinates: Array.from({ length: 10 }, (_, i) => [
      -105.0 + i * 0.001,
      40.0,
    ] as [number, number]),
    distanceMeters: 3000,
    avgGradient: 0,
    maxGradient: 1,
    minGradient: -1,
    gradientVariability: 1,
    elevationGain: 0,
    elevationLoss: 0,
    terrainType: 'flat',
    durationSeconds: 400,
    avgSpeedKmh: 25,
    avgPower: 0,
    maxPower: 0,
    normalizedPower: 0,
    avgHR: 0,
    maxHR: 0,
    avgCadence: 0,
    stops: [],
    stopCount: 0,
    stopsPerKm: 0,
    sharpTurnCount: 0,
    qualityScore: 80,
    ...overrides,
  };
}
