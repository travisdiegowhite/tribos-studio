import type { ItemInput, ItemKind, ShopCategory, ShopItem, ShopLocation } from '../types';

/** Walk up to the top of a parent_id tree. Guards against a cycle in bad data. */
function rootOf<T extends { id: string; parent_id: string | null }>(id: string | null, rows: T[]): T | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let node = id ? byId.get(id) ?? null : null;
  const seen = new Set<string>();
  while (node?.parent_id && byId.has(node.parent_id) && !seen.has(node.id)) {
    seen.add(node.id);
    node = byId.get(node.parent_id)!;
  }
  return node;
}

/** The ID prefix an item in this category will get (mirrors the DB trigger). */
export function prefixFor(categoryId: string | null, categories: ShopCategory[]): string {
  return rootOf(categoryId, categories)?.prefix ?? 'XX';
}

/** Tools and consumables are their own kinds; everything else is a part. */
export function kindForPrefix(prefix: string): ItemKind {
  if (prefix === 'TL') return 'tool';
  if (prefix === 'CS') return 'consumable';
  return 'part';
}

/** "Garage › Pegboard", root first. */
export function pathLabel<T extends { id: string; name: string; parent_id: string | null }>(
  id: string | null,
  rows: T[],
): string {
  if (!id) return '';
  const byId = new Map(rows.map((r) => [r.id, r]));
  const names: string[] = [];
  const seen = new Set<string>();
  let node = byId.get(id);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    names.unshift(node.name);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  return names.join(' › ');
}

/** Options for a flat <Select>, each child listed under its parent. */
export function treeOptions<T extends { id: string; name: string; parent_id: string | null; sort_order: number }>(
  rows: T[],
): { value: string; label: string }[] {
  const children = (parent: string | null) =>
    rows
      .filter((r) => r.parent_id === parent)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const out: { value: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const r of children(parent)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ value: r.id, label: `${' '.repeat(depth)}${r.name}` });
      walk(r.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

export const DISPLAY_ID_RE = /^[A-Z]{2}-\d{4,}$/;

export function isDisplayId(value: string): boolean {
  return DISPLAY_ID_RE.test(value.trim().toUpperCase());
}

export function formatPrice(cents: number | null): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

/** "12.5" → 1250. Empty or invalid → null. */
export function parsePriceToCents(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * PostgREST `or=` filters are comma- and paren-delimited, so a search term
 * containing them would break the filter (or widen it). Keep word characters,
 * spaces and the few marks part numbers use.
 */
export function sanitizeSearch(term: string): string {
  return term.replace(/[^\p{L}\p{N}\s\-_./#]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const ITEM_FIELDS: (keyof ItemInput)[] = [
  'name', 'kind', 'description', 'category_id', 'location_id', 'quantity', 'min_quantity',
  'brand', 'model', 'mpn', 'upc', 'condition', 'compatibility', 'purchase_date',
  'purchase_price_cents', 'notes',
];

/** Which editable fields an edit actually changed, as { field: [before, after] }. */
export function diffItem(before: ShopItem, after: Partial<ItemInput>): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of ITEM_FIELDS) {
    if (!(key in after)) continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changes[key] = [a ?? null, b ?? null];
  }
  return changes;
}

export function locationName(id: string | null, locations: ShopLocation[]): string {
  return pathLabel(id, locations) || 'No location';
}
