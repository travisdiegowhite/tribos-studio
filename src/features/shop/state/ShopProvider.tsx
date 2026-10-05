/**
 * Loads the whole inventory once and keeps it in memory. A personal shop is
 * hundreds to a few thousand rows, so search and filtering run client-side
 * and feel instant; every mutation writes through shopApi and then patches
 * the local copy with the row the database returned.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShopUser } from '../host';
import * as api from '../data/shopApi';
import { uploadItemPhoto, removePhoto } from '../data/photos';
import type { ImportPlan } from '../logic/csv';
import type { ItemDraft, ShopCategory, ShopItem, ShopLocation } from '../types';

interface ShopState {
  loading: boolean;
  error: string | null;
  categories: ShopCategory[];
  locations: ShopLocation[];
  items: ShopItem[];
  reload: () => Promise<void>;
  saveItem: (
    draft: ItemDraft,
    opts?: { id?: string; photo?: File | null; photoPath?: string | null; removePhoto?: boolean },
  ) => Promise<ShopItem>;
  setQuantity: (item: ShopItem, quantity: number) => Promise<void>;
  deleteItem: (item: ShopItem) => Promise<void>;
  addCategory: (name: string, parentId: string | null, prefix: string | null) => Promise<ShopCategory>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addLocation: (name: string, parentId: string | null) => Promise<ShopLocation>;
  renameLocation: (id: string, name: string) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  runImport: (plan: ImportPlan, onProgress?: (done: number, total: number) => void) => Promise<number>;
}

const ShopContext = createContext<ShopState | null>(null);

export function useShop(): ShopState {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>');
  return ctx;
}

const replace = <T extends { id: string }>(rows: T[], row: T) => rows.map((r) => (r.id === row.id ? row : r));

export function ShopProvider({ children }: { children: ReactNode }) {
  const user = useShopUser();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [locations, setLocations] = useState<ShopLocation[]>([]);
  const [items, setItems] = useState<ShopItem[]>([]);

  const reload = useCallback(async () => {
    if (!userId) return;
    // `loading` is only true for the first open; later re-reads (after an
    // import or a cascade delete) refresh in place without blanking the page.
    setError(null);
    try {
      const snap = await api.loadShop();
      setCategories(snap.categories);
      setLocations(snap.locations);
      setItems(snap.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the shop');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const requireUser = useCallback(() => {
    if (!userId) throw new Error('Not signed in');
    return userId;
  }, [userId]);

  const saveItem = useCallback<ShopState['saveItem']>(async (draft, opts = {}) => {
    const uid = requireUser();
    let item = opts.id ? await api.updateItem(opts.id, draft) : await api.createItem(uid, draft);
    const oldPhoto = item.photo_path;
    if (opts.photo || opts.photoPath) {
      // A fresh file goes up after the row exists (its path carries the item
      // id); a photo already uploaded for identification is just attached.
      const path = opts.photoPath || await uploadItemPhoto(uid, item.id, opts.photo!);
      item = await api.updateItem(item.id, { photo_path: path });
      if (oldPhoto && oldPhoto !== path) await removePhoto(oldPhoto);
    } else if (opts.removePhoto && oldPhoto) {
      item = await api.updateItem(item.id, { photo_path: null });
      await removePhoto(oldPhoto);
    }
    setItems((rows) => (opts.id ? replace(rows, item) : [...rows, item]));
    return item;
  }, [requireUser]);

  const setQuantity = useCallback<ShopState['setQuantity']>(async (item, quantity) => {
    const next = Math.max(0, Math.round(quantity));
    setItems((rows) => replace(rows, { ...item, quantity: next })); // optimistic: the stepper must feel instant
    try {
      const saved = await api.updateItem(item.id, { quantity: next });
      setItems((rows) => replace(rows, saved));
    } catch (err) {
      setItems((rows) => replace(rows, item));
      throw err;
    }
  }, []);

  const deleteItem = useCallback<ShopState['deleteItem']>(async (item) => {
    await api.deleteItem(item);
    setItems((rows) => rows.filter((r) => r.id !== item.id));
  }, []);

  const addCategory = useCallback<ShopState['addCategory']>(async (name, parentId, prefix) => {
    const siblings = categories.filter((c) => c.parent_id === parentId);
    const row = await api.createCategory(requireUser(), {
      name: name.trim(),
      parent_id: parentId,
      prefix: parentId ? null : prefix,
      sort_order: siblings.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1,
    });
    setCategories((rows) => [...rows, row]);
    return row;
  }, [categories, requireUser]);

  const renameCategory = useCallback<ShopState['renameCategory']>(async (id, name) => {
    const row = await api.renameCategory(id, name.trim());
    setCategories((rows) => replace(rows, row));
  }, []);

  const deleteCategory = useCallback<ShopState['deleteCategory']>(async (id) => {
    await api.deleteCategory(id);
    // Children cascade in the database.
    await reload();
  }, [reload]);

  const addLocation = useCallback<ShopState['addLocation']>(async (name, parentId) => {
    const row = await api.createLocation(requireUser(), { name: name.trim(), parent_id: parentId });
    setLocations((rows) => [...rows, row]);
    return row;
  }, [requireUser]);

  const renameLocation = useCallback<ShopState['renameLocation']>(async (id, name) => {
    const row = await api.renameLocation(id, name.trim());
    setLocations((rows) => replace(rows, row));
  }, []);

  const deleteLocation = useCallback<ShopState['deleteLocation']>(async (id) => {
    await api.deleteLocation(id);
    // Children un-nest and items un-place in the database; re-read rather than mirror it.
    await reload();
  }, [reload]);

  const runImport = useCallback<ShopState['runImport']>(async (plan, onProgress) => {
    try {
      const result = await api.importItems(requireUser(), plan, locations, onProgress);
      return result.items.length;
    } finally {
      // Partial imports keep what landed, so always re-read.
      await reload();
    }
  }, [locations, reload, requireUser]);

  const value = useMemo<ShopState>(() => ({
    loading, error, categories, locations, items, reload,
    saveItem, setQuantity, deleteItem,
    addCategory, renameCategory, deleteCategory,
    addLocation, renameLocation, deleteLocation,
    runImport,
  }), [
    loading, error, categories, locations, items, reload,
    saveItem, setQuantity, deleteItem,
    addCategory, renameCategory, deleteCategory,
    addLocation, renameLocation, deleteLocation,
    runImport,
  ]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
