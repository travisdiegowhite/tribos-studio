import { describe, it, expect } from 'vitest';
import {
  COVERAGE_DEFAULTS,
  approxDistanceMeters,
  bboxOf,
  bboxIntersects,
  densifyPath,
  samplePath,
  buildTrackIndex,
  nearestOnTrack,
  pathCoverage,
  mutualCoverage,
} from './segmentCoverage.js';

// ============================================================================
// FIXTURES
// ============================================================================

const BASE_LAT = 40.0;
const BASE_LNG = -105.25;
const M_PER_DEG_LAT = 111320;
const cosLat = Math.cos(BASE_LAT * (Math.PI / 180));

/** Metres east/north of the origin → [lng, lat]. */
function at(eastM, northM) {
  return [
    BASE_LNG + eastM / (M_PER_DEG_LAT * cosLat),
    BASE_LAT + northM / M_PER_DEG_LAT,
  ];
}

/** A straight west→east road of `lengthM`, with a vertex every `spacingM`. */
function straightRoad(lengthM, spacingM, northOffsetM = 0) {
  const pts = [];
  for (let d = 0; d <= lengthM; d += spacingM) pts.push(at(d, northOffsetM));
  if (pts[pts.length - 1][0] !== at(lengthM, northOffsetM)[0]) {
    pts.push(at(lengthM, northOffsetM));
  }
  return pts;
}

// ============================================================================
// GEOMETRY PRIMITIVES
// ============================================================================

describe('approxDistanceMeters', () => {
  it('measures a known northward offset', () => {
    const [lng1, lat1] = at(0, 0);
    const [lng2, lat2] = at(0, 1000);
    expect(approxDistanceMeters(lng1, lat1, lng2, lat2)).toBeCloseTo(1000, 0);
  });

  it('measures a known eastward offset', () => {
    const [lng1, lat1] = at(0, 0);
    const [lng2, lat2] = at(500, 0);
    expect(approxDistanceMeters(lng1, lat1, lng2, lat2)).toBeCloseTo(500, 0);
  });

  it('is symmetric and zero for identical points', () => {
    const [lng, lat] = at(10, 10);
    expect(approxDistanceMeters(lng, lat, lng, lat)).toBe(0);
  });
});

describe('bboxOf / bboxIntersects', () => {
  it('bounds a path and ignores malformed points', () => {
    const box = bboxOf([at(0, 0), null, at(1000, 500), [NaN, NaN]]);
    expect(box.minLat).toBeCloseTo(BASE_LAT, 6);
    expect(box.maxLat).toBeGreaterThan(BASE_LAT);
  });

  it('returns null for an empty path', () => {
    expect(bboxOf([])).toBeNull();
  });

  it('separates distant boxes but joins them under a large pad', () => {
    const a = bboxOf(straightRoad(200, 50));
    const b = bboxOf(straightRoad(200, 50, 300));
    expect(bboxIntersects(a, b, 0)).toBe(false);
    expect(bboxIntersects(a, b, 500)).toBe(true);
  });
});

// ============================================================================
// RESAMPLING
// ============================================================================

describe('densifyPath', () => {
  it('leaves no gap larger than the interval', () => {
    const { coords } = densifyPath(straightRoad(1000, 500), 20);
    for (let i = 1; i < coords.length; i++) {
      const d = approxDistanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      expect(d).toBeLessThanOrEqual(20.001);
    }
  });

  it('preserves the endpoints', () => {
    const road = straightRoad(600, 300);
    const { coords } = densifyPath(road, 20);
    expect(coords[0]).toEqual(road[0]);
    expect(coords[coords.length - 1]).toEqual(road[road.length - 1]);
  });

  it('maps every densified point back to a source vertex', () => {
    const road = straightRoad(600, 300);
    const { coords, sourceIdx } = densifyPath(road, 20);
    expect(sourceIdx).toHaveLength(coords.length);
    for (const idx of sourceIdx) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(road.length);
    }
    // Non-decreasing along the path.
    for (let i = 1; i < sourceIdx.length; i++) {
      expect(sourceIdx[i]).toBeGreaterThanOrEqual(sourceIdx[i - 1]);
    }
  });

  it('handles degenerate inputs', () => {
    expect(densifyPath([], 20).coords).toEqual([]);
    expect(densifyPath([at(0, 0)], 20).coords).toHaveLength(1);
  });
});

describe('samplePath', () => {
  it('samples at roughly the requested interval without drifting', () => {
    const samples = samplePath(straightRoad(1000, 1000), 50);
    for (let i = 1; i < samples.length - 1; i++) {
      const d = approxDistanceMeters(samples[i - 1][0], samples[i - 1][1], samples[i][0], samples[i][1]);
      expect(d).toBeCloseTo(50, 0);
    }
  });

  it('returns nothing for a degenerate path', () => {
    expect(samplePath([at(0, 0)], 50)).toEqual([]);
  });
});

// ============================================================================
// SPATIAL INDEX
// ============================================================================

describe('buildTrackIndex + nearestOnTrack', () => {
  it('agrees with brute-force nearest over many random probes', () => {
    const track = straightRoad(3000, 100);
    const index = buildTrackIndex(track, { densifyMeters: 20, toleranceMeters: 40 });

    // Deterministic pseudo-random probes — no Math.random, so failures repro.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let n = 0; n < 500; n++) {
      const probe = at(rand() * 3000, (rand() - 0.5) * 200);
      const viaIndex = nearestOnTrack(index, probe[0], probe[1], 40);

      let brute = null;
      for (let i = 0; i < index.points.length; i++) {
        const d = approxDistanceMeters(probe[0], probe[1], index.points[i][0], index.points[i][1]);
        if (d <= 40 && (brute === null || d < brute)) brute = d;
      }

      if (brute === null) {
        expect(viaIndex).toBeNull();
      } else {
        expect(viaIndex).not.toBeNull();
        expect(viaIndex.distance).toBeCloseTo(brute, 3);
      }
    }
  });

  it('returns null for an empty index', () => {
    const index = buildTrackIndex([]);
    expect(nearestOnTrack(index, BASE_LNG, BASE_LAT, 40)).toBeNull();
  });
});

// ============================================================================
// COVERAGE — the behaviour that matters
// ============================================================================

describe('pathCoverage', () => {
  const segment = straightRoad(2000, 100);

  it('fully covers an identical track', () => {
    const result = pathCoverage(segment, buildTrackIndex(segment));
    expect(result.coverage).toBeCloseTo(1, 2);
    expect(result.passes).toBe(true);
    expect(result.direction).toBe('forward');
  });

  it('fully covers a track ridden in reverse', () => {
    const result = pathCoverage(segment, buildTrackIndex([...segment].reverse()));
    expect(result.coverage).toBeCloseTo(1, 2);
    expect(result.passes).toBe(true);
    expect(result.direction).toBe('reverse');
  });

  it('still matches when the track is far coarser than the segment', () => {
    // The Strava regression: summary polylines carry ~one vertex per 310m
    // (p10 ~720m). Without densification these samples would sit hundreds of
    // metres from the nearest vertex despite lying exactly on the path.
    const coarse = straightRoad(2000, 700);
    const result = pathCoverage(segment, buildTrackIndex(coarse));
    expect(result.coverage).toBeGreaterThanOrEqual(0.95);
    expect(result.passes).toBe(true);

    // And confirm densification is what earns it — with the interval set
    // wider than the track's own spacing, the same comparison collapses.
    const undensified = buildTrackIndex(coarse, { densifyMeters: 10000 });
    expect(pathCoverage(segment, undensified).coverage).toBeLessThan(0.2);
  });

  it('does not match a parallel road 100m away', () => {
    const parallel = straightRoad(2000, 100, 100);
    const result = pathCoverage(segment, buildTrackIndex(parallel));
    expect(result.coverage).toBeLessThan(0.1);
    expect(result.passes).toBe(false);
  });

  it('does not match a segment the track only half covers', () => {
    const half = straightRoad(1000, 100);
    const result = pathCoverage(segment, buildTrackIndex(half));
    expect(result.coverage).toBeLessThan(0.7);
    expect(result.passes).toBe(false);
  });

  it('rejects a broken-up ride on contiguity even when raw coverage is high', () => {
    // A ride that rides most of the road but detours away from it twice.
    // Note the detours have to physically leave the road: densification
    // deliberately bridges gaps between consecutive track points, because a
    // gap in a real GPS track means the rider travelled that ground.
    const along = (fromM, toM, northM) => {
      const pts = [];
      for (let d = fromM; d <= toM; d += 50) pts.push(at(d, northM));
      return pts;
    };
    const detour = (eastM, fromN, toN) => {
      const pts = [];
      const step = fromN < toN ? 50 : -50;
      for (let n = fromN; step > 0 ? n <= toN : n >= toN; n += step) pts.push(at(eastM, n));
      return pts;
    };

    const broken = [
      ...along(0, 600, 0),
      ...detour(600, 50, 300),
      ...along(600, 800, 300),
      ...detour(800, 250, 0),
      ...along(800, 1400, 0),
      ...detour(1400, 50, 300),
      ...along(1400, 1600, 300),
      ...detour(1600, 250, 0),
      ...along(1600, 2000, 0),
    ];

    const result = pathCoverage(segment, buildTrackIndex(broken));

    // Guard against passing for the wrong reason: coverage must be high
    // enough that only contiguity can be what rejects it.
    expect(result.coverage).toBeGreaterThanOrEqual(COVERAGE_DEFAULTS.minCoverage);
    expect(result.contiguousCoverage).toBeLessThan(COVERAGE_DEFAULTS.minContiguous);
    expect(result.passes).toBe(false);
  });

  it('is sensitive to the tolerance at the margin', () => {
    const offset = straightRoad(2000, 100, 38);
    const index38 = buildTrackIndex(offset, { toleranceMeters: 40 });
    expect(pathCoverage(segment, index38, { toleranceMeters: 40 }).passes).toBe(true);

    const index30 = buildTrackIndex(offset, { toleranceMeters: 30 });
    expect(pathCoverage(segment, index30, { toleranceMeters: 30 }).passes).toBe(false);
  });

  it('reports entry and exit positions along the track', () => {
    // Segment sits in the middle of a longer ride.
    const ride = straightRoad(6000, 100);
    const middle = straightRoad(4000, 100).slice(20); // 2000m..4000m
    const result = pathCoverage(middle, buildTrackIndex(ride));

    expect(result.passes).toBe(true);
    expect(result.entryTrackIdx).toBeGreaterThan(0);
    expect(result.exitTrackIdx).toBeGreaterThan(result.entryTrackIdx);
    expect(result.entrySourceIdx).not.toBeNull();
    expect(result.exitSourceIdx).toBeGreaterThan(result.entrySourceIdx);
  });

  it('returns an empty result for degenerate inputs', () => {
    expect(pathCoverage([], buildTrackIndex(segment)).passes).toBe(false);
    expect(pathCoverage(segment, buildTrackIndex([])).passes).toBe(false);
  });
});

describe('mutualCoverage', () => {
  it('scores identical paths as a match', () => {
    const road = straightRoad(2000, 100);
    expect(mutualCoverage(road, road).score).toBeCloseTo(1, 2);
  });

  it('rejects a short path against a long one even though one covers the other', () => {
    // The old distance-ratio gate existed for this case; mutual coverage
    // subsumes it — the long path is not covered by the short one.
    const long = straightRoad(4000, 100);
    const short = straightRoad(800, 100);
    expect(mutualCoverage(short, long).score).toBeLessThan(0.8);
  });

  it('matches the same road cut at different boundaries', () => {
    // The failure this whole module exists to fix: two rides of one road
    // whose detected boundaries differ by ~150m at each end.
    const a = straightRoad(3000, 50);
    const b = straightRoad(3000, 50).slice(3, -3); // trim 150m off each end
    expect(mutualCoverage(a, b).score).toBeGreaterThan(0.8);
  });

  it('rejects parallel roads', () => {
    const a = straightRoad(2000, 100);
    const b = straightRoad(2000, 100, 120);
    expect(mutualCoverage(a, b).score).toBeLessThan(0.3);
  });
});
