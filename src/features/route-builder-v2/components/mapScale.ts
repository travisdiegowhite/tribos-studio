/**
 * mapScale — scale-bar math for the Route Builder 2.0 map controls.
 *
 * TS port of v1's `calculateScale` (src/components/MapControls.jsx). Given a
 * latitude, zoom, and unit preference, returns a "nice" round distance and the
 * pixel width of the bar that represents it (clamped to 50–150px).
 */

const METERS_PER_PIXEL_AT_EQUATOR = 156543.03392;
const TARGET_WIDTH_PX = 100;

const NICE_METERS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
];
const NICE_FEET = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 5280, 10560, 26400, 52800, 105600, 264000,
  528000,
];

export interface ScaleResult {
  width: number;
  value: number;
  unit: 'm' | 'km' | 'ft' | 'mi';
}

export function calculateScale(
  latitude: number,
  zoom: number,
  useImperial: boolean,
): ScaleResult {
  const metersPerPixel =
    (METERS_PER_PIXEL_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  const targetMeters = metersPerPixel * TARGET_WIDTH_PX;

  let value: number;
  let unit: ScaleResult['unit'];
  let width: number;

  if (useImperial) {
    const targetFeet = targetMeters * 3.28084;
    let closestFeet = NICE_FEET[0];
    for (const nice of NICE_FEET) {
      if (Math.abs(nice - targetFeet) < Math.abs(closestFeet - targetFeet)) {
        closestFeet = nice;
      }
      if (nice > targetFeet * 1.5) break;
    }
    const closestMeters = closestFeet / 3.28084;
    width = closestMeters / metersPerPixel;
    if (closestFeet >= 5280) {
      value = closestFeet / 5280;
      unit = 'mi';
    } else {
      value = closestFeet;
      unit = 'ft';
    }
  } else {
    let closestMeters = NICE_METERS[0];
    for (const nice of NICE_METERS) {
      if (Math.abs(nice - targetMeters) < Math.abs(closestMeters - targetMeters)) {
        closestMeters = nice;
      }
      if (nice > targetMeters * 1.5) break;
    }
    width = closestMeters / metersPerPixel;
    if (closestMeters >= 1000) {
      value = closestMeters / 1000;
      unit = 'km';
    } else {
      value = closestMeters;
      unit = 'm';
    }
  }

  width = Math.max(50, Math.min(150, width));
  return { width, value, unit };
}

export default calculateScale;
