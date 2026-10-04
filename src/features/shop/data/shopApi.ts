/**
 * Every shop query lives here. Pages and hooks never call Supabase directly,
 * so this file (plus host.ts) is all that changes if the shop moves.
 *
 * All reads and writes run under the browser client, so RLS
 * (owner_id = auth.uid()) is the security boundary; owner_id is filled by the
 * column default and never sent from here.
 */
import { resizeImageFile, supabase } from '../host';
import { diffItem, sanitizeSearch } from '../lib/catalog';
import type {
  ActivityAction,
  ItemFilters,
  ItemInput,
  ShopActivity,
  ShopCategory,
  ShopItem,
  ShopItemPhoto,
  ShopLocation,
} from '../types';

const PHOTO_BUCKET = 'shop-photos';

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

function unwrap<T>({ data, error }: Result<T>, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

/**
 * The activity log is a record of a write that already succeeded, so a failed
 * log entry must not undo or hide that write. It is reported, not thrown.
 */
async function logActivity(
  item: Pick<ShopItem, 'id' | 'display_id'>,
  action: ActivityAction,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('shop_activity')
    .insert({ item_id: item.id, display_id: item.display_id, action, details });
  if (error) console.warn(`[shop] activity log failed for ${item.display_id} (${action}):`, error.message);
}

// ── Catalog ──────────────────────────────────────────────────────────────

/** Gives a first-time owner the default categories and tags. Idempotent. */
export async function seedDefaults(): Promise<void> {
  unwrap(await supabase.rpc('shop_seed_defaults'), 'Seeding shop categories');
}

export async function listCategories(): Promise<ShopCategory[]> {
  return unwrap<ShopCategory[]>(
    await supabase.from('shop_categories').select('*').order('sort_order').order('name'),
    'Loading categories',
  ) ?? [];
}

export async function listLocations(): Promise<ShopLocation[]> {
  return unwrap<ShopLocation[]>(
    await supabase.from('shop_locations').select('*').order('sort_order').order('name'),
    'Loading locations',
  ) ?? [];
}

export async function createLocation(name: string, parentId: string | null = null): Promise<ShopLocation> {
  return unwrap<ShopLocation>(
    await supabase.from('shop_locations').insert({ name: name.trim(), parent_id: parentId }).select('*').single(),
    'Adding location',
  );
}

/**
 * The ID the next item with this prefix will get, for the Add form. A preview
 * only: the trigger assigns the real one at insert time.
 */
export async function nextDisplayId(prefix: string): Promise<string> {
  const row = unwrap<{ next_value: number } | null>(
    await supabase.from('shop_id_sequences').select('next_value').eq('prefix', prefix).maybeSingle(),
    'Loading next ID',
  );
  return `${prefix}-${String(row?.next_value ?? 1).padStart(4, '0')}`;
}

// ── Items ────────────────────────────────────────────────────────────────

export async function listItems(filters: ItemFilters = {}, limit = 1000): Promise<ShopItem[]> {
  let query = supabase.from('shop_items').select('*');
  if (!filters.includeArchived) query = query.is('archived_at', null);
  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.locationId) query = query.eq('location_id', filters.locationId);
  const term = sanitizeSearch(filters.search ?? '');
  if (term) {
    const like = `%${term}%`;
    query = query.or(
      ['name', 'display_id', 'brand', 'model', 'mpn', 'upc'].map((col) => `${col}.ilike.${like}`).join(','),
    );
  }
  return unwrap<ShopItem[]>(await query.order('updated_at', { ascending: false }).limit(limit), 'Loading items') ?? [];
}

export async function getItemByDisplayId(displayId: string): Promise<ShopItem | null> {
  return unwrap<ShopItem | null>(
    await supabase.from('shop_items').select('*').eq('display_id', displayId.trim().toUpperCase()).maybeSingle(),
    'Loading item',
  );
}

/** display_id is left out: the database assigns it from the category. */
export async function createItem(input: ItemInput): Promise<ShopItem> {
  const item = unwrap<ShopItem>(
    await supabase.from('shop_items').insert({ ...input, name: input.name.trim() }).select('*').single(),
    'Saving item',
  );
  await logActivity(item, 'created', { quantity: item.quantity });
  return item;
}

/**
 * Saves only the fields that changed. A location change is logged as a move,
 * everything else as an edit, so the log reads the way the bench does.
 */
export async function updateItem(before: ShopItem, patch: Partial<ItemInput>): Promise<ShopItem> {
  const changes = diffItem(before, patch);
  const fields = Object.keys(changes) as (keyof ItemInput)[];
  if (fields.length === 0) return before;

  const update = Object.fromEntries(fields.map((f) => [f, patch[f]]));
  const item = unwrap<ShopItem>(
    await supabase.from('shop_items').update(update).eq('id', before.id).select('*').single(),
    'Saving changes',
  );

  if (changes.location_id) {
    await logActivity(item, 'moved', { from: changes.location_id[0], to: changes.location_id[1] });
  }
  if (changes.quantity) {
    await logActivity(item, 'quantity', { from: changes.quantity[0], to: changes.quantity[1] });
  }
  const edited = fields.filter((f) => f !== 'location_id' && f !== 'quantity');
  if (edited.length) {
    await logActivity(item, 'edited', { fields: edited });
  }
  return item;
}

/**
 * +1 / −1 at the bench. The update only lands if the quantity is still what
 * this screen showed, so two tabs can't silently overwrite each other.
 */
export async function adjustQuantity(item: ShopItem, delta: number): Promise<ShopItem> {
  const next = Math.max(0, item.quantity + delta);
  if (next === item.quantity) return item;
  const updated = unwrap<ShopItem | null>(
    await supabase
      .from('shop_items')
      .update({ quantity: next })
      .eq('id', item.id)
      .eq('quantity', item.quantity)
      .select('*')
      .maybeSingle(),
    'Changing quantity',
  );
  if (!updated) throw new Error('Changing quantity: the count changed somewhere else. Reload and try again.');
  await logActivity(updated, 'quantity', { from: item.quantity, to: next });
  return updated;
}

export async function setArchived(item: ShopItem, archived: boolean): Promise<ShopItem> {
  const updated = unwrap<ShopItem>(
    await supabase
      .from('shop_items')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', item.id)
      .select('*')
      .single(),
    archived ? 'Archiving item' : 'Restoring item',
  );
  await logActivity(updated, archived ? 'archived' : 'restored');
  return updated;
}

export async function listActivity(itemId: string, limit = 50): Promise<ShopActivity[]> {
  return unwrap<ShopActivity[]>(
    await supabase
      .from('shop_activity')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'Loading activity',
  ) ?? [];
}

// ── Photos ───────────────────────────────────────────────────────────────

export async function listPhotos(itemId: string): Promise<ShopItemPhoto[]> {
  return unwrap<ShopItemPhoto[]>(
    await supabase
      .from('shop_item_photos')
      .select('*')
      .eq('item_id', itemId)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    'Loading photos',
  ) ?? [];
}

/** Primary photo path per item, for list thumbnails. */
export async function primaryPhotoPaths(itemIds: string[]): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};
  const rows = unwrap<Pick<ShopItemPhoto, 'item_id' | 'storage_path' | 'is_primary'>[]>(
    await supabase
      .from('shop_item_photos')
      .select('item_id, storage_path, is_primary')
      .in('item_id', itemIds)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    'Loading photos',
  ) ?? [];
  const out: Record<string, string> = {};
  for (const r of rows) if (!out[r.item_id]) out[r.item_id] = r.storage_path;
  return out;
}

/**
 * Resized in the browser (which also strips EXIF), uploaded to the private
 * bucket under `{owner_id}/{item_id}/…` — the folder the storage policy checks.
 * The first photo of an item becomes its primary.
 */
export async function addPhoto(item: ShopItem, ownerId: string, file: File | Blob): Promise<ShopItemPhoto> {
  const blob = await resizeImageFile(file);
  const path = `${ownerId}/${item.id}/${crypto.randomUUID()}.jpg`;
  unwrap(
    await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: 'private, max-age=0' }),
    'Uploading photo',
  );

  const existing = await listPhotos(item.id);
  const photo = unwrap<ShopItemPhoto>(
    await supabase
      .from('shop_item_photos')
      .insert({ item_id: item.id, storage_path: path, is_primary: existing.length === 0 })
      .select('*')
      .single(),
    'Saving photo',
  );
  await logActivity(item, 'photo', { path });
  return photo;
}

/** Signed URLs for private photos, keyed by path. Missing ones are left out. */
export async function signedPhotoUrls(paths: string[], expiresInS = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresInS);
  if (error) {
    console.warn('[shop] signing photo URLs failed:', error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
