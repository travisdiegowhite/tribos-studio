/**
 * Item photos live in the private `shop-photos` bucket at
 * {user_id}/{item_id}/{timestamp}.jpg — the first folder is the owner, which
 * is what the storage policies in migration 127 check.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../host';

const BUCKET = 'shop-photos';
const MAX_EDGE = 1600;
const SIGNED_TTL_S = 3600;

/** Phone photos are 3–8 MB; scale to 1600px JPEG so they fit the 5 MB cap and load fast. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // undecodable here (e.g. HEIC on desktop) — let the bucket's MIME check decide
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob || file;
}

export async function uploadItemPhoto(userId: string, itemId: string, file: File): Promise<string> {
  const blob = await shrinkPhoto(file);
  const path = `${userId}/${itemId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

export async function removePhoto(path: string): Promise<void> {
  // Best effort: an orphaned object costs pennies, a thrown error here would
  // block the delete the user actually asked for.
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[shop] could not remove photo', path, error.message);
  signedCache.delete(path);
}

// Signed URLs are cached for most of their life so a list of thumbnails does
// not re-sign on every render.
const signedCache = new Map<string, { url: string; expires: number }>();

function cached(path: string): string | null {
  const hit = signedCache.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

async function signMany(paths: string[]): Promise<void> {
  const missing = paths.filter((p) => !cached(p));
  if (!missing.length) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL_S);
  if (error || !data) return;
  const expires = Date.now() + (SIGNED_TTL_S - 300) * 1000;
  for (const row of data) if (row.signedUrl && row.path) signedCache.set(row.path, { url: row.signedUrl, expires });
}

/** path → signed URL for every non-null path, signed in one request. */
export function useSignedPhotoUrls(paths: readonly (string | null | undefined)[]): Record<string, string> {
  const wanted = paths.filter((p): p is string => !!p);
  const key = wanted.join('\n');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split('\n') : [];
    signMany(list).then(() => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const p of list) {
        const u = cached(p);
        if (u) next[p] = u;
      }
      setUrls(next);
    });
    return () => { cancelled = true; };
  }, [key]);
  return urls;
}
