import { describe, it, expect } from 'vitest';
import { makeOutAndBack, isLoop } from '../outAndBack';

const LINE = [
  [-105.27, 40.01, 1600],
  [-105.25, 40.02, 1650],
  [-105.23, 40.03, 1700],
];
const WPS = [
  { id: 'a', position: [-105.27, 40.01] as [number, number], type: 'start' },
  { id: 'b', position: [-105.25, 40.02] as [number, number], type: 'waypoint' },
  { id: 'c', position: [-105.23, 40.03] as [number, number], type: 'end' },
];
const STATS = { distance_km: 10, elevation_gain_m: 100, elevation_loss_m: 20, duration_s: 1800 };

describe('makeOutAndBack', () => {
  it('appends the reversed line without repeating the turnaround', () => {
    const r = makeOutAndBack(LINE, WPS, STATS)!;
    expect(r.coordinates).toHaveLength(5);
    expect(r.coordinates[2]).toEqual(LINE[2]);
    expect(r.coordinates[4]).toEqual(LINE[0]);
  });

  it('mirrors the waypoints with unique ids, start to end', () => {
    const r = makeOutAndBack(LINE, WPS, STATS)!;
    expect(r.waypoints.map((w) => w.position)).toEqual([
      WPS[0].position,
      WPS[1].position,
      WPS[2].position,
      WPS[1].position,
      WPS[0].position,
    ]);
    expect(new Set(r.waypoints.map((w) => w.id)).size).toBe(5);
    expect(r.waypoints[0].type).toBe('start');
    expect(r.waypoints[2].type).toBe('waypoint');
    expect(r.waypoints[4].type).toBe('end');
  });

  it('doubles distance and time; climbing is outbound gain plus descent', () => {
    const r = makeOutAndBack(LINE, WPS, STATS)!;
    expect(r.stats.distance_km).toBe(20);
    expect(r.stats.duration_s).toBe(3600);
    expect(r.stats.elevation_gain_m).toBe(120);
  });

  it('refuses a loop (it would ride the loop twice)', () => {
    const loop = [...LINE, LINE[0]];
    expect(isLoop(loop)).toBe(true);
    expect(makeOutAndBack(loop, WPS, STATS)).toBeNull();
  });
});
