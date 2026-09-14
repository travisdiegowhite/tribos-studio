import { describe, it, expect } from 'vitest';
import {
  alignEffort,
  anchorFromRide,
  anchorFromSegment,
  createRepeatsScan,
  effortPointAt,
  findRepeats,
  repeatBests,
  repeatColor,
  rideTrackCoords,
  sanitizedStreams,
  sliceStats,
  type LngLat,
} from './rideRepeats';

// A ~6 km loop near Boulder, one vertex every ~10 m so streams read as measured.
const CENTER: LngLat = [-105.25, 40.02];
const LOOP_N = 600;
function loop(offsetMeters = 0): LngLat[] {
  const out: LngLat[] = [];
  const rLat = 0.0045 + offsetMeters / 111320;
  const rLng = rLat / Math.cos((CENTER[1] * Math.PI) / 180);
  for (let i = 0; i <= LOOP_N; i++) {
    const t = (i / LOOP_N) * Math.PI * 2;
    out.push([CENTER[0] + rLng * Math.cos(t), CENTER[1] + rLat * Math.sin(t)]);
  }
  return out;
}

function streamsFor(coords: LngLat[], watts: number, speedMps: number) {
  return {
    coords,
    power: coords.map(() => watts),
    heartRate: coords.map(() => 140),
    speed: coords.map(() => speedMps),
    elevation: coords.map((_, i) => 1600 + Math.sin(i / 40) * 20),
  };
}

const anchorRide = {
  id: 'a',
  name: 'Lookout loop',
  start_date: '2026-09-10T14:00:00Z',
  activity_streams: streamsFor(loop(), 200, 8),
};
const sameLoopFaster = {
  id: 'b',
  name: 'Lookout loop again',
  start_date: '2026-09-03T14:00:00Z',
  activity_streams: streamsFor(loop(4), 260, 10),
};
const sameLoopReversed = {
  id: 'c',
  name: 'Backwards',
  start_date: '2026-08-27T14:00:00Z',
  activity_streams: streamsFor([...loop(3)].reverse(), 180, 7),
};
const polylineOnly = {
  id: 'd',
  name: 'Strava import',
  start_date: '2026-08-20T14:00:00Z',
  // Geometry-only streams, as the polyline backfill writes them: coords and
  // nothing measured. Same standing as a summary-polyline-only import.
  activity_streams: { coords: loop(2) },
};
const farAway = {
  id: 'e',
  name: 'Elsewhere',
  start_date: '2026-08-13T14:00:00Z',
  activity_streams: streamsFor(loop().map(([lng, lat]) => [lng + 1, lat] as LngLat), 200, 8),
};
// A ride that includes the loop plus a long tail: covers the anchor, but the
// anchor covers only a fraction of it.
const longerRide = (() => {
  const l = loop(1);
  const tail: LngLat[] = [];
  const [lng0, lat0] = l[l.length - 1];
  for (let i = 1; i <= 900; i++) tail.push([lng0 + i * 0.0001, lat0]);
  return { id: 'f', name: 'Loop plus extra', start_date: '2026-08-06T14:00:00Z', activity_streams: streamsFor([...l, ...tail], 210, 8) };
})();

describe('anchors', () => {
  it('builds a ride anchor from stream coords with its length', () => {
    const a = anchorFromRide(anchorRide)!;
    expect(a.kind).toBe('ride');
    expect(a.coords).toHaveLength(LOOP_N + 1);
    expect(a.lengthKm).toBeGreaterThan(2.5);
    expect(a.lengthKm).toBeLessThan(4);
    expect(anchorFromRide({ id: 'x' })).toBeNull();
  });

  it('builds a segment anchor from geojson and rejects bad geometry', () => {
    const seg = anchorFromSegment({ id: 's', display_name: 'Climb', geojson: { coordinates: loop().slice(0, 100) } })!;
    expect(seg.kind).toBe('segment');
    expect(seg.name).toBe('Climb');
    expect(seg.coords).toHaveLength(100);
    expect(anchorFromSegment({ id: 's', geojson: { coordinates: [[1, 2]] } })).toBeNull();
    expect(anchorFromSegment(null)).toBeNull();
  });
});

describe('findRepeats — ride anchor', () => {
  const anchor = anchorFromRide(anchorRide);
  const efforts = findRepeats(anchor, [farAway, sameLoopReversed, anchorRide, polylineOnly, sameLoopFaster, longerRide]);

  it('keeps the same loop in either direction and a geometry-only repeat, newest first', () => {
    expect(efforts.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops rides elsewhere and rides the anchor does not mutually cover', () => {
    expect(efforts.find((e) => e.id === 'e')).toBeUndefined();
    expect(efforts.find((e) => e.id === 'f')).toBeUndefined();
  });

  it('aligns a reversed traversal to run the anchor way', () => {
    const c = efforts.find((e) => e.id === 'c')!;
    expect(c.direction).toBe('reverse');
    // The slice starts near the anchor start once turned around.
    const [lng, lat] = c.coords[0];
    const [alng, alat] = anchor!.coords[0];
    expect(Math.abs(lng - alng)).toBeLessThan(0.0005);
    expect(Math.abs(lat - alat)).toBeLessThan(0.0005);
    // Rows ascend from 0.
    expect(c.rows![0].x).toBe(0);
    expect(c.rows![c.rows!.length - 1].x).toBeGreaterThan(2.5);
  });

  it('marks geometry-only rides as unmeasured with no rows and no time', () => {
    const d = efforts.find((e) => e.id === 'd')!;
    expect(d.measured).toBe(false);
    expect(d.rows).toBeNull();
    expect(d.stats.durationSeconds).toBeNull();
    expect(d.stats.distanceKm).toBeGreaterThan(2.5);
  });

  it('integrates time from speed and averages power per effort', () => {
    const a = efforts.find((e) => e.id === 'a')!;
    const b = efforts.find((e) => e.id === 'b')!;
    expect(a.stats.avgPower).toBe(200);
    expect(b.stats.avgPower).toBe(260);
    expect(a.stats.avgSpeedKmh).toBeCloseTo(28.8, 1);
    // 8 m/s over ~3.1 km ≈ 390 s; 10 m/s is faster.
    expect(a.stats.durationSeconds).toBeGreaterThan(300);
    expect(b.stats.durationSeconds!).toBeLessThan(a.stats.durationSeconds!);
  });

  it('names the fastest and strongest efforts', () => {
    expect(repeatBests(efforts)).toEqual({ fastestId: 'b', strongestId: 'b' });
    expect(repeatBests([])).toEqual({ fastestId: null, strongestId: null });
  });
});

describe('findRepeats — segment anchor', () => {
  it('finds rides that pass along the segment and slices them to it', () => {
    const segCoords = loop().slice(100, 250);
    const anchor = anchorFromSegment({ id: 's', display_name: 'Arc', geojson: { coordinates: segCoords } });
    const efforts = findRepeats(anchor, [anchorRide, longerRide, farAway]);
    expect(efforts.map((e) => e.id).sort()).toEqual(['a', 'f']);
    const f = efforts.find((e) => e.id === 'f')!;
    expect(f.entryIdx).toBeGreaterThan(80);
    expect(f.exitIdx).toBeLessThan(270);
    expect(f.stats.distanceKm).toBeCloseTo(anchor!.lengthKm, 1);
  });
});

describe('alignEffort and lookups', () => {
  it('returns null without usable indices', () => {
    const track = loop();
    expect(alignEffort(anchorRide, track, { coverage: 1, direction: 'forward', entrySourceIdx: null, exitSourceIdx: 5 })).toBeNull();
    expect(alignEffort(anchorRide, track, { coverage: 1, direction: 'forward', entrySourceIdx: 5, exitSourceIdx: 5 })).toBeNull();
  });

  it('finds the point on an effort at a distance along the anchor', () => {
    const anchor = anchorFromRide(anchorRide);
    const [a] = findRepeats(anchor, [anchorRide]);
    const mid = effortPointAt(a, a.stats.distanceKm / 2)!;
    expect(mid.row).not.toBeNull();
    expect(mid.row!.x).toBeCloseTo(a.stats.distanceKm / 2, 1);
    const [d] = findRepeats(anchor, [polylineOnly]);
    const p = effortPointAt(d, 1)!;
    expect(p.row).toBeNull();
    expect(p.coord).toHaveLength(2);
  });

  it('computes slice stats without streams as distance only', () => {
    const s = sliceStats({ id: 'x' }, loop(), 0, 50);
    expect(s.durationSeconds).toBeNull();
    expect(s.avgPower).toBeNull();
    expect(s.distanceKm).toBeGreaterThan(0);
  });

  it('cycles the palette', () => {
    expect(repeatColor(0)).toBe('#2A8C82');
    expect(repeatColor(8)).toBe('#2A8C82');
    expect(repeatColor(1)).not.toBe(repeatColor(2));
  });
});

describe('real-data hardening', () => {
  it('drops an impossible coordinate from every parallel stream and keeps them aligned', () => {
    const coords = loop().slice(0, 50) as Array<LngLat | unknown>;
    coords.splice(10, 0, [-2.43, 151.1]); // lat 151: the kind of point real rows carry
    const ride = {
      id: 'bad',
      activity_streams: { coords, power: coords.map((_, i) => i), speed: coords.map(() => 8) },
    };
    const clean = sanitizedStreams(ride)!;
    expect(clean.coords).toHaveLength(50);
    expect(clean.power).toHaveLength(50);
    // Index 10 was the bad point; the power that followed it moves up one slot.
    expect(clean.power![10]).toBe(11);
    expect(rideTrackCoords(ride)).toHaveLength(50);
    expect(sanitizedStreams(ride)).toBe(clean); // cached per row
  });

  it('treats a stream whose coords are not an array as no track', () => {
    expect(sanitizedStreams({ id: 'x', activity_streams: { coords: 'nope', power: [1, 2] } })).toBeNull();
    expect(rideTrackCoords({ id: 'x', activity_streams: { coords: {} } })).toEqual([]);
  });

  it('skips a much longer or much shorter ride before the matcher runs', () => {
    const anchor = anchorFromRide(anchorRide)!;
    const tiny = { id: 't', start_date: '2026-09-01T00:00:00Z', activity_streams: streamsFor(loop().slice(0, 120), 200, 8) };
    expect(findRepeats(anchor, [tiny])).toEqual([]);
  });

  it('scans in resumable slices and lands on the same answer as one pass', () => {
    const anchor = anchorFromRide(anchorRide);
    const rides = [farAway, sameLoopReversed, anchorRide, polylineOnly, sameLoopFaster, longerRide];
    const scan = createRepeatsScan(anchor, rides);
    expect(scan.total).toBe(rides.length);
    let steps = 0;
    while (!scan.step(0)) steps++; // a zero budget processes one ride per step
    expect(steps).toBeGreaterThanOrEqual(rides.length - 1);
    expect(scan.done).toBe(true);
    expect(scan.efforts.map((e) => e.id)).toEqual(findRepeats(anchor, rides).map((e) => e.id));
  });

  it('skips a row that throws instead of aborting the scan', () => {
    const anchor = anchorFromRide(anchorRide);
    const poison = {
      id: 'p',
      start_date: '2026-08-01T00:00:00Z',
      get activity_streams(): unknown {
        throw new Error('corrupt');
      },
    };
    const efforts = findRepeats(anchor, [poison, sameLoopFaster]);
    expect(efforts.map((e) => e.id)).toEqual(['b']);
  });

  it('reports no work for a missing anchor', () => {
    const scan = createRepeatsScan(null, [anchorRide]);
    expect(scan.done).toBe(true);
    expect(scan.total).toBe(0);
    expect(scan.step()).toBe(true);
  });
});
