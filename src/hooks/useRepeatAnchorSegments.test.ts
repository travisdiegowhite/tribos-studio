import { describe, it, expect } from 'vitest';
import { orderAnchorSegments } from './useRepeatAnchorSegments';

const line = { type: 'LineString', coordinates: [[-105.2, 40.0], [-105.21, 40.01]] };

describe('orderAnchorSegments', () => {
  it('keeps drawable segments, most-ridden first, and drops retired ones when that column exists', () => {
    const rows = [
      { id: 'a', display_name: 'Flat 14.8km', ride_count: 7, last_ridden_at: '2026-08-01', geojson: line },
      { id: 'b', display_name: 'Rolling 14.7km', ride_count: 12, last_ridden_at: '2026-09-01', geojson: line },
      { id: 'c', display_name: 'Old', ride_count: 20, retired_at: '2026-05-01', geojson: line },
      { id: 'd', display_name: 'No geometry', ride_count: 9, geojson: null },
      { id: 'e', display_name: 'One point', ride_count: 9, geojson: { coordinates: [[1, 2]] } },
      { id: 'f', custom_name: 'Named by me', auto_name: 'auto', ride_count: 7, last_ridden_at: '2026-09-05', geojson: line },
    ];
    const out = orderAnchorSegments(rows);
    expect(out.map((s) => s.id)).toEqual(['b', 'f', 'a']);
    expect(out[1].display_name).toBe('Named by me');
    expect(out[0].distance_meters).toBeNull();
  });

  it('works on a row shape without any migration-110 columns', () => {
    const out = orderAnchorSegments([{ id: 'x', auto_name: 'Climb', ride_count: '3', distance_meters: '1200', geojson: line }]);
    expect(out).toHaveLength(1);
    expect(out[0].ride_count).toBe(3);
    expect(out[0].distance_meters).toBe(1200);
  });
});
