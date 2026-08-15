import { describe, it, expect } from 'vitest';
import {
  classifyForRetirement,
  findDuplicateClusters,
  chooseRepresentative,
  pickCustomName,
  mergeCluster,
} from './segmentLibraryMerge.js';

const BASE_LAT = 40.0;
const BASE_LNG = -105.25;
const M_PER_DEG_LAT = 111320;
const cosLat = Math.cos(BASE_LAT * (Math.PI / 180));

function at(eastM, northM = 0) {
  return [BASE_LNG + eastM / (M_PER_DEG_LAT * cosLat), BASE_LAT + northM / M_PER_DEG_LAT];
}

function road(lengthM, spacingM, northM = 0) {
  const pts = [];
  for (let d = 0; d <= lengthM; d += spacingM) pts.push(at(d, northM));
  return pts;
}

function seg(id, coords, extra = {}) {
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][0] - coords[i - 1][0]) * cosLat * M_PER_DEG_LAT;
    const dy = (coords[i][1] - coords[i - 1][1]) * M_PER_DEG_LAT;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return {
    id,
    geojson: { type: 'LineString', coordinates: coords },
    distance_meters: Math.round(dist),
    data_quality_tier: 'measured',
    ride_count: 1,
    created_at: '2026-01-01T00:00:00Z',
    custom_name: null,
    bbox_min_lat: Math.min(...lats),
    bbox_max_lat: Math.max(...lats),
    bbox_min_lng: Math.min(...lngs),
    bbox_max_lng: Math.max(...lngs),
    ...extra,
  };
}

// ============================================================================

describe('classifyForRetirement', () => {
  it('retires a segment longer than the ceiling', () => {
    const v = classifyForRetirement({ distance_meters: 48431 }, [50000]);
    expect(v).toEqual({ retire: true, reason: 'oversized' });
  });

  it('retires a segment that is most of every ride it appears in', () => {
    // The production case: a 4km "segment" that is 90% of each of its rides.
    const v = classifyForRetirement({ distance_meters: 4000 }, [4400, 4200, 4500]);
    expect(v).toEqual({ retire: true, reason: 'whole_ride' });
  });

  it('keeps a segment that is a small part of at least one ride', () => {
    const v = classifyForRetirement({ distance_meters: 4000 }, [4400, 40000]);
    expect(v.retire).toBe(false);
  });

  it('keeps a normal segment with no linked rides', () => {
    expect(classifyForRetirement({ distance_meters: 2000 }, []).retire).toBe(false);
  });
});

describe('findDuplicateClusters', () => {
  it('groups the same road cut at different boundaries', () => {
    // Exactly the fragmentation this pass repairs.
    const full = road(3000, 50);
    const segments = [
      seg('a', full),
      seg('b', full.slice(2, -2)),
      seg('c', full.slice(3, -1)),
      seg('far', road(3000, 50, 5000)),
    ];

    const clusters = findDuplicateClusters(segments);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map(s => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not group parallel roads', () => {
    const segments = [seg('a', road(2000, 50)), seg('b', road(2000, 50, 150))];
    expect(findDuplicateClusters(segments)).toHaveLength(0);
  });

  it('returns nothing for a library with no duplicates', () => {
    const segments = [
      seg('a', road(2000, 50)),
      seg('b', road(2000, 50, 3000)),
      seg('c', road(2000, 50, 6000)),
    ];
    expect(findDuplicateClusters(segments)).toHaveLength(0);
  });
});

describe('chooseRepresentative', () => {
  it('prefers measured geometry over geometry-only', () => {
    const coords = road(2000, 50);
    const cluster = [
      seg('geo', coords, { data_quality_tier: 'geometry_only', ride_count: 9 }),
      seg('meas', coords, { data_quality_tier: 'measured', ride_count: 1 }),
    ];
    expect(chooseRepresentative(cluster).id).toBe('meas');
  });

  it('prefers denser geometry among equals', () => {
    const cluster = [
      seg('sparse', road(2000, 400)),
      seg('dense', road(2000, 25)),
    ];
    expect(chooseRepresentative(cluster).id).toBe('dense');
  });

  it('carries a custom name from any member of the cluster', () => {
    const coords = road(2000, 50);
    const cluster = [
      seg('a', coords),
      seg('b', coords, { custom_name: 'Lee Hill' }),
    ];
    expect(pickCustomName(cluster)).toBe('Lee Hill');
  });
});

// ============================================================================

function mergeClient(repRows, loserRows) {
  const deleted = [];
  const updated = [];

  const client = {
    from(table) {
      const builder = {
        _table: table,
        _filters: {},
        select() { return builder; },
        eq(col, val) { builder._filters[col] = val; return builder; },
        in(col, vals) { builder._filters[col] = vals; return builder; },
        update(row) { builder._update = row; return builder; },
        delete() { builder._delete = true; return builder; },
        then(resolve) {
          if (builder._delete) {
            deleted.push({ table, filters: builder._filters });
            return Promise.resolve({ error: null }).then(resolve);
          }
          if (builder._update) {
            updated.push({ table, row: builder._update, filters: builder._filters });
            return Promise.resolve({ error: null }).then(resolve);
          }
          if (table === 'training_segment_rides') {
            const data = builder._filters.segment_id === repRows.segmentId
              ? repRows.rows
              : loserRows;
            return Promise.resolve({ data, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  };

  return { client, deleted, updated };
}

describe('mergeCluster', () => {
  it('re-points traversals that the representative does not already have', async () => {
    const { client, updated } = mergeClient(
      { segmentId: 'rep', rows: [] },
      [{ id: 'r1', segment_id: 'lose', activity_id: 'act-1', match_method: 'coverage', duration_seconds: null }]
    );

    const out = await mergeCluster(client, 'rep', ['lose']);
    expect(out.repointed).toBe(1);
    expect(out.discarded).toBe(0);
    expect(updated).toContainEqual(
      expect.objectContaining({ table: 'training_segment_rides', row: { segment_id: 'rep' } })
    );
  });

  it('keeps the detector row when both cover the same activity', async () => {
    // UNIQUE(segment_id, activity_id) means one of them has to go, and the
    // detector row carries real metrics the coverage row does not.
    const { client, deleted } = mergeClient(
      { segmentId: 'rep', rows: [{ id: 'rep-row', activity_id: 'act-1', match_method: 'detector', duration_seconds: 300 }] },
      [{ id: 'lose-row', segment_id: 'lose', activity_id: 'act-1', match_method: 'coverage', duration_seconds: null }]
    );

    const out = await mergeCluster(client, 'rep', ['lose']);
    expect(out.discarded).toBe(1);
    expect(out.repointed).toBe(0);
    // The loser's row is the one dropped.
    expect(deleted.some(d => d.filters.id === 'lose-row')).toBe(true);
    expect(deleted.some(d => d.filters.id === 'rep-row')).toBe(false);
  });

  it('promotes the loser row when it is the better of the two', async () => {
    const { client, deleted } = mergeClient(
      { segmentId: 'rep', rows: [{ id: 'rep-row', activity_id: 'act-1', match_method: 'coverage', duration_seconds: null }] },
      [{ id: 'lose-row', segment_id: 'lose', activity_id: 'act-1', match_method: 'detector', duration_seconds: 300 }]
    );

    await mergeCluster(client, 'rep', ['lose']);
    expect(deleted.some(d => d.filters.id === 'rep-row')).toBe(true);
    expect(deleted.some(d => d.filters.id === 'lose-row')).toBe(false);
  });

  it('writes nothing in dry-run mode', async () => {
    const { client, deleted, updated } = mergeClient(
      { segmentId: 'rep', rows: [] },
      [{ id: 'r1', segment_id: 'lose', activity_id: 'act-1', match_method: 'coverage', duration_seconds: null }]
    );

    const out = await mergeCluster(client, 'rep', ['lose'], { dryRun: true });
    expect(out.repointed).toBe(1);
    expect(deleted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('is a no-op with no losers', async () => {
    const { client } = mergeClient({ segmentId: 'rep', rows: [] }, []);
    const out = await mergeCluster(client, 'rep', []);
    expect(out).toMatchObject({ repointed: 0, discarded: 0, errors: [] });
  });
});
