import { describe, it, expect } from 'vitest';
import {
  toDisplayDistance,
  fromDisplayDistance,
  toDisplayElevation,
  fromDisplayElevation,
  distanceUnit,
  elevationUnit,
  distanceBounds,
  elevationBounds,
} from '../unitFormInput';

describe('unitFormInput', () => {
  it('passes through values unchanged in metric', () => {
    expect(toDisplayDistance(50, false)).toBe(50);
    expect(fromDisplayDistance(50, false)).toBe(50);
    expect(toDisplayElevation(600, false)).toBe(600);
    expect(fromDisplayElevation(600, false)).toBe(600);
  });

  it('converts km↔mi for distance when imperial', () => {
    // 80.47 km ≈ 50 mi
    expect(toDisplayDistance(80.47, true)).toBeCloseTo(50, 0);
    expect(fromDisplayDistance(50, true)).toBeCloseTo(80.47, 1);
  });

  it('converts m↔ft for elevation when imperial', () => {
    expect(toDisplayElevation(1000, true)).toBe(3281); // round(3280.84)
    expect(fromDisplayElevation(3281, true)).toBeCloseTo(1000, 0);
  });

  it('round-trips a typed imperial value back to itself', () => {
    const km = fromDisplayDistance(30, true);
    expect(toDisplayDistance(km, true)).toBe(30);
  });

  it('preserves empty input', () => {
    expect(toDisplayDistance('', true)).toBe('');
    expect(fromDisplayDistance('', true)).toBe('');
    expect(fromDisplayDistance(null, true)).toBe('');
    expect(fromDisplayDistance('abc', true)).toBe('');
  });

  it('exposes unit labels and bounds per system', () => {
    expect(distanceUnit(true)).toBe('mi');
    expect(distanceUnit(false)).toBe('km');
    expect(elevationUnit(true)).toBe('ft');
    expect(elevationUnit(false)).toBe('m');
    expect(distanceBounds(true).max).toBe(300);
    expect(distanceBounds(false).max).toBe(500);
    expect(elevationBounds(true).max).toBe(30000);
    expect(elevationBounds(false).max).toBe(10000);
  });
});
