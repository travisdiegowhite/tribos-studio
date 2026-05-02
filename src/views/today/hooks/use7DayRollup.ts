/**
 * Sums distance, elevation gain, and moving time across the user's last 7
 * calendar days of activities. Excludes hidden activities the same way
 * the rest of the dashboard does (see TrainingDashboard.jsx).
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export interface SevenDayRollup {
  distanceKm: number;
  elevationM: number;
  movingTimeSec: number;
}

const EMPTY: SevenDayRollup = {
  distanceKm: 0,
  elevationM: 0,
  movingTimeSec: 0,
};

export function use7DayRollup(userId: string | null | undefined): {
  rollup: SevenDayRollup;
  loading: boolean;
} {
  const [rollup, setRollup] = useState<SevenDayRollup>(EMPTY);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setRollup(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data } = await supabase
        .from('activities')
        .select('distance_meters, distance, total_elevation_gain, moving_time, duration_seconds, is_hidden')
        .eq('user_id', userId)
        .gte('start_date', sevenDaysAgo.toISOString());

      if (cancelled) return;

      if (!Array.isArray(data)) {
        setRollup(EMPTY);
        setLoading(false);
        return;
      }

      let distanceKm = 0;
      let elevationM = 0;
      let movingTimeSec = 0;

      for (const row of data as Array<{
        distance_meters?: number | null;
        distance?: number | null;
        total_elevation_gain?: number | null;
        moving_time?: number | null;
        duration_seconds?: number | null;
        is_hidden?: boolean | null;
      }>) {
        if (row.is_hidden) continue;
        const meters = row.distance_meters ?? row.distance ?? 0;
        distanceKm += (meters || 0) / 1000;
        elevationM += row.total_elevation_gain ?? 0;
        movingTimeSec += row.moving_time ?? row.duration_seconds ?? 0;
      }

      setRollup({ distanceKm, elevationM, movingTimeSec });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { rollup, loading };
}
