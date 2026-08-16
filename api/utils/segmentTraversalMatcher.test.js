import { describe, it, expect } from 'vitest';
import {
  extractTrack,
  extractSubTrackStats,
  analyzeCoverageForActivity,
} from './segmentTraversalMatcher.js';

// ============================================================================
// FIXTURES
// ============================================================================

const BASE_LAT = 40.0;
const BASE_LNG = -105.25;
const M_PER_DEG_LAT = 111320;
const cosLat = Math.cos(BASE_LAT * (Math.PI / 180));

function at(eastM, northM = 0) {
  return [
    BASE_LNG + eastM / (M_PER_DEG_LAT * cosLat),
    BASE_LAT + northM / M_PER_DEG_LAT,
  ];
}

function road(lengthM, spacingM, northM = 0) {
  const pts = [];
  for (let d = 0; d <= lengthM; d += spacingM) pts.push(at(d, northM));
  return pts;
}

/**
 * Recording client in the style of api/evidence-weekly.test.js, extended with
 * queued responses so a call sequence can be scripted.
 */
function recordingClient(responses = {}) {
  const calls = [];
  const writes = [];

  const client = {
    from(table) {
      const chain = { table, ops: [] };
      calls.push(chain);

      const result = () => {
        const queue = responses[table];
        if (Array.isArray(queue)) return queue.shift() ?? { data: null, error: null };
        return queue ?? { data: [], error: null };
      };

      const builder = {};
      for (const m of ['select', 'eq', 'is', 'or', 'gte', 'lte', 'lt', 'not', 'order', 'limit']) {
        builder[m] = (...args) => {
          chain.ops.push({ m, args });
          return builder;
        };
      }
      builder.upsert = (row, opts) => {
        writes.push({ table, kind: 'upsert', row, opts });
        chain.ops.push({ m: 'upsert', args: [row] });
        return builder;
      };
      builder.update = (row) => {
        writes.push({ table, kind: 'update', row });
        chain.ops.push({ m: 'update', args: [row] });
        return builder;
      };
      builder.maybeSingle = () => Promise.resolve(result());
      builder.single = () => Promise.resolve(result());
      builder.then = (resolve) => Promise.resolve(result()).then(resolve);
      return builder;
    },
  };

  return { client, calls, writes };
}

// ============================================================================
// TRACK EXTRACTION
// ============================================================================

describe('extractTrack', () => {
  it('prefers coordinate streams and reports the measured tier', () => {
    const coords = road(500, 100);
    const { coords: out, tier } = extractTrack({ activity_streams: { coords } });
    expect(out).toBe(coords);
    expect(tier).toBe('measured');
  });

  it('falls back to the polyline as geometry_only, converting lat/lng order', () => {
    // decodePolyline yields [lat, lng]; activity_streams convention is [lng, lat].
    const { coords, tier } = extractTrack({
      activity_streams: null,
      // "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is the canonical Google example polyline.
      map_summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    });
    expect(tier).toBe('geometry_only');
    expect(coords.length).toBeGreaterThanOrEqual(2);
    // Longitudes first, and plausible as longitudes.
    for (const [lng, lat] of coords) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it('reports no track when neither source is usable', () => {
    expect(extractTrack({}).coords).toEqual([]);
    expect(extractTrack({ activity_streams: { coords: [] } }).tier).toBeNull();
  });
});

// ============================================================================
// SUB-TRACK STATISTICS
// ============================================================================

describe('extractSubTrackStats', () => {
  const coords = road(1000, 100); // 11 points
  const streams = {
    coords,
    speed: coords.map(() => 10), // 10 m/s = 36 km/h
    power: coords.map((_, i) => 200 + i),
    heartRate: coords.map(() => 150),
    cadence: coords.map(() => 90),
  };

  it('derives real metrics for the covered slice', () => {
    const stats = extractSubTrackStats(streams, 0, 10);
    expect(stats.distanceMeters).toBeCloseTo(1000, -1);
    // 1000m at 10 m/s
    expect(stats.durationSeconds).toBeCloseTo(100, -1);
    expect(stats.avgSpeedKmh).toBeCloseTo(36, 0);
    expect(stats.avgHR).toBe(150);
    expect(stats.avgCadence).toBe(90);
    expect(stats.maxPower).toBe(210);
  });

  it('measures only the requested slice, not the whole ride', () => {
    const half = extractSubTrackStats(streams, 0, 5);
    expect(half.distanceMeters).toBeCloseTo(500, -1);
    expect(half.durationSeconds).toBeCloseTo(50, -1);
  });

  it('accepts reversed indices', () => {
    expect(extractSubTrackStats(streams, 10, 0).distanceMeters)
      .toBe(extractSubTrackStats(streams, 0, 10).distanceMeters);
  });

  it('returns a null duration rather than inventing one when speed is absent', () => {
    // This is the regression that mattered: the old pipeline substituted
    // 5 m/s here and wrote the result to the DB as a real effort.
    const stats = extractSubTrackStats({ coords }, 0, 10);
    expect(stats.durationSeconds).toBeNull();
    expect(stats.avgSpeedKmh).toBeNull();
    expect(stats.distanceMeters).toBeCloseTo(1000, -1);
  });

  it('returns nulls for degenerate slices', () => {
    expect(extractSubTrackStats(streams, 3, 3).durationSeconds).toBeNull();
    expect(extractSubTrackStats(null, 0, 5).distanceMeters).toBeNull();
  });
});

// ============================================================================
// COVERAGE ANALYSIS
// ============================================================================

describe('analyzeCoverageForActivity', () => {
  const segmentGeo = { type: 'LineString', coordinates: road(2000, 100) };

  const rideOnSegment = {
    id: 'act-1',
    user_id: 'user-1',
    start_date: '2026-06-01T10:00:00Z',
    distance: 5000,
    duplicate_of: null,
    map_summary_polyline: null,
    activity_streams: {
      coords: road(5000, 100),
      speed: road(5000, 100).map(() => 8),
    },
  };

  it('records a traversal when the ride runs along the segment', async () => {
    const { client, writes } = recordingClient({
      training_segment_rides: [{ data: null, error: null }, { data: null, error: null }],
    });

    const res = await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: rideOnSegment,
      segments: [{ id: 'seg-1', geojson: segmentGeo, distance_meters: 2000, data_quality_tier: 'measured' }],
    });

    expect(res.success).toBe(true);
    expect(res.traversals).toBe(1);
    expect(res.segmentIds).toEqual(['seg-1']);

    const upsert = writes.find((w) => w.kind === 'upsert');
    expect(upsert.row.match_method).toBe('coverage');
    expect(upsert.row.data_quality_tier).toBe('measured');
    // A measured ride yields a genuine duration for a traversal the detector
    // never emitted — this is the point of coverage matching.
    expect(upsert.row.duration_seconds).toBeGreaterThan(0);
    expect(upsert.opts).toEqual({ onConflict: 'segment_id,activity_id' });
  });

  it('does not record a traversal for a segment the ride never touched', async () => {
    const { client, writes } = recordingClient();
    const elsewhere = { type: 'LineString', coordinates: road(2000, 100, 5000) };

    const res = await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: rideOnSegment,
      segments: [{ id: 'seg-far', geojson: elsewhere, distance_meters: 2000 }],
    });

    expect(res.traversals).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('writes a null duration when the track carries no speed stream', async () => {
    // The regression this whole change exists to prevent: geometry with no
    // measurements used to be given a fabricated 18 km/h duration, which the
    // comparison panel then displayed as one of the rider's past efforts.
    // The traversal is still recorded — it is true that they rode here.
    const { client, writes } = recordingClient({
      training_segment_rides: [{ data: null, error: null }, { data: null, error: null }],
    });

    const res = await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: { ...rideOnSegment, activity_streams: { coords: road(5000, 100) } },
      segments: [{ id: 'seg-1', geojson: segmentGeo, distance_meters: 2000 }],
    });

    expect(res.traversals).toBe(1);
    const upsert = writes.find((w) => w.kind === 'upsert');
    expect(upsert.row.duration_seconds).toBeNull();
    expect(upsert.row.avg_speed).toBeNull();
  });

  it('enriches rather than overwrites an existing detector row', async () => {
    // A blind upsert would replace the detector's real metrics with the
    // coverage slice's, or with nulls.
    const { client, writes } = recordingClient({
      training_segment_rides: [
        { data: { id: 'ride-1', match_method: 'detector', duration_seconds: 412 }, error: null },
        { data: null, error: null },
      ],
    });

    await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: rideOnSegment,
      segments: [{ id: 'seg-1', geojson: segmentGeo, distance_meters: 2000 }],
    });

    expect(writes.find((w) => w.kind === 'upsert')).toBeUndefined();
    const update = writes.find((w) => w.kind === 'update');
    expect(update).toBeDefined();
    expect(Object.keys(update.row).sort()).toEqual(['coverage_ratio', 'direction']);
  });

  it('skips duplicate activities', async () => {
    const { client, writes } = recordingClient();
    const res = await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: { ...rideOnSegment, duplicate_of: 'act-original' },
      segments: [{ id: 'seg-1', geojson: segmentGeo, distance_meters: 2000 }],
    });

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('duplicate');
    expect(writes).toHaveLength(0);
  });

  it('only considers the user\'s own non-retired segments', async () => {
    const { client, calls } = recordingClient({ training_segments: { data: [], error: null } });

    await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: rideOnSegment,
      // no segments passed → the function must query for them
    });

    const segQuery = calls.find((c) => c.table === 'training_segments');
    expect(segQuery).toBeDefined();
    expect(segQuery.ops).toContainEqual({ m: 'eq', args: ['user_id', 'user-1'] });
    expect(segQuery.ops).toContainEqual({ m: 'is', args: ['retired_at', null] });
  });

  it('computes without writing in dry-run mode', async () => {
    const { client, writes } = recordingClient();
    const res = await analyzeCoverageForActivity('act-1', 'user-1', {
      supabase: client,
      activity: rideOnSegment,
      segments: [{ id: 'seg-1', geojson: segmentGeo, distance_meters: 2000 }],
      dryRun: true,
    });

    expect(res.traversals).toBe(1);
    expect(writes).toHaveLength(0);
  });
});
