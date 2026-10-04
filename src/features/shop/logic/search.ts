import type { Condition, ShopCategory, ShopItem, ShopLocation } from '../types';
import { pathLabel, subtreeIds } from './tree';

export function isLowStock(item: Pick<ShopItem, 'quantity' | 'min_quantity'>): boolean {
  return item.min_quantity != null && item.quantity <= item.min_quantity;
}

export type SortKey = 'recent' | 'label' | 'name' | 'quantity';

export interface ItemFilter {
  query?: string;
  categoryId?: string | null;
  /** 'none' = items with no location. */
  locationId?: string | null;
  condition?: Condition | null;
  lowOnly?: boolean;
  sort?: SortKey;
}

/** Everything a query word may hit, lower-cased once per item. */
function haystack(item: ShopItem, categories: readonly ShopCategory[], locations: readonly ShopLocation[]): string {
  return [
    item.display_id,
    item.name,
    item.brand,
    item.model,
    item.mpn,
    item.upc,
    item.notes,
    item.tags.join(' '),
    item.compatibility.join(' '),
    pathLabel(item.category_id, categories),
    pathLabel(item.location_id, locations),
  ]
    .filter(Boolean)
    .join(' \u0001 ')
    .toLowerCase();
}

/**
 * Every word must match somewhere ("xt derailleur" finds "Shimano XT Rear
 * Derailleur"). A label typed without its dash or zero padding still
 * finds the item: "tl1" and "TL-1" both find TL-0001.
 */
export function filterItems(
  items: readonly ShopItem[],
  filter: ItemFilter,
  categories: readonly ShopCategory[],
  locations: readonly ShopLocation[],
): ShopItem[] {
  const words = (filter.query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const labelWant = normaliseLabel(filter.query || '');
  const catIds = filter.categoryId ? subtreeIds(filter.categoryId, categories) : null;
  const locIds = filter.locationId && filter.locationId !== 'none' ? subtreeIds(filter.locationId, locations) : null;

  const out = items.filter((item) => {
    if (catIds && !catIds.has(item.category_id)) return false;
    if (filter.locationId === 'none' && item.location_id) return false;
    if (locIds && (!item.location_id || !locIds.has(item.location_id))) return false;
    if (filter.condition && item.condition !== filter.condition) return false;
    if (filter.lowOnly && !isLowStock(item)) return false;
    if (!words.length) return true;
    if (labelWant && normaliseLabel(item.display_id) === labelWant) return true;
    const hay = haystack(item, categories, locations);
    return words.every((w) => hay.includes(w));
  });

  return sortItems(out, filter.sort || 'recent');
}

export function sortItems(items: ShopItem[], sort: SortKey): ShopItem[] {
  const copy = items.slice();
  switch (sort) {
    case 'label':
      return copy.sort((a, b) => compareLabels(a.display_id, b.display_id));
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'quantity':
      return copy.sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
    case 'recent':
    default:
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

/** "TL-0001" → "TL1"; anything not label-shaped → null. */
export function normaliseLabel(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^([A-Z]{2,4})[-\s]?0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : null;
}

function compareLabels(a: string, b: string): number {
  const [pa, na] = a.split('-');
  const [pb, nb] = b.split('-');
  return pa.localeCompare(pb) || Number(na) - Number(nb);
}

export interface InventoryStats {
  items: number;
  units: number;
  value: number;
  low: number;
}

export function inventoryStats(items: readonly ShopItem[]): InventoryStats {
  let units = 0;
  let value = 0;
  let low = 0;
  for (const i of items) {
    units += i.quantity;
    if (i.unit_cost != null) value += i.unit_cost * i.quantity;
    if (isLowStock(i)) low += 1;
  }
  return { items: items.length, units, value: Math.round(value * 100) / 100, low };
}

/** Suggest a prefix from the name: "Bearings" → "BE", "Wheel Builds" → "WB". */
export function suggestPrefix(name: string, taken: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = [
    words.length > 1 ? words[0][0] + words[1][0] : '',
    (words[0] || '').slice(0, 2),
    (words[0] || '').slice(0, 3),
  ].filter((c) => /^[A-Z]{2,4}$/.test(c));
  return candidates.find((c) => !taken.has(c)) || '';
}
