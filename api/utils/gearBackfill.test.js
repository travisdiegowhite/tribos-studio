import { describe, it, expect } from 'vitest';
import {
  isTakeoverAllowed,
  typeBucketOf,
  summarizeRides,
  suggestCategory,
  planBackfill,
  fetchCandidateRides,
  fetchExistingLinks,
  applyBackfill,
  undoBackfill,
  WRITE_CHUNK,
} from './gearBackfill.js';

/**
 * Recording fake. Each `from(table)` returns a chainable builder that
 * collects its filters; awaiting it hands the builder to `respond` so a test
 * can answer by table and operation. Writes are recorded in `log`.
 */
function fakeSupabase(respond) {
  const log = [];
  const builder = (table) => {
    const b = { table, op: 'select', filters: [], payload: null, opts: null };
    const chain = new Proxy(b, {
      get(target, prop) {
        if (prop === 'then') {
          return (resolve, reject) => {
            log.push(target);
            try { resolve(respond(target)); } catch (e) { reject(e); }
          };
        }
        if (prop === 'upsert' || prop === 'insert' || prop === 'update' || prop === 'delete') {
          return (payload, opts) => { target.op = prop; target.payload = payload; target.opts = opts; return chain; };
        }
        if (prop in target) return target[prop];
        return (...args) => { target.filters.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { from: builder, log, rpc: async () => ({ data: null, error: null }) };
}

const ride = (id, extra = {}) => ({ id, distance: 10_000, type: 'Ride', sport_type: null, trainer: false, start_date: '2026-05-01T08:00:00Z', ...extra });
const link = (gear, by, surface = null) => ({ gear_item_id: gear, assigned_by: by, surface_override: surface });

describe('isTakeoverAllowed', () => {
  it('links an unassigned ride, takes auto rows by default and never protected ones', () => {
    expect(isTakeoverAllowed(null)).toBe(true);
    expect(isTakeoverAllowed(link('x', 'auto'))).toBe(true);
    expect(isTakeoverAllowed(link('x', 'auto'), { includeAuto: false })).toBe(false);
    for (const by of ['manual', 'check_in', 'coach']) {
      expect(isTakeoverAllowed(link('x', by), { includeAuto: true, includeStrava: true })).toBe(false);
    }
  });
  it('takes strava rows only when asked', () => {
    expect(isTakeoverAllowed(link('x', 'strava'))).toBe(false);
    expect(isTakeoverAllowed(link('x', 'strava'), { includeStrava: true })).toBe(true);
  });
});

describe('typeBucketOf / summarizeRides / suggestCategory', () => {
  it('buckets Strava and Garmin strings and the trainer flag', () => {
    expect(typeBucketOf(ride('a'))).toBe('road');
    expect(typeBucketOf(ride('a', { type: 'GravelRide' }))).toBe('gravel');
    expect(typeBucketOf(ride('a', { sport_type: 'GRAVEL_CYCLING', type: 'Ride' }))).toBe('gravel');
    expect(typeBucketOf(ride('a', { type: 'MountainBikeRide' }))).toBe('mtb');
    expect(typeBucketOf(ride('a', { sport_type: 'MOUNTAIN_BIKING' }))).toBe('mtb');
    expect(typeBucketOf(ride('a', { type: 'EBikeRide' }))).toBe('ebike');
    expect(typeBucketOf(ride('a', { sport_type: 'E_BIKE_FITNESS', type: 'Workout' }))).toBe('ebike');
    expect(typeBucketOf(ride('a', { type: 'VirtualRide' }))).toBe('indoor');
    expect(typeBucketOf(ride('a', { trainer: true }))).toBe('indoor');
  });

  it('adds up rides, metres, dates, surfaces and types', () => {
    const s = summarizeRides([
      ride('a', { start_date: '2026-03-02T10:00:00Z' }),
      ride('b', { type: 'GravelRide', distance: 20_000, start_date: '2026-06-09T10:00:00Z' }),
      ride('c', { type: 'VirtualRide', distance: 5_000 }),
    ]);
    expect(s.rides).toBe(3);
    expect(s.distanceM).toBe(35_000);
    expect(s.firstDate).toBe('2026-03-02');
    expect(s.lastDate).toBe('2026-06-09');
    expect(s.bySurface).toEqual({ road: 10_000, offroad: 20_000, indoor: 5_000 });
    expect(s.byType).toEqual({ road: 1, gravel: 1, mtb: 0, ebike: 0, indoor: 1 });
  });

  it('suggests the majority bucket and falls back to road on a tie', () => {
    expect(suggestCategory({ road: 1, gravel: 3, mtb: 0, ebike: 0, indoor: 0 })).toBe('gravel');
    expect(suggestCategory({ road: 0, gravel: 0, mtb: 5, ebike: 0, indoor: 1 })).toBe('mtb');
    expect(suggestCategory({ road: 1, gravel: 0, mtb: 0, ebike: 0, indoor: 9 })).toBe('trainer');
    expect(suggestCategory({ road: 0, gravel: 0, mtb: 0, ebike: 3, indoor: 0 })).toBe('commuter');
    expect(suggestCategory({ road: 2, gravel: 2, mtb: 0, ebike: 0, indoor: 0 })).toBe('road');
    expect(suggestCategory({})).toBe('road');
  });
});

describe('planBackfill', () => {
  const rides = [ride('r1'), ride('r2'), ride('r3'), ride('r4'), ride('r5'), ride('r6')];
  const existing = new Map([
    ['r2', link('target', 'auto')],
    ['r3', link('other', 'auto', 'gravel')],
    ['r4', link('other', 'manual')],
    ['r5', link('other', 'strava')],
  ]);

  it('links unassigned + auto rows, skips the rest, and remembers what it displaced', () => {
    const plan = planBackfill(rides, existing, 'target');
    expect(plan.toLink.map((l) => l.activityId)).toEqual(['r1', 'r3', 'r6']);
    expect(plan.toLink.find((l) => l.activityId === 'r3').prev.surface_override).toBe('gravel');
    expect(plan.skipped).toEqual({ alreadyHere: 1, protected: 1, otherBike: 1 });
    expect(plan.skippedByGear).toEqual({ other: { protected: 1, otherBike: 1 } });
    expect(Array.from(plan.touchedGearIds)).toEqual(['other']);
    expect(plan.summary.rides).toBe(3);
  });

  it('leaves auto rows alone when asked, and takes strava rows only on the link path', () => {
    const narrow = planBackfill(rides, existing, 'target', { includeAuto: false });
    expect(narrow.toLink.map((l) => l.activityId)).toEqual(['r1', 'r6']);
    expect(narrow.skipped.otherBike).toBe(2);
    const claim = planBackfill(rides, existing, 'target', { includeStrava: true });
    expect(claim.toLink.map((l) => l.activityId)).toEqual(['r1', 'r3', 'r5', 'r6']);
  });

  it('is idempotent: a second run over the result links nothing', () => {
    const first = planBackfill(rides, existing, 'target');
    const after = new Map(existing);
    for (const l of first.toLink) after.set(l.activityId, link('target', 'auto'));
    const second = planBackfill(rides, after, 'target');
    expect(second.toLink).toHaveLength(0);
    expect(second.skipped.alreadyHere).toBe(4);
  });
});

describe('fetchCandidateRides', () => {
  it('pages, filters to the sport, and passes the window and strava id down', async () => {
    const sb = fakeSupabase((q) => {
      const range = q.filters.find((f) => f[0] === 'range');
      const page = range[1] === 0
        ? Array.from({ length: 1000 }, (_, i) => ride(`p${i}`, i % 2 ? { type: 'Run' } : {}))
        : [ride('last')];
      return { data: page, error: null };
    });
    const rows = await fetchCandidateRides(sb, 'u', { from: '2026-01-01', until: '2026-06-30', stravaGearId: 'b1' });
    expect(rows).toHaveLength(501);
    expect(sb.log).toHaveLength(2);
    const f = sb.log[0].filters;
    expect(f).toContainEqual(['gte', 'start_date', '2026-01-01']);
    expect(f).toContainEqual(['lte', 'start_date', '2026-06-30T23:59:59.999Z']);
    expect(f).toContainEqual(['eq', 'gear_id', 'b1']);
    expect(f).toContainEqual(['is', 'duplicate_of', null]);
    const runs = await fetchCandidateRides(sb, 'u', { sport: 'running' });
    expect(runs.every((r) => r.type === 'Run')).toBe(true);
  });
});

describe('fetchExistingLinks / applyBackfill / undoBackfill', () => {
  it('reads links in chunks of 200 and returns a map', async () => {
    const sb = fakeSupabase((q) => ({ data: q.filters.find((f) => f[0] === 'in')[2].map((id) => ({ activity_id: id, gear_item_id: 'g', assigned_by: 'auto', surface_override: null })), error: null }));
    const ids = Array.from({ length: 450 }, (_, i) => `a${i}`);
    const map = await fetchExistingLinks(sb, ids);
    expect(map.size).toBe(450);
    expect(sb.log).toHaveLength(3);
  });

  it('writes in chunks of 500, keeps the surface, recalculates every touched bike, and reports what it displaced', async () => {
    const rides = Array.from({ length: 1200 }, (_, i) => ride(`r${i}`, { distance: 1000 }));
    const existing = new Map([['r0', link('other', 'auto', 'gravel')]]);
    const plan = planBackfill(rides, existing, 'target');
    const sb = fakeSupabase((q) => {
      if (q.table === 'activity_gear' && q.op === 'select') return { data: [{ activities: { distance: 7 } }], error: null };
      return { data: null, error: null };
    });
    const result = await applyBackfill(sb, { userId: 'u', gearId: 'target', plan, assignedBy: 'auto' });
    const upserts = sb.log.filter((q) => q.op === 'upsert');
    expect(upserts.map((q) => q.payload.length)).toEqual([WRITE_CHUNK, WRITE_CHUNK, 200]);
    expect(upserts[0].payload[0]).toEqual({ activity_id: 'r0', gear_item_id: 'target', user_id: 'u', assigned_by: 'auto', surface_override: 'gravel' });
    expect(upserts[0].opts).toEqual({ onConflict: 'activity_id' });
    const recalcs = sb.log.filter((q) => q.table === 'gear_items' && q.op === 'update');
    expect(recalcs.map((q) => q.filters.find((f) => f[0] === 'eq')[2]).sort()).toEqual(['other', 'target']);
    expect(result.linked).toBe(1200);
    expect(result.distanceM).toBe(1_200_000);
    expect(result.previous).toEqual([{ activity_id: 'r0', gear_item_id: 'other', assigned_by: 'auto', surface_override: 'gravel' }]);
    expect(result.touchedGearIds.sort()).toEqual(['other', 'target']);
  });

  it('throws when a write fails', async () => {
    const plan = planBackfill([ride('r1')], new Map(), 'target');
    const sb = fakeSupabase((q) => (q.op === 'upsert' ? { data: null, error: new Error('boom') } : { data: [], error: null }));
    await expect(applyBackfill(sb, { userId: 'u', gearId: 'target', plan })).rejects.toThrow('boom');
  });

  it('undo restores displaced rows, deletes fresh ones, leaves rides the rider has since moved, and recalcs', async () => {
    const sb = fakeSupabase((q) => {
      if (q.table === 'activities') return { data: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }], error: null };
      if (q.table === 'gear_items' && q.op === 'select') return { data: [{ id: 'other' }], error: null };
      if (q.table === 'activity_gear' && q.op === 'select') {
        // r3 was moved by hand after the backfill; r1 and r2 are still on the target
        return { data: [
          { activity_id: 'r1', gear_item_id: 'target', assigned_by: 'auto', surface_override: null },
          { activity_id: 'r2', gear_item_id: 'target', assigned_by: 'auto', surface_override: null },
          { activity_id: 'r3', gear_item_id: 'third', assigned_by: 'manual', surface_override: null },
        ], error: null };
      }
      return { data: [], error: null };
    });
    const result = await undoBackfill(sb, {
      userId: 'u', gearId: 'target', linkedIds: ['r1', 'r2', 'r3'],
      previous: [{ activity_id: 'r1', gear_item_id: 'other', assigned_by: 'auto', surface_override: 'gravel' }],
    });
    const upsert = sb.log.find((q) => q.op === 'upsert');
    expect(upsert.payload).toEqual([{ activity_id: 'r1', gear_item_id: 'other', user_id: 'u', assigned_by: 'auto', surface_override: 'gravel' }]);
    const del = sb.log.find((q) => q.op === 'delete');
    expect(del.filters).toContainEqual(['eq', 'gear_item_id', 'target']);
    expect(del.filters).toContainEqual(['eq', 'user_id', 'u']);
    expect(del.filters).toContainEqual(['in', 'activity_id', ['r2']]);
    expect(result).toEqual({ restored: 1, unlinked: 1, touchedGearIds: ['target', 'other'] });
  });

  it('undo ignores a previous row pointing at someone else’s bike', async () => {
    const sb = fakeSupabase((q) => {
      if (q.table === 'activities') return { data: [{ id: 'r1' }], error: null };
      if (q.table === 'gear_items' && q.op === 'select') return { data: [], error: null }; // not owned
      if (q.table === 'activity_gear' && q.op === 'select') return { data: [{ activity_id: 'r1', gear_item_id: 'target', assigned_by: 'auto' }], error: null };
      return { data: [], error: null };
    });
    const result = await undoBackfill(sb, { userId: 'u', gearId: 'target', linkedIds: ['r1'], previous: [{ activity_id: 'r1', gear_item_id: 'stolen', assigned_by: 'manual' }] });
    expect(sb.log.some((q) => q.op === 'upsert')).toBe(false);
    expect(result.restored).toBe(0);
    expect(result.unlinked).toBe(1);
  });
});
