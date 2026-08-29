/**
 * useUpcomingPlannedWorkouts — the user's next scheduled, uncompleted workouts,
 * enriched with their library structure (cycling or running), for the RB2
 * workout picker.
 *
 * One-shot fetch on mount (no Realtime) via the frontend Supabase singleton.
 * Rows are resolved through `resolvePlannedWorkout`, so an arc-generated row
 * that names no library workout still contributes the closest stand-in for
 * its type and length (flagged `inferred`). Only rows with nothing paintable
 * at all — rest days, off-bike work — are dropped.
 */

import { useEffect, useState } from 'react';
import { getTodayString } from '../utils/dateUtils';
import { fetchPlannedSessions } from '../lib/calendar/readPlannedSessions';
import { resolvePlannedWorkout } from '../data/workoutResolution';
import type { WorkoutDefinition } from '../types/training';

export interface UpcomingPlannedWorkout {
  id: string;
  scheduledDate: string;
  name: string;
  workout: WorkoutDefinition;
  /** True when `workout` is a stand-in matched by type + length, not the row's own prescription. */
  inferred: boolean;
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
      const data = await fetchPlannedSessions(userId, {
        from: getTodayString(),
        includeCompleted: false,
        limit: 20,
      });

      if (cancelled) return;

      const enriched: UpcomingPlannedWorkout[] = [];
      for (const row of data) {
        const resolved = resolvePlannedWorkout(row);
        if (!resolved) continue;
        enriched.push({
          id: row.id,
          scheduledDate: row.scheduled_date,
          name: row.name ?? resolved.workout.name,
          workout: resolved.workout,
          inferred: resolved.inferred,
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
