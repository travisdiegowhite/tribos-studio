import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useTodayHero — fetches the archetype-voiced hero paragraph from
 * /api/today-hero. Hydrates once per session plus on user changes.
 *
 * Return shape mirrors other dashboard hooks: `{ paragraph, archetype,
 * loading, error, refresh }` so components can show a skeleton while
 * loading and re-request on demand after persona switches.
 */
export default function useTodayHero() {
  const [state, setState] = useState({
    paragraph: null,
    archetype: null,
    loading: true,
    error: null,
    cached: null,
    generatedAt: null,
  });
  const inFlight = useRef(false);

  const fetchHero = useCallback(async ({ forceRefresh = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState({ paragraph: null, archetype: null, loading: false, error: null, cached: null, generatedAt: null });
        return;
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/today-hero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          forceRefresh,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setState({
        paragraph: data.paragraph || null,
        archetype: data.archetype || null,
        loading: false,
        error: null,
        cached: data.cached ?? null,
        generatedAt: data.generated_at || null,
      });
    } catch (err) {
      console.error('[useTodayHero] failed:', err);
      setState((s) => ({ ...s, loading: false, error: err.message || 'failed' }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchHero();
  }, [fetchHero]);

  return {
    ...state,
    refresh: () => fetchHero({ forceRefresh: true }),
  };
}
