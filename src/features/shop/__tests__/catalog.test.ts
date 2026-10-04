import { describe, expect, it } from 'vitest';
import {
  diffItem, isDisplayId, kindForPrefix, parsePriceToCents, pathLabel, prefixFor, sanitizeSearch, treeOptions,
} from '../lib/catalog';
import { isShopOwner } from '../owner';
import type { ShopCategory, ShopItem } from '../types';

const cat = (id: string, name: string, prefix: string, parent_id: string | null, sort_order = 0): ShopCategory =>
  ({ id, name, prefix, parent_id, icon: null, sort_order });

const categories = [
  cat('tools', 'Tools', 'TL', null, 1),
  cat('wrenches', 'Wrenches', 'TL', 'tools', 2),
  cat('hex', 'Hex keys', 'TL', 'tools', 1),
  cat('cons', 'Consumables', 'CS', null, 2),
];

describe('prefixFor', () => {
  it("uses the root category's prefix", () => {
    expect(prefixFor('wrenches', categories)).toBe('TL');
    expect(prefixFor('cons', categories)).toBe('CS');
  });

  it('falls back to XX like the database trigger', () => {
    expect(prefixFor(null, categories)).toBe('XX');
    expect(prefixFor('missing', categories)).toBe('XX');
  });

  it('survives a parent cycle in bad data', () => {
    const loop = [cat('a', 'A', 'AA', 'b'), cat('b', 'B', 'BB', 'a')];
    expect(() => prefixFor('a', loop)).not.toThrow();
  });
});

describe('kindForPrefix', () => {
  it('maps tools and consumables, everything else is a part', () => {
    expect(kindForPrefix('TL')).toBe('tool');
    expect(kindForPrefix('CS')).toBe('consumable');
    expect(kindForPrefix('WT')).toBe('part');
  });
});

describe('tree labels', () => {
  it('builds a root-first path', () => {
    expect(pathLabel('wrenches', categories)).toBe('Tools › Wrenches');
    expect(pathLabel(null, categories)).toBe('');
  });

  it('lists children under their parent in sort order', () => {
    expect(treeOptions(categories).map((o) => o.value)).toEqual(['tools', 'hex', 'wrenches', 'cons']);
  });
});

describe('isDisplayId', () => {
  it('accepts label IDs in any case', () => {
    expect(isDisplayId('TL-0001')).toBe(true);
    expect(isDisplayId(' cp-0042 ')).toBe(true);
    expect(isDisplayId('chain whip')).toBe(false);
    expect(isDisplayId('012345678905')).toBe(false);
  });
});

describe('parsePriceToCents', () => {
  it('stores money as whole cents', () => {
    expect(parsePriceToCents('12.5')).toBe(1250);
    expect(parsePriceToCents('$1,299.99')).toBe(129999);
    expect(parsePriceToCents('0.1')).toBe(10);
  });

  it('treats blank or invalid as not set', () => {
    expect(parsePriceToCents('')).toBeNull();
    expect(parsePriceToCents('abc')).toBeNull();
    expect(parsePriceToCents('-3')).toBeNull();
  });
});

describe('sanitizeSearch', () => {
  it('strips characters that would break a PostgREST or-filter', () => {
    expect(sanitizeSearch('xt,brand.eq.x)')).toBe('xt brand.eq.x');
    expect(sanitizeSearch('RD-M8100-SGS')).toBe('RD-M8100-SGS');
    expect(sanitizeSearch('  %_*  ')).toBe('_');
  });
});

describe('diffItem', () => {
  const before = {
    name: 'Chain whip', location_id: 'a', quantity: 1, compatibility: ['11-speed'], brand: null,
  } as unknown as ShopItem;

  it('reports only fields that changed', () => {
    expect(diffItem(before, { name: 'Chain whip', location_id: 'b', compatibility: ['11-speed'] }))
      .toEqual({ location_id: ['a', 'b'] });
  });

  it('treats undefined and null as the same', () => {
    expect(diffItem(before, { brand: null })).toEqual({});
  });
});

describe('isShopOwner', () => {
  it('matches the owner email case-insensitively and nobody else', () => {
    expect(isShopOwner('Travis@Tribos.Studio')).toBe(true);
    expect(isShopOwner('someone@example.com')).toBe(false);
    expect(isShopOwner(undefined)).toBe(false);
  });
});
