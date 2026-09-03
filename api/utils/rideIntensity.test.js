import { describe, it, expect } from 'vitest';
import {
  rideIntensityFrom,
  rideIntensityFields,
  MIN_PLAUSIBLE_FTP,
  MAX_PLAUSIBLE_RI,
} from './rideIntensity.js';

describe('rideIntensityFrom', () => {
  it('is EP / FTP, to three decimals', () => {
    expect(rideIntensityFrom(250, 250)).toBe(1);
    expect(rideIntensityFrom(200, 250)).toBe(0.8);
    // 235/275 = 0.854545…, and the column is NUMERIC(4,3).
    expect(rideIntensityFrom(235, 275)).toBe(0.855);
  });

  it('accepts numeric strings, since PostgREST hands back numerics as strings', () => {
    expect(rideIntensityFrom('200', '250')).toBe(0.8);
  });

  it('is null when either input is missing', () => {
    expect(rideIntensityFrom(null, 250)).toBeNull();
    expect(rideIntensityFrom(200, null)).toBeNull();
    expect(rideIntensityFrom(undefined, undefined)).toBeNull();
  });

  it('is null when either input is not a finite number', () => {
    expect(rideIntensityFrom('n/a', 250)).toBeNull();
    expect(rideIntensityFrom(200, 'n/a')).toBeNull();
    expect(rideIntensityFrom(NaN, 250)).toBeNull();
    expect(rideIntensityFrom(Infinity, 250)).toBeNull();
  });

  it('is null for a zero or negative power', () => {
    expect(rideIntensityFrom(0, 250)).toBeNull();
    expect(rideIntensityFrom(-10, 250)).toBeNull();
  });

  it('rejects an FTP too low to be a threshold', () => {
    // A placeholder FTP divides a real ride into a nonsense RI, and a wrong RI
    // is worse than a missing one — the distribution rules read it as gospel.
    expect(rideIntensityFrom(200, MIN_PLAUSIBLE_FTP - 1)).toBeNull();
    expect(rideIntensityFrom(200, 0)).toBeNull();
    expect(rideIntensityFrom(200, -250)).toBeNull();
    // EP chosen to land inside MAX_PLAUSIBLE_RI, so this isolates the FTP
    // floor rather than tripping the upper rail on the way past.
    expect(rideIntensityFrom(MIN_PLAUSIBLE_FTP, MIN_PLAUSIBLE_FTP)).toBe(1);
  });

  it('rejects an implausibly high RI rather than trusting a stale FTP', () => {
    expect(rideIntensityFrom(250 * MAX_PLAUSIBLE_RI, 250)).not.toBeNull();
    expect(rideIntensityFrom(250 * MAX_PLAUSIBLE_RI + 1, 250)).toBeNull();
  });
});

describe('rideIntensityFields', () => {
  it('dual-writes canonical and legacy, per the metrics freeze policy', () => {
    expect(rideIntensityFields(200, 250)).toEqual({
      ride_intensity: 0.8,
      intensity_factor: 0.8,
    });
  });

  it('is EMPTY, not null-valued, when RI cannot be computed', () => {
    // The whole point of the shape. These get spread into update payloads, and
    // an explicit null would erase a real RI that the FIT parser derived from
    // an actual power stream — exactly what happens when Strava merges into an
    // existing Garmin activity.
    const existing = { ride_intensity: 0.91, intensity_factor: 0.91 };
    expect({ ...existing, ...rideIntensityFields(200, null) }).toEqual(existing);
    expect({ ...existing, ...rideIntensityFields(null, 250) }).toEqual(existing);
    expect(rideIntensityFields(null, null)).toEqual({});
  });
});
