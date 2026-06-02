/**
 * useUpcomingPlannedWorkouts — the user's next scheduled, uncompleted workouts,
 * enriched with their library structure (cycling or running), for the RB2
 * workout picker.
 *
 * One-shot fetch on mount (no Realtime) via the frontend Supabase singleton.
 * Rows whose `workout_id` doesn't resolve in either library are dropped —
 * without a structure there's nothing to overlay.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTodayString } from '../utils/dateUtils';
import { getAnyWorkoutById } from '../data/workoutLookup';
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
        .select('*')
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
        if (!row.workout_id) continue;
        const workout = getAnyWorkoutById(row.workout_id);
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
  }, [userId]);

  return { workouts, loading };
}
