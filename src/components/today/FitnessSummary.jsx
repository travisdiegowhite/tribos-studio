import { useState, useEffect, useRef } from 'react';
import { Box, Text, Skeleton } from '@mantine/core';
import { supabase } from '../../lib/supabase';

/**
 * FitnessSummary — AI-generated plain-language fitness summary
 *
 * Fetches a 1–2 sentence summary from the fitness-summary API endpoint.
 * Loads async with skeleton. Caches in component state to avoid refetching
 * on re-renders when metrics haven't changed.
 */
function FitnessSummary({ tfi, afi, formScore, lastRideRss }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastFetchKey = useRef(null);

  useEffect(() => {
    // Don't fetch if we have no metrics
    if (tfi === 0 && afi === 0 && formScore === 0) return;

    // Build a key to detect meaningful metric changes
    const fetchKey = `${tfi}:${afi}:${formScore}:${lastRideRss || 0}`;
    if (fetchKey === lastFetchKey.current) return;

    let cancelled = false;

    async function fetchSummary() {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const apiBase = import.meta.env.VITE_API_BASE_URL || '';
        const res = await fetch(`${apiBase}/api/fitness-summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            surface: 'today',
            clientMetrics: { tfi, afi, formScore, lastRideRss },
            // Send browser timezone so the server computes "today" and
            // "this week" in the same timezone as the stats cards above.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!cancelled) {
          setSummary(data.summary);
          lastFetchKey.current = fetchKey;
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch fitness summary:', err);
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();
    return () => { cancelled = true; };
  }, [tfi, afi, formScore, lastRideRss]);

  // Don't render anything if there's no data to show
  if (!loading && !summary && !error) return null;

  return (
    <Box
      style={{
        borderLeft: '3px solid var(--color-teal)',
        padding: '14px 16px',
        backgroundColor: 'var(--color-card)',
      }}
    >
      {loading && !summary ? (
        <Skeleton height={14} width="80%" />
      ) : error ? (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          Unable to load fitness summary
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--color-text-secondary)',
          }}
        >
          {summary}
        </Text>
      )}
    </Box>
  );
}

export default FitnessSummary;
