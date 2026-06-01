import { describe, it, expect } from 'vitest';
import {
  buildIntervalRouteFeatureCollection,
  categoryToGoal,
  cueColor,
  type WorkoutCue,
} from '../intervalOverlay';
import { ROUTE_ZONE_COLORS, DEFAULT_ROUTE_COLOR } from '../../../../components/ui/zoneColors';
import { haversineKm } from '../../../../utils/distanceUnits';
import type { Coordinate } from '../../../../types/geo';

const coords: Coordinate[] = [
  [-105.0, 40.0],
  [-105.01, 40.0],
  [-105.02, 40.0],
  [-105.03, 40.0],
  [-105.04, 40.0],
];

function totalKm(c: Coordinate[]): number {
  let t = 0;
  for (let i = 1; i < c.length; i++) t += haversineKm(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]);
  return t;
}

describe('cueColor', () => {
  it('maps zones to route colors and falls back', () => {
    expect(cueColor(4)).toBe(ROUTE_ZONE_COLORS[4]);
    expect(cueColor(null)).toBe(DEFAULT_ROUTE_COLOR);
    expect(cueColor(99)).toBe(DEFAULT_ROUTE_COLOR);
  });
});

describe('categoryToGoal', () => {
  it('maps workout categories onto RB2 goals', () => {
    expect(categoryToGoal('recovery')).toBe('recovery');
    expect(categoryToGoal('endurance')).toBe('endurance');
    expect(categoryToGoal('tempo')).toBe('tempo');
    expect(categoryToGoal('climbing')).toBe('tempo');
    expect(categoryToGoal('threshold')).toBe('threshold');
    expect(categoryToGoal('vo2max')).toBe('threshold');
    expect(categoryToGoal('something-unknown')).toBe('endurance');
    expect(categoryToGoal(null)).toBe('endurance');
  });
});

describe('buildIntervalRouteFeatureCollection', () => {
  it('returns an empty collection for missing inputs', () => {
    expect(buildIntervalRouteFeatureCollection(null, null).features).toHaveLength(0);
    expect(buildIntervalRouteFeatureCollection(coords, []).features).toHaveLength(0);
    expect(buildIntervalRouteFeatureCollection([coords[0]], [{ type: 'x', zone: 1, startDistance: 0, endDistance: 9 }]).features).toHaveLength(0);
  });

  it('paints the whole route one color for a single covering cue', () => {
    const cues: WorkoutCue[] = [{ type: 'steady', zone: 4, startDistance: 0, endDistance: 999 }];
    const fc = buildIntervalRouteFeatureCollection(coords, cues);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties?.color).toBe(ROUTE_ZONE_COLORS[4]);
    // Covers every vertex.
    expect((fc.features[0].geometry as GeoJSON.LineString).coordinates).toHaveLength(coords.length);
  });

  it('splits into contiguous colored runs at the cue boundary', () => {
    const total = totalKm(coords);
    const mid = total / 2;
    const cues: WorkoutCue[] = [
      { type: 'warmup', zone: 1, startDistance: 0, endDistance: mid },
      { type: 'interval-hard', zone: 5, startDistance: mid, endDistance: total + 1 },
    ];
    const fc = buildIntervalRouteFeatureCollection(coords, cues);
    expect(fc.features.length).toBeGreaterThanOrEqual(2);

    // Colors come from the two zones.
    const colors = fc.features.map((f) => f.properties?.color);
    expect(colors).toContain(ROUTE_ZONE_COLORS[1]);
    expect(colors).toContain(ROUTE_ZONE_COLORS[5]);

    // Runs are contiguous: each run's last vertex equals the next run's first.
    for (let i = 1; i < fc.features.length; i++) {
      const prev = (fc.features[i - 1].geometry as GeoJSON.LineString).coordinates;
      const cur = (fc.features[i].geometry as GeoJSON.LineString).coordinates;
      expect(cur[0]).toEqual(prev[prev.length - 1]);
    }
  });
});
