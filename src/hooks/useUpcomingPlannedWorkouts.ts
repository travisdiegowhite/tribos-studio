/**
 * useUpcomingPlannedWorkouts — the user's next scheduled, uncompleted workouts,
 * enriched with their library structure (cycling or running), for the RB2
 * workout picker.
 *
 * One-shot fetch on mount (no Realtime) via the frontend Supabase singleton.
 *
 * A row resolves either from the workout library or, for a coach-authored
 * session, from its embedded `workout_templates` row. Only rows that resolve
 * to neither are dropped — without a structure there is nothing to overlay.
 * Coach workouts used to fall into that gap and vanish from the picker
 * entirely, which is why riders whose training comes from a human coach saw an
 * empty "Planned" tab.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTodayString } from '../utils/dateUtils';
import { getAnyWorkoutById } from '../data/workoutLookup';
import { workoutDefinitionFromRow } from '../utils/customWorkoutRow';
import type { WorkoutDefinition } from '../types/training';

export interface UpcomingPlannedWorkout {
  id: string;
  scheduledDate: string;
  name: string;
  workout: WorkoutDefinition;
  targetDurationMinutes: number | null;
  targetDistanceKm: number | null;
}

export function useUpcomingPlannedWorkouts(userId: string | null | undefined) {
  const [workouts, setWorkouts] = useState<UpcomingPlannedWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumped to re-run the fetch after a workout is added, so a session the
  // rider just described shows up in the Planned tab without a reload.
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setWorkouts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('planned_workouts')
        .select('*, workout_templates(*)')
        .eq('user_id', userId)
        .gte('scheduled_date', getTodayString())
        .eq('completed', false)
        .order('scheduled_date', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (error) {
        console.error('Error loading upcoming planned workouts:', error);
        setWorkouts([]);
        setLoading(false);
        return;
      }

      const enriched: UpcomingPlannedWorkout[] = [];
      for (const row of data ?? []) {
        const workout =
          (row.workout_id ? getAnyWorkoutById(row.workout_id) : null) ??
          workoutDefinitionFromRow(row);
        if (!workout) continue;
        enriched.push({
          id: row.id,
          scheduledDate: row.scheduled_date,
          name: row.name ?? workout.name,
          workout,
          targetDurationMinutes: row.target_duration ?? null,
          targetDistanceKm: row.target_distance_km ?? null,
        });
      }
      setWorkouts(enriched);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  return { workouts, loading, refresh };
}
