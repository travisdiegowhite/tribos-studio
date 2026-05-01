/**
 * useReadinessCheckin Hook
 *
 * Read/write today's row in `fatigue_checkins`. Used by the inline
 * morning chip on the Today view (above the state strip).
 *
 * The table is keyed UNIQUE(user_id, date) so there's only ever one
 * check-in per day — the chip submits via upsert.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ReadinessRow {
  leg_feel: number | null;        // 1–5
  energy: number | null;          // 1–5
  motivation: number | null;      // 1–5
  hrv_status: string | null;
  notes: string | null;
}

export interface ReadinessInput extends Partial<ReadinessRow> {}

export interface UseReadinessCheckinReturn {
  loggedToday: boolean;
  checkin: ReadinessRow | null;
  loading: boolean;
  log: (input: ReadinessInput) => Promise<void>;
}

export function useReadinessCheckin(
  userId: string | undefined | null,
  date: string,
): UseReadinessCheckinReturn {
  const [checkin, setCheckin] = useState<ReadinessRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from('fatigue_checkins')
        .select('leg_feel, energy, motivation, hrv_status, notes')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();

      if (cancelled) return;
      setCheckin((data as ReadinessRow | null) ?? null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId, date]);

  const log = useCallback(async (input: ReadinessInput) => {
    if (!userId) return;

    const next = {
      user_id: userId,
      date,
      leg_feel: input.leg_feel ?? checkin?.leg_feel ?? null,
      energy: input.energy ?? checkin?.energy ?? null,
      motivation: input.motivation ?? checkin?.motivation ?? null,
      hrv_status: input.hrv_status ?? checkin?.hrv_status ?? null,
      notes: input.notes ?? checkin?.notes ?? null,
    };

    const { error } = await supabase
      .from('fatigue_checkins')
      .upsert(next, { onConflict: 'user_id, date' });

    if (!error) {
      setCheckin({
        leg_feel: next.leg_feel,
        energy: next.energy,
        motivation: next.motivation,
        hrv_status: next.hrv_status,
        notes: next.notes,
      });
    }
  }, [userId, date, checkin]);

  return {
    loggedToday: checkin !== null,
    checkin,
    loading,
    log,
  };
}
