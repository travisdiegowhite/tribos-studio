/**
 * unitFormInput — shared helpers for the generate-form distance/elevation
 * NumberInputs when imperial units are active.
 *
 * The form state stays canonical (km / m); these convert at the input
 * boundary so the user types miles/feet while the stored value remains
 * km/m. Used by both FormPanel (mobile) and GenerateBar (desktop).
 */

import { convertDistance } from '../../../utils/units.jsx';

type NumOrEmpty = number | '';

/** Canonical km → the value shown in the input (miles when imperial). */
export function toDisplayDistance(km: NumOrEmpty, isImperial: boolean): NumOrEmpty {
  if (km === '') return '';
  return isImperial ? Math.round(convertDistance.kmToMiles(km) * 10) / 10 : km;
}

/** Input value (miles when imperial) → canonical km for the store. */
export function fromDisplayDistance(v: number | string | null | undefined, isImperial: boolean): NumOrEmpty {
  if (v === '' || v == null) return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '';
  return isImperial ? convertDistance.milesToKm(n) : n;
}

/** Canonical m → the value shown in the input (feet when imperial). */
export function toDisplayElevation(m: NumOrEmpty, isImperial: boolean): NumOrEmpty {
  if (m === '') return '';
  return isImperial ? Math.round(convertDistance.mToFt(m)) : m;
}

/** Input value (feet when imperial) → canonical m for the store. */
export function fromDisplayElevation(v: number | string | null | undefined, isImperial: boolean): NumOrEmpty {
  if (v === '' || v == null) return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '';
  return isImperial ? convertDistance.ftToM(n) : n;
}

export const distanceUnit = (isImperial: boolean): string => (isImperial ? 'mi' : 'km');
export const elevationUnit = (isImperial: boolean): string => (isImperial ? 'ft' : 'm');

export const distanceBounds = (isImperial: boolean) =>
  isImperial ? { min: 1, max: 300, step: 2 } : { min: 1, max: 500, step: 5 };

export const elevationBounds = (isImperial: boolean) =>
  isImperial ? { min: 0, max: 30000, step: 100 } : { min: 0, max: 10000, step: 50 };
