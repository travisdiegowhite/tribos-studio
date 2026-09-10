import { useEffect, useState } from 'react';
import { Box } from '@mantine/core';
import { Bicycle, PersonSimpleRun } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';

const BUCKET = 'gear-photos';

/** Signed URL for a private gear photo, under the owner's RLS. Null until resolved or when absent. */
export function useSignedPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return undefined; }
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
      .then(({ data }) => { if (!cancelled) setUrl(data?.signedUrl || null); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

interface BikePhotoProps {
  path: string | null | undefined;
  alt: string;
  width: number | string;
  height: number;
  shoes?: boolean;
  iconSize?: number;
}

/** The bike's own photo, or a quiet glyph on the secondary surface until there is one. */
export function BikePhoto({ path, alt, width, height, shoes = false, iconSize = 40 }: BikePhotoProps) {
  const url = useSignedPhotoUrl(path);
  const Icon = shoes ? PersonSimpleRun : Bicycle;
  return (
    <Box
      style={{
        width, height, flex: '0 0 auto', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 0,
      }}
    >
      {url ? (
        <img src={url} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Icon size={iconSize} color="var(--color-text-muted)" />
      )}
    </Box>
  );
}
