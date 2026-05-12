import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KM_TO_M,
  M_TO_KM,
  METERS_PER_KM,
  assertKm,
  assertMeters,
  haversineKm,
  haversineMeters,
} from '../distanceUnits';

describe('distance unit contract', () => {
  describe('M_TO_KM / KM_TO_M', () => {
    it('METERS_PER_KM is 1000', () => {
      expect(METERS_PER_KM).toBe(1000);
    });

    it('M_TO_KM converts meters to kilometers', () => {
      expect(M_TO_KM(47_000)).toBe(47);
      expect(M_TO_KM(0)).toBe(0);
    });

    it('KM_TO_M converts kilometers to meters', () => {
      expect(KM_TO_M(47)).toBe(47_000);
      expect(KM_TO_M(0)).toBe(0);
    });

    it('round-trips losslessly for whole values', () => {
      for (const km of [0, 1, 10, 47, 1234]) {
        expect(M_TO_KM(KM_TO_M(km))).toBe(km);
      }
    });
  });

  describe('assertKm', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it('warns when value exceeds 10,000 (likely raw meters in a km field)', () => {
      assertKm(47_000, 'routeStats.distance_km');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('routeStats.distance_km');
      expect(warn.mock.calls[0][0]).toContain('looks like meters');
    });

    it('does not warn for realistic cycling distances', () => {
      assertKm(0, 'x');
      assertKm(0.5, 'x');
      assertKm(47, 'x');
      assertKm(500, 'x');
      assertKm(10_000, 'x');
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn on null, undefined, or NaN', () => {
      assertKm(null, 'x');
      assertKm(undefined, 'x');
      assertKm(Number.NaN, 'x');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('assertMeters', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it('warns when value is between 0 and 1 (likely raw km in a meters field)', () => {
      assertMeters(0.5, 'segment.length_m');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('segment.length_m');
      expect(warn.mock.calls[0][0]).toContain('looks like km');
    });

    it('does not warn for realistic meter values', () => {
      assertMeters(0, 'x');
      assertMeters(1, 'x');
      assertMeters(47, 'x');
      assertMeters(47_000, 'x');
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn on null, undefined, or NaN', () => {
      assertMeters(null, 'x');
      assertMeters(undefined, 'x');
      assertMeters(Number.NaN, 'x');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('haversine', () => {
    // Distance between Times Square (40.7580, -73.9855) and Empire State
    // Building (40.7484, -73.9857) is approximately 1.07 km / 1070 m.
    const lat1 = 40.7580;
    const lng1 = -73.9855;
    const lat2 = 40.7484;
    const lng2 = -73.9857;

    it('haversineMeters returns meters', () => {
      const result = haversineMeters(lat1, lng1, lat2, lng2);
      expect(result).toBeGreaterThan(1000);
      expect(result).toBeLessThan(1200);
    });

    it('haversineKm returns kilometers', () => {
      const result = haversineKm(lat1, lng1, lat2, lng2);
      expect(result).toBeGreaterThan(1);
      expect(result).toBeLessThan(1.2);
    });

    it('haversineMeters is exactly 1000x haversineKm', () => {
      const m = haversineMeters(lat1, lng1, lat2, lng2);
      const km = haversineKm(lat1, lng1, lat2, lng2);
      expect(m).toBeCloseTo(km * 1000, 6);
    });

    it('returns 0 for identical points', () => {
      expect(haversineMeters(lat1, lng1, lat1, lng1)).toBe(0);
      expect(haversineKm(lat1, lng1, lat1, lng1)).toBe(0);
    });
  });
});
