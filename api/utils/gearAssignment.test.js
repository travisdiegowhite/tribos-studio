import { describe, it, expect } from 'vitest';
import { assignGearToActivity, reassignActivityGear, setRideSurface } from './gearAssignment.js';

/** Recording fake: `respond(builder)` answers by table, op and filters. */
function fakeSupabase(respond) {
  const log = [];
  const rpcs = [];
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
  return { from: builder, log, rpcs, rpc: async (name, args) => { rpcs.push([name, args]); return { data: null, error: null }; } };
}
const has = (q, filter) => q.filters.some((f) => JSON.stringify(f) === JSON.stringify(filter));

describe('assignGearToActivity', () => {
  it('puts a VirtualRide on the trainer bike before the default', async () => {
    const sb = fakeSupabase((q) => {
      if (q.table === 'gear_items' && has(q, ['eq', 'is_trainer_bike', true])) return { data: { id: 'turbo' }, error: null };
      if (q.table === 'gear_items' && has(q, ['eq', 'is_default', true])) return { data: { id: 'road' }, error: null };
      return { data: null, error: null };
    });
    await assignGearToActivity(sb, { activityId: 'a1', userId: 'u', activityType: 'VirtualRide', distance: 1000, stravaGearId: null });
    const upsert = sb.log.find((q) => q.op === 'upsert');
    expect(upsert.payload.gear_item_id).toBe('turbo');
    expect(upsert.payload.assigned_by).toBe('auto');
    expect(sb.rpcs).toEqual([['increment_gear_distance', { p_gear_id: 'turbo', p_distance: 1000 }]]);
  });

  it('falls back to the default bike for an outdoor ride and never asks for the trainer bike', async () => {
    const sb = fakeSupabase((q) => {
      if (q.table === 'gear_items' && has(q, ['eq', 'is_default', true])) return { data: { id: 'road' }, error: null };
      return { data: null, error: null };
    });
    await assignGearToActivity(sb, { activityId: 'a1', userId: 'u', activityType: 'Ride', distance: 1000, stravaGearId: null, trainer: false });
    expect(sb.log.some((q) => has(q, ['eq', 'is_trainer_bike', true]))).toBe(false);
    expect(sb.log.find((q) => q.op === 'upsert').payload.gear_item_id).toBe('road');
  });

  it('prefers a Strava gear match over everything', async () => {
    const sb = fakeSupabase((q) => {
      if (q.table === 'gear_items' && has(q, ['eq', 'strava_gear_id', 'b1'])) return { data: { id: 'tarmac' }, error: null };
      return { data: { id: 'wrong' }, error: null };
    });
    await assignGearToActivity(sb, { activityId: 'a1', userId: 'u', activityType: 'VirtualRide', distance: 0, stravaGearId: 'b1', trainer: true });
    const upsert = sb.log.find((q) => q.op === 'upsert');
    expect(upsert.payload).toMatchObject({ gear_item_id: 'tarmac', assigned_by: 'strava' });
  });
});

describe('reassignActivityGear', () => {
  const respond = (existing) => (q) => {
    if (q.table === 'activities') return { data: { distance: 5000 }, error: null };
    if (q.table === 'gear_items') return { data: { id: 'new' }, error: null };
    if (q.table === 'activity_gear' && q.op === 'select') return { data: existing, error: null };
    return { data: null, error: null };
  };

  it('moves the ride, keeps the surface, records who decided, and shifts mileage', async () => {
    const sb = fakeSupabase(respond({ gear_item_id: 'old', surface_override: 'gravel' }));
    const out = await reassignActivityGear(sb, 'a1', 'new', 'u', { assignedBy: 'check_in' });
    const upsert = sb.log.find((q) => q.op === 'upsert');
    expect(upsert.payload).toEqual({ activity_id: 'a1', gear_item_id: 'new', user_id: 'u', assigned_by: 'check_in', surface_override: 'gravel' });
    expect(sb.rpcs).toEqual([
      ['increment_gear_distance', { p_gear_id: 'old', p_distance: -5000 }],
      ['increment_gear_distance', { p_gear_id: 'new', p_distance: 5000 }],
    ]);
    expect(out).toEqual({ previousGearItemId: 'old' });
  });

  it('defaults to manual and does not touch mileage when the bike is unchanged', async () => {
    const sb = fakeSupabase(respond({ gear_item_id: 'new', surface_override: null }));
    await reassignActivityGear(sb, 'a1', 'new', 'u');
    expect(sb.log.find((q) => q.op === 'upsert').payload.assigned_by).toBe('manual');
    expect(sb.rpcs).toEqual([]);
  });

  it('refuses a ride or a bike that is not the rider’s, and surfaces write errors', async () => {
    const noActivity = fakeSupabase((q) => (q.table === 'activities' ? { data: null, error: null } : { data: { id: 'x' }, error: null }));
    await expect(reassignActivityGear(noActivity, 'a1', 'new', 'u')).rejects.toThrow('Activity not found');
    const failing = fakeSupabase((q) => (q.op === 'upsert' ? { data: null, error: new Error('rls') } : respond(null)(q)));
    await expect(reassignActivityGear(failing, 'a1', 'new', 'u')).rejects.toThrow('rls');
  });
});

describe('setRideSurface', () => {
  it('updates the rider’s own row and rejects junk', async () => {
    const sb = fakeSupabase((q) => (q.op === 'select' ? { data: { gear_item_id: 'g' }, error: null } : { data: null, error: null }));
    await setRideSurface(sb, 'a1', 'u', 'gravel');
    const update = sb.log.find((q) => q.op === 'update');
    expect(update.payload).toEqual({ surface_override: 'gravel' });
    expect(has(update, ['eq', 'user_id', 'u'])).toBe(true);
    await expect(setRideSurface(sb, 'a1', 'u', 'moon')).rejects.toThrow('Invalid surface');
    const unlinked = fakeSupabase(() => ({ data: null, error: null }));
    await expect(setRideSurface(unlinked, 'a1', 'u', null)).rejects.toThrow('bike first');
  });
});
