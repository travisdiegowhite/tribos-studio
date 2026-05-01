/**
 * useNextRace Hook
 *
 * Returns the next A-priority race within 180 days, or null. Calls the
 * `get_next_a_race(p_user_id)` Postgres function via Supabase RPC.
 *
 * The function is SECURITY DEFINER so it runs server-side regardless of
 * RLS — pass the user's id as a parameter rather than relying on
 * `auth.uid()`.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface NextRaceRow {
  id: string;
  name: string;
  race_date: string;            // YYYY-MM-DD
  race_type: string | null;
  distance_km: number | null;
  days_until: number;
  goal_time_minutes: number | null;
  goal_power_watts: number | null;
  goal_placement: number | null;
}

export interface UseNextRaceReturn {
  race: NextRaceRow | null;
  daysToRace: number | null;
  loading: boolean;
}

export function useNextRace(userId: string | undefined | null): UseNextRaceReturn {
  const [race, setRace] = useState<NextRaceRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase.rpc('get_next_a_race', { p_user_id: userId });

      if (cancelled) return;
      if (error) {
        setRace(null);
        setLoading(false);
        return;
      }

      const row = Array.isArray(data) && data.length > 0 ? (data[0] as NextRaceRow) : null;
      setRace(row);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { race, daysToRace: race?.days_until ?? null, loading };
}
