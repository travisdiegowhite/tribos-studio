import { describe, it, expect } from 'vitest';
import {
  ridePolylineOf,
  rideStreamsOf,
  rideHasStreamTrack,
  rideHasGps,
  rideRouteCoords,
  sanitizedMaxHr,
  selectGpsRide,
} from './rideGeo';

/** Google's canonical sample polyline — three real points. */
const POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

describe('ridePolylineOf', () => {
  it('prefers map_summary_polyline, then summary_polyline, polyline, map.summary_polyline', () => {
    expect(ridePolylineOf({ map_summary_polyline: 'a', summary_polyline: 'b', polyline: 'c' })).toBe('a');
    expect(ridePolylineOf({ summary_polyline: 'b', polyline: 'c' })).toBe('b');
    expect(ridePolylineOf({ polyline: 'c', map: { summary_polyline: 'd' } })).toBe('c');
    expect(ridePolylineOf({ map: { summary_polyline: 'd' } })).toBe('d');
  });

  it('returns null when nothing is set', () => {
    expect(ridePolylineOf({})).toBeNull();
    expect(ridePolylineOf({ map_summary_polyline: '', map: null })).toBeNull();
    expect(ridePolylineOf(null)).toBeNull();
  });
});

describe('streams and GPS detection', () => {
  const track = { coords: [[-105.3, 40.0], [-105.31, 40.01]], power: [100, 120] };

  it('reads activity_streams and detects a drawable track', () => {
    expect(rideStreamsOf({ activity_streams: track })).toBe(track);
    expect(rideStreamsOf({ activity_streams: null })).toBeNull();
    expect(rideHasStreamTrack({ activity_streams: track })).toBe(true);
    expect(rideHasStreamTrack({ activity_streams: { coords: [[-105.3, 40.0]] } })).toBe(false);
    expect(rideHasStreamTrack({ activity_streams: { power: [1, 2] } })).toBe(false);
  });

  it('rideHasGps accepts a stream track or a polyline, and nothing else', () => {
    expect(rideHasGps({ activity_streams: track })).toBe(true);
    expect(rideHasGps({ summary_polyline: POLYLINE })).toBe(true);
    expect(rideHasGps({ activity_streams: { coords: [[-105.3, 40.0]] } })).toBe(false);
    expect(rideHasGps({})).toBe(false);
    expect(rideHasGps(undefined)).toBe(false);
  });

  it('decodes the polyline into [lng, lat] pairs', () => {
    const coords = rideRouteCoords({ summary_polyline: POLYLINE });
    expect(coords).toHaveLength(3);
    expect(coords[0][0]).toBeCloseTo(-120.2, 3); // lng
    expect(coords[0][1]).toBeCloseTo(38.5, 3); // lat
    expect(rideRouteCoords({})).toEqual([]);
  });
});

describe('sanitizedMaxHr', () => {
  it('drops zero, missing and FIT sentinel values', () => {
    expect(sanitizedMaxHr({ max_heartrate: 0 })).toBeNull();
    expect(sanitizedMaxHr({})).toBeNull();
    expect(sanitizedMaxHr({ max_heartrate: 65535 })).toBeNull();
    expect(sanitizedMaxHr({ max_heartrate: 250 })).toBeNull();
  });

  it('keeps a plausible reading', () => {
    expect(sanitizedMaxHr({ max_heartrate: 180 })).toBe(180);
    expect(sanitizedMaxHr({ max_heartrate: '172' })).toBe(172);
  });
});

describe('selectGpsRide', () => {
  const rides = [{ id: 'new' }, { id: 'mid' }, { id: 'old' }];

  it('falls back to the newest ride for a null or unknown id', () => {
    expect(selectGpsRide(rides, null)).toEqual({ ride: rides[0], index: 0, hasNewer: false, hasOlder: true });
    expect(selectGpsRide(rides, 'gone').ride).toBe(rides[0]);
  });

  it('reports the neighbours at the ends and in the middle', () => {
    expect(selectGpsRide(rides, 'mid')).toEqual({ ride: rides[1], index: 1, hasNewer: true, hasOlder: true });
    expect(selectGpsRide(rides, 'old')).toEqual({ ride: rides[2], index: 2, hasNewer: true, hasOlder: false });
  });

  it('handles an empty list', () => {
    expect(selectGpsRide([], 'new')).toEqual({ ride: null, index: -1, hasNewer: false, hasOlder: false });
  });
});
