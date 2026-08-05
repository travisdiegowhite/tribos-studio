/**
 * Lazy fetch of the normalized activity streams from /api/activity-streams.
 * The endpoint caches expensive tiers server-side and sets Cache-Control,
 * so repeat views ride the HTTP cache.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { NormalizedStreams } from '../model/streamTypes';

interface UseActivityStreamsResult {
  streams: NormalizedStreams | null;
  loading: boolean;
  error: string | null;
}

export function useActivityStreams(activityId: string | undefined): UseActivityStreamsResult {
  const [streams, setStreams] = useState<NormalizedStreams | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setStreams(null);
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const resp = await fetch(`/api/activity-streams?activityId=${encodeURIComponent(activityId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Streams request failed (${resp.status})`);
        const payload = (await resp.json()) as NormalizedStreams;
        if (!cancelled) setStreams(payload);
      } catch (e) {
        if (!cancelled && (e as Error).name !== 'AbortError') {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activityId]);

  return { streams, loading, error };
}
