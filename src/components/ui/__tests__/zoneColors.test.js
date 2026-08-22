import { describe, it, expect } from 'vitest';
import { WORKOUT_LIBRARY } from '../../../data/workoutLibrary';
import {
  ROUTE_ZONE_COLORS,
  ZONE_NAMES,
  DEFAULT_ROUTE_COLOR,
  getRouteZoneColor,
} from '../zoneColors';

// The interval bands paint at this opacity over the elevation chart, which is
// where two zone colors are hardest to tell apart — see ElevationPanel.
const BAND_OPACITY = 0.18;
const CHART_BG = [255, 255, 255];
// The palest grade band the interval tint can land on (elevationGrade's flat end).
const GRADE_BG = [201, 216, 196];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The color a band actually renders as: zone tint composited over the chart. */
const composite = (hex, bg) =>
  toRgb(hex).map((v, i) => v * BAND_OPACITY + bg[i] * (1 - BAND_OPACITY));

/** CIE L*a*b* (D65) — perceptual, unlike raw RGB distance. */
function toLab([r, g, b]) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  let y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const deltaE = (hexA, hexB, bg) => {
  const [a, b] = [toLab(composite(hexA, bg)), toLab(composite(hexB, bg))];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

/** Every pair of zones the workout library puts in a single session. */
function coOccurringZonePairs() {
  const pairs = new Set();
  for (const workout of Object.values(WORKOUT_LIBRARY)) {
    if (['strength', 'core', 'flexibility'].includes(workout.category)) continue;
    const zones = new Set();
    const walk = (seg) => {
      if (!seg) return;
      if (Array.isArray(seg)) return seg.forEach(walk);
      if (seg.zone != null) zones.add(seg.zone);
      walk(seg.work);
      walk(seg.rest);
      walk(seg.main);
    };
    walk(workout.structure?.warmup);
    walk(workout.structure?.main);
    walk(workout.structure?.cooldown);
    const sorted = [...zones].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) pairs.add(`${sorted[i]}+${sorted[j]}`);
    }
  }
  return [...pairs].map((k) => k.split('+').map(Number));
}

describe('ROUTE_ZONE_COLORS', () => {
  it('gives every zone its own color', () => {
    // The overlay legend lists one row per distinct zone in the workout. Two
    // zones sharing a swatch (Z1/Z2 did, before this test) reads as a bug.
    const values = Object.values(ROUTE_ZONE_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('covers every zone the app can name', () => {
    expect(Object.keys(ROUTE_ZONE_COLORS).sort()).toEqual(Object.keys(ZONE_NAMES).sort());
  });

  it('keeps zones that share a workout apart as elevation bands', () => {
    const pairs = coOccurringZonePairs();
    // Sanity: the library really does pair zones up (Z1+Z2 alone is in 26).
    expect(pairs.length).toBeGreaterThan(10);

    for (const [a, b] of pairs) {
      for (const bg of [CHART_BG, GRADE_BG]) {
        const d = deltaE(ROUTE_ZONE_COLORS[a], ROUTE_ZONE_COLORS[b], bg);
        expect(
          d,
          `Z${a} (${ROUTE_ZONE_COLORS[a]}) vs Z${b} (${ROUTE_ZONE_COLORS[b]}) — ΔE ${d.toFixed(1)} at band opacity`,
        ).toBeGreaterThan(12);
      }
    }
  });

  it('ramps cool → hot with effort', () => {
    const hue = (hex) => {
      const [r, g, b] = toRgb(hex).map((v) => v / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(hue(ROUTE_ZONE_COLORS[1])).toBeGreaterThan(180); // recovery — blue
    expect(hue(ROUTE_ZONE_COLORS[2])).toBeGreaterThan(90); //  endurance — green
    expect(hue(ROUTE_ZONE_COLORS[2])).toBeLessThan(180);
    expect(hue(ROUTE_ZONE_COLORS[3])).toBeLessThan(70); //     tempo — yellow
    expect(hue(ROUTE_ZONE_COLORS[4])).toBeLessThan(30); //     threshold — coral
  });

  it('falls back to the default route color for an unknown zone', () => {
    expect(getRouteZoneColor(99)).toBe(DEFAULT_ROUTE_COLOR);
    expect(getRouteZoneColor(undefined)).toBe(DEFAULT_ROUTE_COLOR);
    expect(getRouteZoneColor(5)).toBe(ROUTE_ZONE_COLORS[5]);
  });
});
