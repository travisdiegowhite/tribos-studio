import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopItem } from '../types';

/**
 * A fake PostgREST builder: every chained call is recorded, and awaiting the
 * chain resolves to the next queued response for that table.
 */
interface Call { table: string; ops: [string, unknown[]][] }
const calls: Call[] = [];
const responses: Record<string, { data: unknown; error: { message: string } | null }[]> = {};

function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'insert', 'update', 'eq', 'is', 'in', 'or', 'order', 'limit', 'single', 'maybeSingle']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  b.then = (resolve: (v: unknown) => void) =>
    resolve(responses[table]?.shift() ?? { data: null, error: null });
  return b;
}

vi.mock('../host', () => ({
  supabase: { from: (t: string) => builder(t), rpc: vi.fn(async () => ({ data: null, error: null })) },
  resizeImageFile: vi.fn(),
}));

const { adjustQuantity, createItem, listItems, updateItem } = await import('../data/shopApi');

const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: 'i1', display_id: 'TL-0001', name: 'Chain whip', kind: 'tool', description: null, category_id: 'c1',
  location_id: 'loc-a', quantity: 2, min_quantity: null, brand: null, model: null, mpn: null, upc: null,
  condition: 'good', compatibility: [], purchase_date: null, purchase_price_cents: null, notes: null,
  archived_at: null, created_at: '', updated_at: '', ...over,
});

const queue = (table: string, data: unknown, error: { message: string } | null = null) => {
  (responses[table] ??= []).push({ data, error });
};

const activity = () =>
  calls.filter((c) => c.table === 'shop_activity').map((c) => c.ops.find(([op]) => op === 'insert')?.[1][0]);

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(responses)) delete responses[k];
});

describe('createItem', () => {
  it('never sends a display_id and logs the creation', async () => {
    queue('shop_items', item());
    const { display_id: _ignored, ...input } = item();
    await createItem({ ...input, name: '  Chain whip ' } as never);

    const insert = calls[0].ops.find(([op]) => op === 'insert')![1][0] as Record<string, unknown>;
    expect(insert.name).toBe('Chain whip');
    expect(activity()).toEqual([{ item_id: 'i1', display_id: 'TL-0001', action: 'created', details: { quantity: 2 } }]);
  });

  it('throws with context when the insert fails', async () => {
    queue('shop_items', null, { message: 'new row violates row-level security policy' });
    await expect(createItem(item() as never)).rejects.toThrow('Saving item: new row violates');
    expect(activity()).toEqual([]);
  });

  it('keeps the saved item when only the activity log fails', async () => {
    queue('shop_items', item());
    queue('shop_activity', null, { message: 'boom' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createItem(item() as never)).resolves.toMatchObject({ display_id: 'TL-0001' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('updateItem', () => {
  it('does nothing when nothing changed', async () => {
    const before = item();
    expect(await updateItem(before, { name: 'Chain whip', location_id: 'loc-a' })).toBe(before);
    expect(calls).toEqual([]);
  });

  it('sends only changed fields and logs a move apart from an edit', async () => {
    queue('shop_items', item({ location_id: 'loc-b', brand: 'Park Tool' }));
    await updateItem(item(), { name: 'Chain whip', location_id: 'loc-b', brand: 'Park Tool' });

    const update = calls[0].ops.find(([op]) => op === 'update')![1][0];
    expect(update).toEqual({ location_id: 'loc-b', brand: 'Park Tool' });
    expect(activity().map((a) => (a as { action: string }).action)).toEqual(['moved', 'edited']);
  });
});

describe('adjustQuantity', () => {
  it('only updates if the count is still what the screen showed', async () => {
    queue('shop_items', item({ quantity: 3 }));
    await adjustQuantity(item({ quantity: 2 }), 1);

    const ops = calls[0].ops;
    expect(ops).toContainEqual(['update', [{ quantity: 3 }]]);
    expect(ops).toContainEqual(['eq', ['quantity', 2]]);
    expect(activity()).toEqual([
      { item_id: 'i1', display_id: 'TL-0001', action: 'quantity', details: { from: 2, to: 3 } },
    ]);
  });

  it('says so when the count changed elsewhere', async () => {
    queue('shop_items', null);
    await expect(adjustQuantity(item(), -1)).rejects.toThrow('changed somewhere else');
  });

  it('never goes below zero', async () => {
    const zero = item({ quantity: 0 });
    expect(await adjustQuantity(zero, -1)).toBe(zero);
    expect(calls).toEqual([]);
  });
});

describe('listItems', () => {
  it('hides archived items and searches the label fields', async () => {
    queue('shop_items', []);
    await listItems({ search: 'xt, m8100' });
    const ops = calls[0].ops;
    expect(ops).toContainEqual(['is', ['archived_at', null]]);
    const or = ops.find(([op]) => op === 'or')![1][0] as string;
    expect(or).toContain('display_id.ilike.%xt m8100%');
    expect(or.split(',')).toHaveLength(6);
  });
});
