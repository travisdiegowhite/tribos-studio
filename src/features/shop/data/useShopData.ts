import { useCallback, useEffect, useState } from 'react';
import { createLocation, listCategories, listLocations, seedDefaults, signedPhotoUrls } from './shopApi';
import type { ShopCategory, ShopLocation } from '../types';

/**
 * Categories and locations, which almost every screen needs. A first-time
 * owner is given the default categories before the first read returns.
 */
export function useCatalog() {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [locations, setLocations] = useState<ShopLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let cats = await listCategories();
      if (cats.length === 0) {
        await seedDefaults();
        cats = await listCategories();
      }
      setCategories(cats);
      setLocations(await listLocations());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addLocation = useCallback(async (name: string, parentId: string | null = null) => {
    const loc = await createLocation(name, parentId);
    setLocations((prev) => [...prev, loc]);
    return loc;
  }, []);

  return { categories, locations, loading, error, reload, addLocation };
}

/** Signed URLs for a set of private photo paths, refreshed when the set changes. */
export function usePhotoUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let cancelled = false;
    signedPhotoUrls(key ? key.split('|') : []).then((u) => { if (!cancelled) setUrls(u); });
    return () => { cancelled = true; };
  }, [key]);
  return urls;
}
