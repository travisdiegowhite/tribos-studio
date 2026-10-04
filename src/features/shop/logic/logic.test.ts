import { describe, it, expect } from 'vitest';
import type { ShopCategory, ShopItem, ShopLocation } from '../types';
import { ancestry, findByPath, flattenTree, pathLabel, subtreeIds, treeSelectData } from './tree';
import { filterItems, inventoryStats, isLowStock, normaliseLabel, suggestPrefix } from './search';
import { exportItemsCsv, parseCsv, planImport, toCsv } from './csv';

const U = 'user-1';

const cat = (id: string, name: string, parent: string | null = null, prefix: string | null = null, sort = 0): ShopCategory => ({
  id, user_id: U, name, parent_id: parent, prefix, next_sequence: 1, sort_order: sort, created_at: '2026-01-01T00:00:00Z',
});
const loc = (id: string, name: string, parent: string | null = null, sort = 0): ShopLocation => ({
  id, user_id: U, name, parent_id: parent, description: null, sort_order: sort, created_at: '2026-01-01T00:00:00Z',
});
const item = (over: Partial<ShopItem> & Pick<ShopItem, 'id' | 'display_id' | 'name' | 'category_id'>): ShopItem => ({
  user_id: U, location_id: null, quantity: 1, min_quantity: null, brand: null, model: null, mpn: null, upc: null,
  condition: 'good', compatibility: [], tags: [], unit_cost: null, purchased_on: null, notes: null, photo_path: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});

const categories = [
  cat('tl', 'Tools', null, 'TL', 1),
  cat('tl-drive', 'Drivetrain tools', 'tl', null, 2),
  cat('tl-hex', 'Hex & Torx', 'tl', null, 1),
  cat('cp', 'Components', null, 'CP', 2),
  cat('cp-drive', 'Drivetrain', 'cp', null, 1),
  cat('ot', 'Other', null, 'OT', 9),
];
const locations = [
  loc('garage', 'Garage', null, 1),
  loc('cab', 'Tool cabinet', 'garage', 1),
  loc('d2', 'Drawer 2', 'cab', 2),
  loc('base', 'Basement', null, 2),
];
const items = [
  item({ id: '1', display_id: 'TL-0001', name: 'Chain whip', category_id: 'tl-drive', location_id: 'd2', brand: 'Park Tool', updated_at: '2026-03-01T00:00:00Z' }),
  item({ id: '2', display_id: 'TL-0010', name: 'Hex set', category_id: 'tl-hex', location_id: 'cab', updated_at: '2026-02-01T00:00:00Z' }),
  item({ id: '3', display_id: 'CP-0002', name: 'Shimano XT Rear Derailleur', category_id: 'cp-drive', location_id: 'base', brand: 'Shimano', mpn: 'RD-M8100-SGS', quantity: 1, min_quantity: 1, unit_cost: 89.5, updated_at: '2026-04-01T00:00:00Z' }),
  item({ id: '4', display_id: 'CP-0003', name: '11-speed chain', category_id: 'cp-drive', quantity: 3, min_quantity: 1, unit_cost: 30, tags: ['spare'], compatibility: ['11-speed'] }),
];

describe('tree', () => {
  it('builds root-first paths', () => {
    expect(ancestry('d2', locations).map((l) => l.name)).toEqual(['Garage', 'Tool cabinet', 'Drawer 2']);
    expect(pathLabel('d2', locations)).toBe('Garage › Tool cabinet › Drawer 2');
    expect(pathLabel(null, locations)).toBe('');
  });

  it('collects a subtree', () => {
    expect([...subtreeIds('garage', locations)].sort()).toEqual(['cab', 'd2', 'garage']);
  });

  it('flattens depth-first by sort order', () => {
    expect(flattenTree(categories).map((f) => f.node.id)).toEqual(['tl', 'tl-hex', 'tl-drive', 'cp', 'cp-drive', 'ot']);
    expect(treeSelectData(locations).find((o) => o.value === 'd2')?.label).toBe('Garage › Tool cabinet › Drawer 2');
  });

  it('survives cycles and missing parents', () => {
    const bad = [loc('a', 'A', 'b'), loc('b', 'B', 'a'), loc('c', 'C', 'gone')];
    expect(ancestry('a', bad).length).toBe(2);
    const flat = flattenTree(bad);
    expect(flat.map((f) => f.node.id).sort()).toEqual(['a', 'b', 'c']);
    expect(flat.find((f) => f.node.id === 'c')?.depth).toBe(0);
  });

  it('finds by path, case-insensitive, either separator', () => {
    expect(findByPath('garage > tool cabinet', locations)?.id).toBe('cab');
    expect(findByPath('Garage › Tool cabinet › Drawer 2', locations)?.id).toBe('d2');
    expect(findByPath('Tool cabinet', locations)).toBeUndefined(); // not a full path
  });
});

describe('search', () => {
  const run = (f: Parameters<typeof filterItems>[1]) => filterItems(items, f, categories, locations).map((i) => i.display_id);

  it('matches every word across fields, category and location', () => {
    expect(run({ query: 'xt derailleur' })).toEqual(['CP-0002']);
    expect(run({ query: 'rd-m8100' })).toEqual(['CP-0002']);
    expect(run({ query: 'drawer park' })).toEqual(['TL-0001']);
    expect(run({ query: '11-speed spare' })).toEqual(['CP-0003']);
  });

  it('finds a label typed loosely', () => {
    expect(normaliseLabel('tl1')).toBe('TL1');
    expect(normaliseLabel('TL-0001')).toBe('TL1');
    expect(normaliseLabel('chain')).toBeNull();
    expect(run({ query: 'tl-1' })).toEqual(['TL-0001']);
    expect(run({ query: 'TL10' })).toEqual(['TL-0010']);
  });

  it('filters by category and location subtrees', () => {
    expect(run({ categoryId: 'tl', sort: 'label' })).toEqual(['TL-0001', 'TL-0010']);
    expect(run({ locationId: 'garage', sort: 'label' })).toEqual(['TL-0001', 'TL-0010']);
    expect(run({ locationId: 'none' })).toEqual(['CP-0003']);
  });

  it('flags low stock at or below the threshold', () => {
    expect(isLowStock(items[2])).toBe(true);
    expect(isLowStock(items[3])).toBe(false);
    expect(isLowStock(items[0])).toBe(false);
    expect(run({ lowOnly: true })).toEqual(['CP-0002']);
  });

  it('sorts labels numerically, recent first by default', () => {
    expect(run({ sort: 'label' })).toEqual(['CP-0002', 'CP-0003', 'TL-0001', 'TL-0010']);
    expect(run({})[0]).toBe('CP-0002');
  });

  it('totals the inventory', () => {
    expect(inventoryStats(items)).toEqual({ items: 4, units: 6, value: 179.5, low: 1 });
  });
});

describe('csv', () => {
  it('parses quotes, embedded commas, newlines, CRLF and BOM', () => {
    const text = '\uFEFFname,notes\r\n"Tire, 700x28","say ""hi""\nsecond line"\r\nTube,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'notes'],
      ['Tire, 700x28', 'say "hi"\nsecond line'],
      ['Tube', ''],
    ]);
  });

  it('round-trips through toCsv', () => {
    const rows = [['a', 'b,c', 'd"e', ' pad '], ['1', '', 'x\ny', 'z']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('plans an import: aliases, paths, new locations, fallbacks', () => {
    const csv = [
      'Item,Category,Location,Qty,Min,Price,Condition,Fits,Purchase Date,Colour',
      'Cassette,Components > Drivetrain,Garage > Tool cabinet,2,1,$64.99,new,11-speed; Shimano,2026-02-03,black',
      'Brake bleed kit,Hex & Torx,Garage > Shelf A > Bin 3,1,,,fair,,03/02/2026,',
      'Mystery,Widgets,,x,,,,,,',
      ',Tools,,,,,,,,',
    ].join('\n');
    const plan = planImport(csv, categories, locations);
    expect(plan.fatal).toBeNull();
    expect(plan.unknownColumns).toEqual(['Colour']);
    expect(plan.newLocationPaths).toEqual(['Garage > Shelf A', 'Garage > Shelf A > Bin 3']);

    const [a, b, c, d] = plan.rows;
    expect(a.draft).toMatchObject({
      name: 'Cassette', category_id: 'cp-drive', location_id: 'cab', quantity: 2, min_quantity: 1,
      unit_cost: 64.99, condition: 'new', compatibility: ['11-speed', 'Shimano'], purchased_on: '2026-02-03',
    });
    // Leaf-name category match, location to be created, legacy "fair", bad date warned.
    expect(b.draft).toMatchObject({ category_id: 'tl-hex', location_id: null, condition: 'used', purchased_on: null });
    expect(b.newLocationPath).toBe('Garage > Shelf A > Bin 3');
    expect(b.warnings.join()).toMatch(/YYYY-MM-DD/);
    // Bad quantity is an error; unknown category would have fallen back to Other.
    expect(c.draft).toBeNull();
    expect(c.errors.join()).toMatch(/quantity/);
    expect(c.warnings.join()).toMatch(/Unknown category "Widgets"/);
    expect(d.errors).toContain('Missing name');
    expect(d.line).toBe(5);
  });

  it('refuses a file without a name column', () => {
    expect(planImport('brand,qty\nShimano,1', categories, locations).fatal).toMatch(/name/);
  });

  it('exports paths that import back to the same places', () => {
    const csv = exportItemsCsv(items, categories, locations);
    const plan = planImport(csv, categories, locations);
    expect(plan.newLocationPaths).toEqual([]);
    expect(plan.rows.map((r) => r.draft?.category_id)).toEqual(items.map((i) => i.category_id));
    expect(plan.rows.map((r) => r.draft?.location_id)).toEqual(items.map((i) => i.location_id));
    expect(plan.rows[2].draft?.unit_cost).toBe(89.5);
    expect(plan.rows[3].draft?.tags).toEqual(['spare']);
  });
});

describe('suggestPrefix', () => {
  it('uses initials for two words, else the first letters', () => {
    expect(suggestPrefix('Wheel Builds', new Set())).toBe('WB');
    expect(suggestPrefix('Bearings', new Set())).toBe('BE');
  });

  it('skips prefixes already taken', () => {
    expect(suggestPrefix('Bearings', new Set(['BE']))).toBe('BEA');
    expect(suggestPrefix('Tools', new Set(['TO', 'TOO']))).toBe('');
  });
});
