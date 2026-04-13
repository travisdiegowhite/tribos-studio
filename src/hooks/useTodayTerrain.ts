/**
 * useTodayTerrain Hook
 *
 * Fetches the most recent training_load_daily.terrain_class for the
 * current user so the StatusBar can surface today's terrain
 * classification (flat / rolling / hilly / mountainous) as a small
 * chip above the fitness cells.
 *
 * Returns null while loading, when the user has no training_load_daily
 * rows yet, or when the most-recent row is pre-migration-068
 * (terrain_class still NULL). Callers should treat null as
 * "don't render anything."
 *
 * Mirrors useFormConfidence.ts — same query pattern, same null
 * semantics, so the two hooks can be called together on Dashboard
 * without duplicating the point-lookup.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type TerrainClass = 'flat' | 'rolling' | 'hilly' | 'mountainous';

export function useTodayTerrain(userId: string | undefined | null): TerrainClass | null {
  const [value, setValue] = useState<TerrainClass | null>(null);

  useEffect(() => {
    if (!userId) {
      setValue(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('training_load_daily')
        .select('terrain_class')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setValue(null);
        return;
      }
      const raw = (data as { terrain_class: TerrainClass | null } | null)?.terrain_class;
      setValue(raw ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return value;
}
