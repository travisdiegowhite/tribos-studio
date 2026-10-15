import { describe, it, expect } from 'vitest';
import {
  calculatePaceZones,
  estimateThresholdPaceFromVdot,
  estimateVdot,
  formatPacePerKm,
} from '../paceZones';

describe('paceZones', () => {
  it('builds six zones around threshold pace, slowest first', () => {
    const z = calculatePaceZones(300)!;
    expect(z.z4).toEqual({ name: 'Threshold', min: 291, max: 309 });
    expect(z.z1.max).toBe(450);
    expect(z.z6.min).toBe(210);
    // Each zone's slow edge meets the next-slower zone's fast edge.
    expect(z.z2.max).toBe(z.z1.min);
    expect(z.z5.max).toBe(z.z4.min);
  });

  it('has no zones without a threshold', () => {
    expect(calculatePaceZones(null)).toBeNull();
    expect(calculatePaceZones(0)).toBeNull();
  });

  it('matches Daniels for a 20:00 5k and a 40:00 10k', () => {
    expect(estimateVdot('5k', 20 * 60)).toBe(49.8);
    expect(estimateVdot('10k', 40 * 60)).toBe(51.9);
    expect(estimateVdot('mile', 300)).toBeNull();
    expect(estimateVdot('5k', 0)).toBeNull();
  });

  it('derives threshold pace from VDOT', () => {
    expect(estimateThresholdPaceFromVdot(49.8)).toBe(291);
    expect(estimateThresholdPaceFromVdot(null)).toBeNull();
  });

  it('formats pace and never prints :60', () => {
    expect(formatPacePerKm(270)).toBe('4:30/km');
    expect(formatPacePerKm(299.6)).toBe('5:00/km');
    expect(formatPacePerKm(null)).toBe('-');
  });
});
