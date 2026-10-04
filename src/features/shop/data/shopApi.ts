/**
 * Every Supabase call the shop makes. Runs in the browser under RLS: the
 * policies in migration 127 scope every row to auth.uid(), so user_id here is
 * only what new rows are stamped with, not a security boundary.
 */
import { supabase } from '../host';
import type { ItemDraft, ShopCategory, ShopItem, ShopItemEvent, ShopLocation } from '../types';
import { findByPath, splitPath } from '../logic/tree';
import type { ImportPlan } from '../logic/csv';
import { removePhoto } from './photos';

const PAGE = 1000; // PostgREST's default max rows per request

function fail(error: { message: string; code?: string } | null, what: string): void {
  if (!error) return;
  // 23503 = foreign-key violation: a category that still holds items.
  if (error.code === '23503') throw new Error(`${what}: it still has items in it. Move or delete them first.`);
  if (error.code === '42P01') throw new Error(`${what}: the shop tables are missing — apply migration 127.`);
  throw new Error(`${what}: ${error.message}`);
}

async function fetchAllRows<T>(table: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + PAGE - 1);
    fail(error, `Loading ${table}`);
    out.push(...((data as T[]) || []));
    if (!data || data.length < PAGE) return out;
  }
}

export interface ShopSnapshot {
  categories: ShopCategory[];
  locations: ShopLocation[];
  items: ShopItem[];
}

/** Loads everything, seeding the default categories on first open. */
export async function loadShop(): Promise<ShopSnapshot> {
  let categories = await fetchAllRows<ShopCategory>('shop_categories', 'sort_order');
  if (categories.length === 0) {
    const { error } = await supabase.rpc('shop_seed_defaults');
    fail(error, 'Setting up categories');
    categories = await fetchAllRows<ShopCategory>('shop_categories', 'sort_order');
  }
  const [locations, items] = await Promise.all([
    fetchAllRows<ShopLocation>('shop_locations', 'sort_order'),
    fetchAllRows<ShopItem>('shop_items', 'created_at'),
  ]);
  return { categories, locations, items: items.map(normaliseItem) };
}

/** numeric comes back from PostgREST as a string. */
function normaliseItem(row: ShopItem): ShopItem {
  return {
    ...row,
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    compatibility: row.compatibility || [],
    tags: row.tags || [],
  };
}

// ── Items ───────────────────────────────────────────────────────────────

export async function createItem(userId: string, draft: ItemDraft): Promise<ShopItem> {
  const { data, error } = await supabase.from('shop_items').insert({ ...draft, user_id: userId }).select().single();
  fail(error, 'Saving item');
  return normaliseItem(data as ShopItem);
}

export async function updateItem(id: string, patch: Partial<ItemDraft> & { photo_path?: string | null }): Promise<ShopItem> {
  const { data, error } = await supabase.from('shop_items').update(patch).eq('id', id).select().single();
  fail(error, 'Saving item');
  return normaliseItem(data as ShopItem);
}

export async function deleteItem(item: ShopItem): Promise<void> {
  const { error } = await supabase.from('shop_items').delete().eq('id', item.id);
  fail(error, 'Deleting item');
  if (item.photo_path) await removePhoto(item.photo_path);
}

export async function fetchItemEvents(itemId: string): Promise<ShopItemEvent[]> {
  const { data, error } = await supabase
    .from('shop_item_events')
    .select('id, item_id, kind, details, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(50);
  fail(error, 'Loading history');
  return (data as ShopItemEvent[]) || [];
}

// ── Categories ──────────────────────────────────────────────────────────

export async function createCategory(
  userId: string,
  fields: { name: string; parent_id: string | null; prefix: string | null; sort_order: number },
): Promise<ShopCategory> {
  const { data, error } = await supabase.from('shop_categories').insert({ ...fields, user_id: userId }).select().single();
  if (error?.code === '23505') throw new Error(`The prefix ${fields.prefix} is already used by another category.`);
  fail(error, 'Adding category');
  return data as ShopCategory;
}

export async function renameCategory(id: string, name: string): Promise<ShopCategory> {
  const { data, error } = await supabase.from('shop_categories').update({ name }).eq('id', id).select().single();
  fail(error, 'Renaming category');
  return data as ShopCategory;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('shop_categories').delete().eq('id', id);
  fail(error, 'Deleting category');
}

// ── Locations ───────────────────────────────────────────────────────────

export async function createLocation(
  userId: string,
  fields: { name: string; parent_id: string | null; sort_order?: number },
): Promise<ShopLocation> {
  const { data, error } = await supabase
    .from('shop_locations')
    .insert({ sort_order: 0, ...fields, user_id: userId })
    .select()
    .single();
  fail(error, 'Adding location');
  return data as ShopLocation;
}

export async function renameLocation(id: string, name: string): Promise<ShopLocation> {
  const { data, error } = await supabase.from('shop_locations').update({ name }).eq('id', id).select().single();
  fail(error, 'Renaming location');
  return data as ShopLocation;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('shop_locations').delete().eq('id', id);
  fail(error, 'Deleting location');
}

// ── CSV import ──────────────────────────────────────────────────────────

export interface ImportResult {
  items: ShopItem[];
  locations: ShopLocation[];
}

/**
 * Creates the plan's new locations parent-first, then inserts the valid rows
 * in batches. Rows already inserted stay inserted if a later batch fails; the
 * error says how far it got.
 */
export async function importItems(
  userId: string,
  plan: ImportPlan,
  existingLocations: readonly ShopLocation[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const locations = [...existingLocations];
  const created: ShopLocation[] = [];
  for (const path of plan.newLocationPaths) {
    if (findByPath(path, locations)) continue;
    const parts = splitPath(path);
    const parent = parts.length > 1 ? findByPath(parts.slice(0, -1).join(' > '), locations) : undefined;
    const loc = await createLocation(userId, { name: parts[parts.length - 1], parent_id: parent?.id ?? null });
    locations.push(loc);
    created.push(loc);
  }

  const drafts = plan.rows
    .filter((r) => r.draft)
    .map((r) => ({
      ...r.draft!,
      location_id: r.newLocationPath ? findByPath(r.newLocationPath, locations)?.id ?? null : r.draft!.location_id,
    }));

  const items: ShopItem[] = [];
  const BATCH = 200;
  for (let i = 0; i < drafts.length; i += BATCH) {
    const batch = drafts.slice(i, i + BATCH).map((d) => ({ ...d, user_id: userId }));
    const { data, error } = await supabase.from('shop_items').insert(batch).select();
    if (error) {
      throw new Error(`Import stopped after ${items.length} of ${drafts.length} items: ${error.message}`);
    }
    items.push(...((data as ShopItem[]) || []).map(normaliseItem));
    onProgress?.(items.length, drafts.length);
  }
  return { items, locations: created };
}
