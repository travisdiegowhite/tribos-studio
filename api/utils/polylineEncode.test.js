import { describe, it, expect } from 'vitest';
import { encodeThumbPolyline } from './polylineEncode.js';
import { decodePolyline } from './polylineDecode.js';

describe('encodeThumbPolyline', () => {
  it('round-trips through the decoder', () => {
    const coords = [
      [-105.2705, 40.015],
      [-105.28, 40.02],
      [-105.29, 40.025],
    ];
    const encoded = encodeThumbPolyline(coords);
    expect(typeof encoded).toBe('string');
    const decoded = decodePolyline(encoded); // [lat, lng] pairs
    expect(decoded).toHaveLength(3);
    expect(decoded[0][0]).toBeCloseTo(40.015, 5);
    expect(decoded[0][1]).toBeCloseTo(-105.2705, 5);
    expect(decoded[2][0]).toBeCloseTo(40.025, 5);
  });

  it('downsamples long geometry to the point budget, keeping endpoints', () => {
    const coords = Array.from({ length: 2000 }, (_, i) => [
      -105 - i * 0.0001,
      40 + i * 0.0001,
    ]);
    const encoded = encodeThumbPolyline(coords, 60);
    const decoded = decodePolyline(encoded);
    expect(decoded.length).toBeLessThanOrEqual(60);
    expect(decoded[0][1]).toBeCloseTo(coords[0][0], 4);
    expect(decoded[decoded.length - 1][1]).toBeCloseTo(coords[coords.length - 1][0], 4);
  });

  it('ignores an elevation third element and rejects degenerate input', () => {
    const withEle = [
      [-105.27, 40.01, 1650],
      [-105.28, 40.02, 1660],
    ];
    const decoded = decodePolyline(encodeThumbPolyline(withEle));
    expect(decoded).toHaveLength(2);
    expect(encodeThumbPolyline([])).toBeNull();
    expect(encodeThumbPolyline([[-105, 40]])).toBeNull();
    expect(encodeThumbPolyline(null)).toBeNull();
  });
});
