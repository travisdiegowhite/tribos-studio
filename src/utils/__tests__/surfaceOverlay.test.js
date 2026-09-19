import { describe, it, expect } from 'vitest';
import {
  classifySurface,
  matchRouteSurfaces,
  computeSurfaceDistribution,
  SURFACE_SNAP_RADIUS_M,
} from '../surfaceOverlay.js';

// Straight east–west route along 40°N; each step is 0.001° ≈ 85 m.
const ROUTE = Array.from({ length: 11 }, (_, i) => [-105.0 + i * 0.001, 40.0]);

/** Overpass-shaped way running alongside a slice of ROUTE, offset north by `offsetDeg`. */
function overpassWay(id, fromIdx, toIdx, surface, offsetDeg = 0) {
  return {
    type: 'way',
    id,
    tags: { highway: 'residential', surface },
    geometry: ROUTE.slice(fromIdx, toIdx + 1).map(([lon, lat]) => ({ lat: lat + offsetDeg, lon })),
  };
}

/** TaggedWay-shaped (canonical [lng, lat]) equivalent. */
function taggedWay(id, fromIdx, toIdx, surface) {
  return { id, tags: { surface }, geometry: ROUTE.slice(fromIdx, toIdx + 1) };
}

describe('classifySurface', () => {
  it('maps OSM surface tags into the four categories', () => {
    expect(classifySurface('asphalt')).toBe('paved');
    expect(classifySurface('Compacted')).toBe('gravel');
    expect(classifySurface('dirt')).toBe('unpaved');
    expect(classifySurface('lava')).toBe('unknown');
    expect(classifySurface(undefined)).toBe('unknown');
  });
});

describe('matchRouteSurfaces', () => {
  it('assigns each coordinate segment the surface of the nearest tagged way', () => {
    const ways = [overpassWay(1, 0, 5, 'gravel'), overpassWay(2, 5, 10, 'asphalt')];
    const segments = matchRouteSurfaces(ROUTE, ways);
    expect(segments).toHaveLength(10);
    expect(segments.slice(0, 5)).toEqual(Array(5).fill('gravel'));
    expect(segments.slice(5)).toEqual(Array(5).fill('paved'));
  });

  it('accepts canonical [lng, lat] TaggedWay geometry too', () => {
    const ways = [taggedWay(-1, 0, 10, 'fine_gravel')];
    expect(matchRouteSurfaces(ROUTE, ways)).toEqual(Array(10).fill('gravel'));
  });

  it(`reports unknown beyond the ${SURFACE_SNAP_RADIUS_M} m snap radius instead of inheriting`, () => {
    // Way 1 hugs the first half; way 2 is ~200 m north of the second half.
    const farOffset = 200 / 111000;
    const ways = [overpassWay(1, 0, 5, 'gravel'), overpassWay(2, 5, 10, 'asphalt', farOffset)];
    const segments = matchRouteSurfaces(ROUTE, ways);
    expect(segments.slice(0, 5)).toEqual(Array(5).fill('gravel'));
    expect(segments.slice(6)).toEqual(Array(4).fill('unknown'));
  });

  it('still matches a way a few metres off the line', () => {
    const nearOffset = 10 / 111000;
    const ways = [overpassWay(1, 0, 10, 'asphalt', nearOffset)];
    expect(matchRouteSurfaces(ROUTE, ways)).toEqual(Array(10).fill('paved'));
  });

  it('ignores ways without a surface tag and returns null when nothing is usable', () => {
    const untagged = { type: 'way', id: 9, tags: { highway: 'track' }, geometry: overpassWay(9, 0, 10, 'x').geometry };
    expect(matchRouteSurfaces(ROUTE, [untagged])).toBeNull();
    expect(matchRouteSurfaces(ROUTE, [])).toBeNull();
    expect(matchRouteSurfaces([ROUTE[0]], [overpassWay(1, 0, 10, 'asphalt')])).toBeNull();
  });
});

describe('computeSurfaceDistribution', () => {
  it('is count-weighted without coordinates (legacy behaviour)', () => {
    expect(computeSurfaceDistribution(['gravel', 'paved', 'paved', 'unknown'])).toEqual({
      gravel: 25,
      paved: 50,
    });
  });

  it('is distance-weighted when the geometry is supplied', () => {
    // Segment 0 is 10× longer than segment 1.
    const coords = [
      [-105.0, 40.0],
      [-104.99, 40.0], // ~850 m
      [-104.989, 40.0], // ~85 m
    ];
    const byCount = computeSurfaceDistribution(['gravel', 'paved']);
    const byLength = computeSurfaceDistribution(['gravel', 'paved'], coords);
    expect(byCount).toEqual({ gravel: 50, paved: 50 });
    expect(byLength.gravel).toBe(91);
    expect(byLength.paved).toBe(9);
  });

  it('falls back to counts when the geometry length does not match', () => {
    expect(computeSurfaceDistribution(['gravel', 'paved'], [[0, 0]])).toEqual({
      gravel: 50,
      paved: 50,
    });
  });

  it('drops unknown from the output and is empty for no segments', () => {
    expect(computeSurfaceDistribution([])).toEqual({});
    expect(computeSurfaceDistribution(['unknown'])).toEqual({});
  });
});
