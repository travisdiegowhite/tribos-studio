import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildStreamsFromPolyline, calculatePolylineDistance } from './polylineStreamBuilder.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeElevationResponse(count) {
  const results = Array.from({ length: count }, (_, i) => ({
    location: { lat: 40 + i * 0.001, lng: -74 + i * 0.001 },
    elevation: 100 + i * 2,
  }));
  return {
    ok: true,
    json: async () => ({ status: 'OK', results }),
  };
}

// A simple polyline encoding helper for testing
// Encodes a sequence of [lat, lng] pairs into Google encoded polyline format
function encodePolyline(coords) {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of coords) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    encoded += encodeSignedNumber(latE5 - prevLat);
    encoded += encodeSignedNumber(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }

  return encoded;
}

function encodeSignedNumber(num) {
  let sgn_num = num << 1;
  if (num < 0) sgn_num = ~sgn_num;
  return encodeNumber(sgn_num);
}

function encodeNumber(num) {
  let encoded = '';
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}

describe('polylineStreamBuilder', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildStreamsFromPolyline', () => {
    it('returns null for null/undefined/empty input', async () => {
      expect(await buildStreamsFromPolyline(null)).toBeNull();
      expect(await buildStreamsFromPolyline(undefined)).toBeNull();
      expect(await buildStreamsFromPolyline('')).toBeNull();
    });

    it('returns null for polylines with too few points', async () => {
      // Encode only 3 points — below MIN_POINTS_FOR_ANALYSIS (10)
      const polyline = encodePolyline([
        [40.0, -74.0],
        [40.001, -74.001],
        [40.002, -74.002],
      ]);
      const result = await buildStreamsFromPolyline(polyline);
      expect(result).toBeNull();
    });

    it('builds streams with coords in [lng, lat] format', async () => {
      // Generate 15 points
      const points = Array.from({ length: 15 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      mockFetch.mockResolvedValueOnce(makeElevationResponse(15));

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).not.toBeNull();
      expect(result.coords).toHaveLength(15);
      expect(result.elevation).toHaveLength(15);

      // Verify coords are in [lng, lat] format (opposite of polyline's [lat, lng])
      expect(result.coords[0][0]).toBeCloseTo(-74, 3); // lng first
      expect(result.coords[0][1]).toBeCloseTo(40, 3);   // lat second
    });

    it('provides elevation array matching coords length', async () => {
      const points = Array.from({ length: 20 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      mockFetch.mockResolvedValueOnce(makeElevationResponse(20));

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).not.toBeNull();
      expect(result.elevation.length).toBe(result.coords.length);
      expect(result.elevation[0]).toBe(100); // first elevation from mock
    });

    it('returns null when elevation API fails', async () => {
      const points = Array.from({ length: 15 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).toBeNull();
    });

    it('returns null when elevation API returns non-OK status', async () => {
      const points = Array.from({ length: 15 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ERROR', error: 'Rate limited' }),
      });

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).toBeNull();
    });

    it('batches elevation requests for >100 points', async () => {
      const points = Array.from({ length: 150 }, (_, i) => [40 + i * 0.0005, -74 + i * 0.0005]);
      const polyline = encodePolyline(points);

      // First batch of 100, second batch of 50
      mockFetch
        .mockResolvedValueOnce(makeElevationResponse(100))
        .mockResolvedValueOnce(makeElevationResponse(50));

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).not.toBeNull();
      expect(result.coords).toHaveLength(150);
      expect(result.elevation).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not include speed, power, HR, or cadence', async () => {
      const points = Array.from({ length: 15 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      mockFetch.mockResolvedValueOnce(makeElevationResponse(15));

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).not.toBeNull();
      expect(result.speed).toBeUndefined();
      expect(result.power).toBeUndefined();
      expect(result.heartRate).toBeUndefined();
      expect(result.cadence).toBeUndefined();
    });

    it('handles null elevation values gracefully', async () => {
      const points = Array.from({ length: 15 }, (_, i) => [40 + i * 0.001, -74 + i * 0.001]);
      const polyline = encodePolyline(points);

      const results = Array.from({ length: 15 }, (_, i) => ({
        location: { lat: 40 + i * 0.001, lng: -74 + i * 0.001 },
        elevation: i % 3 === 0 ? null : 100 + i,
      }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OK', results }),
      });

      const result = await buildStreamsFromPolyline(polyline);
      expect(result).not.toBeNull();
      // Null elevations should default to 0
      expect(result.elevation[0]).toBe(0);
      expect(result.elevation[1]).toBe(101);
    });
  });

  describe('calculatePolylineDistance', () => {
    it('returns 0 for a single point', () => {
      expect(calculatePolylineDistance([[40, -74]])).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(calculatePolylineDistance([])).toBe(0);
    });

    it('calculates distance in meters', () => {
      // Two points ~111m apart (0.001 degrees latitude)
      const dist = calculatePolylineDistance([
        [40.0, -74.0],
        [40.001, -74.0],
      ]);
      // 0.001 degree lat ≈ 111 meters
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(120);
    });

    it('accumulates distance for multiple points', () => {
      const points = [
        [40.0, -74.0],
        [40.001, -74.0],
        [40.002, -74.0],
      ];
      const dist = calculatePolylineDistance(points);
      // Should be roughly 222m (2 * 111m)
      expect(dist).toBeGreaterThan(200);
      expect(dist).toBeLessThan(250);
    });
  });
});
