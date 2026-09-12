import { describe, it, expect, beforeEach } from 'vitest';
import {
  bearingBetween,
  boundsForCoords,
  cameraBearingForRoute,
  readStored3dPreference,
  routeGeometryFor,
  writeStored3dPreference,
  RIDE_MAP_3D_STORAGE_KEY,
  type LngLat,
} from './rideMapCamera';

// Boulder-ish; a track heading north-east then back
const northEast: LngLat[] = Array.from({ length: 30 }, (_, i) => [-105.3 + i * 0.002, 40.0 + i * 0.002]);
const loop: LngLat[] = [...northEast, ...[...northEast].reverse()];

describe('routeGeometryFor', () => {
  it('prefers stream coords over the polyline so metric segments align with geometry', () => {
    const polyline: LngLat[] = [[-105, 40], [-105.01, 40.01]];
    const g = routeGeometryFor({ coords: northEast }, polyline);
    expect(g.source).toBe('streams');
    expect(g.coords).toHaveLength(30);
    expect(g.geojson?.geometry.coordinates).toBe(g.coords);
    expect(g.bounds).not.toBeNull();
  });

  it('falls back to the polyline when streams have no usable coords', () => {
    const polyline: LngLat[] = [[-105, 40], [-105.01, 40.01], [-105.02, 40.03]];
    expect(routeGeometryFor({ coords: [] }, polyline).source).toBe('polyline');
    expect(routeGeometryFor(undefined, polyline).source).toBe('polyline');
    expect(routeGeometryFor({ coords: [[-105, 40]] }, polyline).source).toBe('polyline');
  });

  it('drops malformed points and reports none when fewer than two remain', () => {
    const g = routeGeometryFor({ coords: [[-105, 40], null, [NaN, 40], [999, 40]] as never }, null);
    expect(g.source).toBe('none');
    expect(g.geojson).toBeNull();
    expect(g.bounds).toBeNull();
  });
});

describe('boundsForCoords', () => {
  it('pads the box by 10% of its span', () => {
    const b = boundsForCoords([[-105, 40], [-104, 41]]);
    expect(b).toEqual([[-105.1, 39.9], [-103.9, 41.1]]);
  });

  it('never returns a zero-width box for a straight north–south track', () => {
    const b = boundsForCoords([[-105, 40], [-105, 40.5]]);
    expect(b).not.toBeNull();
    const [[minLng], [maxLng]] = b!;
    expect(maxLng - minLng).toBeGreaterThan(0);
  });

  it('is null for fewer than two points', () => {
    expect(boundsForCoords([])).toBeNull();
    expect(boundsForCoords([[-105, 40]])).toBeNull();
  });
});

describe('bearingBetween', () => {
  it('reports the four cardinal directions', () => {
    expect(bearingBetween([-105, 40], [-105, 41])).toBeCloseTo(0, 5);
    expect(bearingBetween([-105, 40], [-104, 40])).toBeCloseTo(90, 0);
    expect(bearingBetween([-105, 40], [-105, 39])).toBeCloseTo(180, 5);
    expect(bearingBetween([-105, 40], [-106, 40])).toBeCloseTo(270, 0);
  });
});

describe('cameraBearingForRoute', () => {
  it('points from the start toward the farthest point of the ride', () => {
    const b = cameraBearingForRoute(northEast);
    // Heading NE at 40°N: longitude degrees are shorter than latitude
    // degrees, so the bearing is a little east of north-east.
    expect(b).toBeGreaterThan(30);
    expect(b).toBeLessThan(45);
  });

  it('gives the same answer for an out-and-back as for the outbound leg', () => {
    expect(cameraBearingForRoute(loop)).toBe(cameraBearingForRoute(northEast));
  });

  it('is north-up for a track with no spatial extent', () => {
    expect(cameraBearingForRoute([])).toBe(0);
    expect(cameraBearingForRoute([[-105, 40], [-105, 40], [-105.00001, 40]])).toBe(0);
  });
});

describe('3D preference storage', () => {
  beforeEach(() => {
    localStorage.removeItem(RIDE_MAP_3D_STORAGE_KEY);
  });

  it('defaults to 3D on', () => {
    expect(readStored3dPreference()).toBe(true);
  });

  it('round-trips an explicit 2D choice', () => {
    writeStored3dPreference(false);
    expect(readStored3dPreference()).toBe(false);
    writeStored3dPreference(true);
    expect(readStored3dPreference()).toBe(true);
  });
});
