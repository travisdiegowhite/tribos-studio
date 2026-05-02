/**
 * Wraps the `get_next_a_race(p_user_id)` Postgres function (migration 015).
 * Returns the next A-priority race in the next 180 days, with `daysUntil`
 * resolved server-side from `CURRENT_DATE`.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export interface NextARace {
  raceId: string;
  name: string;
  raceDate: string;
  daysUntil: number;
}

export function useNextARace(userId: string | null | undefined): {
  race: NextARace | null;
  loading: boolean;
} {
  const [race, setRace] = useState<NextARace | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setRace(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase.rpc('get_next_a_race', {
        p_user_id: userId,
      });

      if (cancelled) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setRace(null);
        setLoading(false);
        return;
      }
      const row = data[0] as {
        id: string;
        name: string;
        race_date: string;
        days_until: number;
      };
      setRace({
        raceId: row.id,
        name: row.name,
        raceDate: row.race_date,
        daysUntil: row.days_until,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { race, loading };
}
