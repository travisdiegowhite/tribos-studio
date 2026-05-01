/**
 * useSuggestedRoutes Hook
 *
 * Calls /api/today-route-suggestions to rank the user's saved routes
 * against today's planned workout. Returns the top 3 plus a setter for
 * the per-day selection (persisted in localStorage so the choice
 * survives page reloads within the same day).
 *
 * Selection is keyed by YYYY-MM-DD so a refresh after midnight resets
 * the picker — if the user wants to keep yesterday's route they can
 * pick it again from the list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface SuggestedRoute {
  id: string;
  name: string;
  description: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  geometry: unknown;
  waypoints: unknown;
  route_type: string | null;
  surface_type: string | null;
  training_goal: string | null;
}

export interface RouteSuggestion {
  route: SuggestedRoute;
  score: number;
  reasons: string[];
}

const SELECTION_STORAGE_KEY = 'tribos:today:selectedRoute';

interface SelectionRecord {
  date: string;       // YYYY-MM-DD
  routeId: string;
}

function readSelection(date: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectionRecord;
    return parsed.date === date ? parsed.routeId : null;
  } catch {
    return null;
  }
}

function writeSelection(record: SelectionRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export interface UseSuggestedRoutesReturn {
  suggestions: RouteSuggestion[];
  selectedRouteId: string | null;
  selectRoute: (routeId: string) => void;
  loading: boolean;
  error: string | null;
}

export function useSuggestedRoutes(
  userId: string | undefined | null,
  date: string,
): UseSuggestedRoutesReturn {
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(() => readSelection(date));

  // Reset the selection when the active date changes (e.g. midnight rollover).
  useEffect(() => {
    setSelectedRouteId(readSelection(date));
  }, [date]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const params = new URLSearchParams({ date });
        const response = await fetch(`/api/today-route-suggestions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json() as { suggestions: RouteSuggestion[] };

        if (cancelled) return;
        setSuggestions(json.suggestions || []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load suggestions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, date]);

  const selectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    writeSelection({ date, routeId });
  }, [date]);

  // If suggestions have loaded but nothing is selected, default to the top one.
  const resolvedSelected = useMemo(() => {
    if (selectedRouteId) return selectedRouteId;
    if (suggestions.length > 0) return suggestions[0].route.id;
    return null;
  }, [selectedRouteId, suggestions]);

  return { suggestions, selectedRouteId: resolvedSelected, selectRoute, loading, error };
}
