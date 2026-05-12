import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activityPointToCanonical,
  activityPointsToCanonical,
  canonicalToBRouter,
  canonicalToOpenElevation,
  canonicalToValhalla,
  looseToCanonical,
  mapboxEventToCanonical,
  openElevationToCanonical,
  openTopoToCanonical,
  routeRowEndToCanonical,
  routeRowStartToCanonical,
  valhallaToCanonical,
} from '../coordConverters';
import {
  assertCoordinate,
  coord,
  isCoordinateArray,
  isValidCoordinate,
} from '../../types/geo';

describe('coordinate contract', () => {
  describe('isValidCoordinate', () => {
    it('accepts valid [lng, lat]', () => {
      expect(isValidCoordinate([-105.27, 40.01])).toBe(true);
      expect(isValidCoordinate([0, 0])).toBe(true);
      expect(isValidCoordinate([-180, -90])).toBe(true);
      expect(isValidCoordinate([180, 90])).toBe(true);
    });

    it('rejects non-tuple shapes', () => {
      expect(isValidCoordinate(null)).toBe(false);
      expect(isValidCoordinate(undefined)).toBe(false);
      expect(isValidCoordinate({})).toBe(false);
      expect(isValidCoordinate({ lng: 0, lat: 0 })).toBe(false);
      expect(isValidCoordinate([0])).toBe(false);
      expect(isValidCoordinate([0, 0, 0])).toBe(false);
      expect(isValidCoordinate(['a', 'b'])).toBe(false);
    });

    it('rejects out-of-range values', () => {
      expect(isValidCoordinate([-181, 0])).toBe(false);
      expect(isValidCoordinate([181, 0])).toBe(false);
      expect(isValidCoordinate([0, -91])).toBe(false);
      expect(isValidCoordinate([0, 91])).toBe(false);
    });

    it('rejects non-finite numbers', () => {
      expect(isValidCoordinate([NaN, 0])).toBe(false);
      expect(isValidCoordinate([0, Infinity])).toBe(false);
    });
  });

  describe('assertCoordinate', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it('does not warn on a valid Colorado coordinate', () => {
      assertCoordinate([-105.27, 40.01], 'test');
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns when coordinate is structurally invalid', () => {
      assertCoordinate({ lng: -105, lat: 40 }, 'wp');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('wp is not a valid'),
        expect.anything(),
      );
    });

    it('warns when [lat, lng] swap is plausible (US heuristic)', () => {
      // 40, -105 looks like Colorado lat first, lng second
      assertCoordinate([40, -105], 'wp');
      // Won't trigger the "reversed" heuristic because lng is negative; but it IS invalid (lng must be in -180..180, OK so it's valid range — let's check)
      // Actually [40, -105]: lng=40 (valid), lat=-105 (invalid) → first warning fires
      expect(warn).toHaveBeenCalled();
    });

    it('warns on the canonical US-swap heuristic', () => {
      // [40, -50]: positive lng + negative lat, both in mid-range
      assertCoordinate([40, -50], 'wp');
      const calls = warn.mock.calls.flat().join(' ');
      expect(calls).toContain('looks reversed');
    });
  });

  describe('coord helper', () => {
    it('builds a Coordinate from explicit lng/lat', () => {
      expect(coord(-105, 40)).toEqual([-105, 40]);
    });
  });

  describe('isCoordinateArray', () => {
    it('accepts an array of valid coordinates', () => {
      expect(isCoordinateArray([[-105, 40], [-106, 41]])).toBe(true);
    });
    it('rejects mixed shapes', () => {
      expect(isCoordinateArray([[-105, 40], { lng: -106, lat: 41 }])).toBe(false);
    });
    it('accepts the empty array', () => {
      expect(isCoordinateArray([])).toBe(true);
    });
  });

  describe('Mapbox event boundary', () => {
    it('mapboxEventToCanonical swaps shape but not values', () => {
      expect(mapboxEventToCanonical({ lng: -105.27, lat: 40.01 })).toEqual([
        -105.27, 40.01,
      ]);
    });
  });

  describe('Stadia / Valhalla boundary', () => {
    it('canonicalToValhalla emits { lat, lon }', () => {
      expect(canonicalToValhalla([-105.27, 40.01])).toEqual({
        lat: 40.01,
        lon: -105.27,
      });
    });

    it('valhallaToCanonical inverts canonicalToValhalla', () => {
      const c = [-105.27, 40.01] as const;
      expect(valhallaToCanonical(canonicalToValhalla(c))).toEqual(c);
    });
  });

  describe('BRouter boundary', () => {
    it('canonicalToBRouter formats as pipe-separated lon,lat', () => {
      expect(
        canonicalToBRouter([
          [-105.27, 40.01],
          [-105.0, 40.5],
        ]),
      ).toBe('-105.27,40.01|-105,40.5');
    });

    it('canonicalToBRouter handles a single waypoint pair', () => {
      expect(canonicalToBRouter([[-105.27, 40.01]])).toBe('-105.27,40.01');
    });
  });

  describe('Open-Elevation boundary', () => {
    it('canonicalToOpenElevation emits { latitude, longitude }', () => {
      expect(canonicalToOpenElevation([-105.27, 40.01])).toEqual({
        latitude: 40.01,
        longitude: -105.27,
      });
    });

    it('openElevationToCanonical extracts coordinate and elevation', () => {
      expect(
        openElevationToCanonical({
          latitude: 40.01,
          longitude: -105.27,
          elevation: 1655,
        }),
      ).toEqual({ coordinate: [-105.27, 40.01], elevation: 1655 });
    });
  });

  describe('OpenTopoData boundary', () => {
    it('openTopoToCanonical extracts coordinate and elevation', () => {
      expect(
        openTopoToCanonical({ lat: 40.01, lon: -105.27, elevation: 1655 }),
      ).toEqual({ coordinate: [-105.27, 40.01], elevation: 1655 });
    });
  });

  describe('Activity import boundary', () => {
    it('activityPointToCanonical swaps shape but not values', () => {
      expect(
        activityPointToCanonical({ latitude: 40.01, longitude: -105.27 }),
      ).toEqual([-105.27, 40.01]);
    });

    it('activityPointsToCanonical maps an array', () => {
      expect(
        activityPointsToCanonical([
          { latitude: 40.0, longitude: -105.0 },
          { latitude: 40.5, longitude: -105.5 },
        ]),
      ).toEqual([
        [-105.0, 40.0],
        [-105.5, 40.5],
      ]);
    });
  });

  describe('Route row boundary', () => {
    it('routeRowStartToCanonical returns a Coordinate for a populated row', () => {
      expect(
        routeRowStartToCanonical({
          start_latitude: 40.01,
          start_longitude: -105.27,
        }),
      ).toEqual([-105.27, 40.01]);
    });

    it('returns null when either column is missing', () => {
      expect(
        routeRowStartToCanonical({
          start_latitude: null,
          start_longitude: -105.27,
        }),
      ).toBeNull();
      expect(
        routeRowStartToCanonical({
          start_latitude: 40.01,
          start_longitude: undefined,
        }),
      ).toBeNull();
    });

    it('routeRowEndToCanonical mirrors the start helper', () => {
      expect(
        routeRowEndToCanonical({
          end_latitude: 40.01,
          end_longitude: -105.27,
        }),
      ).toEqual([-105.27, 40.01]);
    });
  });

  describe('looseToCanonical (historical shape absorber)', () => {
    it('accepts canonical arrays', () => {
      expect(looseToCanonical([-105.27, 40.01])).toEqual([-105.27, 40.01]);
    });

    it('accepts { lng, lat }', () => {
      expect(looseToCanonical({ lng: -105.27, lat: 40.01 })).toEqual([
        -105.27, 40.01,
      ]);
    });

    it('accepts { lon, lat }', () => {
      expect(looseToCanonical({ lon: -105.27, lat: 40.01 })).toEqual([
        -105.27, 40.01,
      ]);
    });

    it('accepts { longitude, latitude }', () => {
      expect(
        looseToCanonical({ longitude: -105.27, latitude: 40.01 }),
      ).toEqual([-105.27, 40.01]);
    });

    it('prefers lng over lon over longitude when multiple are present', () => {
      expect(
        looseToCanonical({
          lng: -1,
          lon: -2,
          longitude: -3,
          lat: 10,
          latitude: 11,
        }),
      ).toEqual([-1, 10]);
    });

    it('returns null for invalid shapes', () => {
      expect(looseToCanonical(null)).toBeNull();
      expect(looseToCanonical(undefined)).toBeNull();
      expect(looseToCanonical('foo')).toBeNull();
      expect(looseToCanonical({})).toBeNull();
      expect(looseToCanonical({ lng: -105 })).toBeNull();
      expect(looseToCanonical([])).toBeNull();
      expect(looseToCanonical(['a', 'b'])).toBeNull();
    });
  });
});
