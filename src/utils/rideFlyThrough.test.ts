import { describe, it, expect } from 'vitest';
import { flyThroughDurationS, headingAt, lerpAngle, positionAt } from './rideFlyThrough';
import type { LngLat } from './rideMapCamera';

// Straight north, 4 points 1 km apart
const coords: LngLat[] = [
  [-105.0, 40.0],
  [-105.0, 40.009],
  [-105.0, 40.018],
  [-105.0, 40.027],
];
const km = [0, 1, 2, 3];

describe('flyThroughDurationS', () => {
  it('scales with distance inside a 20–60 s window', () => {
    expect(flyThroughDurationS(5)).toBe(20);
    expect(flyThroughDurationS(30)).toBe(45);
    expect(flyThroughDurationS(200)).toBe(60);
    expect(flyThroughDurationS(0)).toBe(20);
  });
});

describe('positionAt', () => {
  it('interpolates between samples and clamps to the ends', () => {
    expect(positionAt(coords, km, 0.5)).toEqual([-105.0, 40.0045]);
    expect(positionAt(coords, km, 2)).toEqual(coords[2]);
    expect(positionAt(coords, km, -1)).toEqual(coords[0]);
    expect(positionAt(coords, km, 99)).toEqual(coords[3]);
  });
  it('is null for an empty track', () => {
    expect(positionAt([], [], 1)).toBeNull();
  });
});

describe('headingAt', () => {
  it('points along the direction of travel, including at the very end', () => {
    expect(headingAt(coords, km, 0.5)).toBeCloseTo(0, 3);
    expect(headingAt(coords, km, 3)).toBeCloseTo(0, 3);
  });
  it('is null when there is no direction', () => {
    expect(headingAt([coords[0]], [0], 0)).toBeNull();
  });
});

describe('lerpAngle', () => {
  it('takes the short way round', () => {
    expect(lerpAngle(350, 10, 0.5)).toBe(0);
    expect(lerpAngle(10, 350, 0.5)).toBe(0);
    expect(lerpAngle(0, 90, 0.5)).toBe(45);
    expect(lerpAngle(0, 180, 1)).toBe(180);
  });
});
