/**
 * Magnitude → fraction mapping for climbing and distance mutations.
 *
 * Per T2.2 spec §"shared/magnitudes.ts", these are the locked v1 values.
 * They are gut-feel numbers — beta data will tell us if "moderate" feels
 * like 30% or 20% in practice.
 *
 * TODO(post-beta): tune from telemetry once we have ~100 routes per
 * magnitude level.
 */

import type { MagnitudeLevel } from '../../types';

export const MAGNITUDE_TO_FRACTION: Readonly<Record<MagnitudeLevel, number>> = {
  small: 0.15,
  moderate: 0.3,
  large: 0.5,
};

export function fractionForMagnitude(m: MagnitudeLevel): number {
  return MAGNITUDE_TO_FRACTION[m];
}
