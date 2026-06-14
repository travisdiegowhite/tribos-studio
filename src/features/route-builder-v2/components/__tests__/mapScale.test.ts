import { describe, it, expect } from 'vitest';
import { calculateScale } from '../mapScale';

describe('calculateScale', () => {
  it('returns metric units below a kilometre and km above', () => {
    const near = calculateScale(40, 16, false); // zoomed in → small distance
    expect(near.unit).toBe('m');
    const far = calculateScale(40, 9, false); // zoomed out → large distance
    expect(far.unit).toBe('km');
  });

  it('returns imperial units (ft / mi) when useImperial', () => {
    const near = calculateScale(40, 16, true);
    expect(near.unit).toBe('ft');
    const far = calculateScale(40, 8, true);
    expect(far.unit).toBe('mi');
  });

  it('clamps the bar width to 50–150px', () => {
    for (const zoom of [3, 8, 12, 16, 20]) {
      const { width } = calculateScale(40, zoom, false);
      expect(width).toBeGreaterThanOrEqual(50);
      expect(width).toBeLessThanOrEqual(150);
    }
  });

  it('produces a positive nice value', () => {
    const { value } = calculateScale(51.5, 13, false);
    expect(value).toBeGreaterThan(0);
  });

  it('higher zoom yields a smaller represented distance (metric)', () => {
    const toMeters = (z: number) => {
      const s = calculateScale(40, z, false);
      return s.unit === 'km' ? s.value * 1000 : s.value;
    };
    expect(toMeters(15)).toBeLessThan(toMeters(10));
  });
});
