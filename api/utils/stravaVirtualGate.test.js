import { describe, it, expect } from 'vitest';
import { isVirtualStravaActivity } from './stravaVirtualGate.js';

describe('isVirtualStravaActivity', () => {
  it('accepts Zwift-style virtual rides and runs', () => {
    expect(isVirtualStravaActivity({ type: 'VirtualRide' })).toBe(true);
    expect(isVirtualStravaActivity({ type: 'VirtualRun' })).toBe(true);
    expect(isVirtualStravaActivity({ type: 'Ride', sport_type: 'VirtualRide' })).toBe(true);
  });

  it('rejects outdoor activities Garmin/Wahoo deliver themselves', () => {
    expect(isVirtualStravaActivity({ type: 'Ride', sport_type: 'Ride' })).toBe(false);
    expect(isVirtualStravaActivity({ type: 'Run' })).toBe(false);
    expect(isVirtualStravaActivity({ type: 'GravelRide', sport_type: 'GravelRide' })).toBe(false);
  });

  it('rejects missing input', () => {
    expect(isVirtualStravaActivity(null)).toBe(false);
    expect(isVirtualStravaActivity({})).toBe(false);
  });
});
