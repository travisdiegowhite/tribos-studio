/**
 * useActivityAutoLink
 *
 * Auto-links completed cycling activities to planned workouts scheduled on the
 * same local date. Extracted from the (now-retired) TrainingPlanner so the
 * monthly calendar can own this behavior. Operates on raw snake_case
 * `planned_workouts` rows (the shape TrainingCalendar already loads).
 *
 * On each match it marks the planned workout completed, writes the actual load
 * (dual-writing canonical `actual_rss` + legacy `actual_tss` per the CLAUDE.md
 * metrics-freeze policy) and fires adaptation detection.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { calculateTSS, estimateTSS } from '../utils/trainingPlans';
import { isPowerSport } from '../utils/sportType';
import { triggerAdaptationDetection } from '../utils/adaptationTrigger';
import { formatLocalDate } from '../utils/dateUtils';

interface AutoLinkActivity {
  id: string;
  type?: string | null;
  sport_type?: string | null;
  start_date?: string;
  start_date_local?: string;
  average_watts?: number | null;
  moving_time?: number | null;
  distance?: number | null;
  total_elevation_gain?: number | null;
}

interface PlannedWorkoutRow {
  id: string;
  scheduled_date?: string;
  activity_id?: string | null;
}

interface UseActivityAutoLinkArgs {
  userId?: string | null;
  /** Activities to consider for linking (cycling rides). */
  activities?: AutoLinkActivity[];
  /** Raw planned_workouts rows currently loaded by the calendar. */
  plannedWorkouts?: PlannedWorkoutRow[];
  ftp?: number | null;
  /** Called once after one or more activities were linked, so the caller can reload. */
  onLinked?: () => void;
}

/** Local YYYY-MM-DD for an activity, preferring start_date_local. */
function getActivityLocalDate(activity: AutoLinkActivity): string {
  if (activity.start_date_local) {
    const dateStr = String(activity.start_date_local);
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return formatLocalDate(parsed);
  }
  if (!activity.start_date) return '';
  const activityDate = new Date(activity.start_date);
  if (isNaN(activityDate.getTime())) return '';
  return formatLocalDate(activityDate);
}

/**
 * Actual training load for an activity. Power-based TSS is gated on
 * `isPowerSport` so a footpod's watts on a run can't poison the figure;
 * otherwise estimate from duration/distance/elevation.
 */
function getActivityTSS(activity: AutoLinkActivity, ftp?: number | null): number | null {
  if (isPowerSport(activity) && activity.average_watts && activity.moving_time && ftp) {
    return calculateTSS(activity.moving_time, activity.average_watts, ftp);
  }
  if (activity.moving_time) {
    return estimateTSS(
      activity.moving_time / 60,
      (activity.distance || 0) / 1000,
      activity.total_elevation_gain || 0,
      'endurance'
    );
  }
  return null;
}

function isCyclingActivity(activity: AutoLinkActivity): boolean {
  const type = (activity.type || '').toLowerCase();
  return type.includes('ride') || type.includes('cycling') || activity.sport_type === 'cycling';
}

export function useActivityAutoLink({
  userId,
  activities = [],
  plannedWorkouts = [],
  ftp,
  onLinked,
}: UseActivityAutoLinkArgs): void {
  // Activity ids we've already attempted, so we don't re-link on every render.
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || activities.length === 0 || plannedWorkouts.length === 0) return;

    let cancelled = false;

    const run = async () => {
      const toLink: { workoutId: string; activityId: string; activity: AutoLinkActivity }[] = [];

      for (const activity of activities) {
        if (processedRef.current.has(activity.id)) continue;
        if (!isCyclingActivity(activity)) continue;

        const date = getActivityLocalDate(activity);
        if (!date) continue;

        const match = plannedWorkouts.find(
          (w) => w.id && w.scheduled_date === date && !w.activity_id
        );
        if (match) {
          toLink.push({ workoutId: match.id, activityId: activity.id, activity });
        }
      }

      let linkedAny = false;

      for (const { workoutId, activityId, activity } of toLink) {
        // Mark processed up-front so a failure doesn't loop forever.
        processedRef.current.add(activityId);

        try {
          const actualLoad = getActivityTSS(activity, ftp);
          const actualDuration = activity.moving_time
            ? Math.round(activity.moving_time / 60)
            : null;

          const { error } = await supabase
            .from('planned_workouts')
            .update({
              activity_id: activityId,
              completed: true,
              completed_at: new Date().toISOString(),
              // Dual-write canonical + legacy per CLAUDE.md.
              actual_rss: actualLoad,
              actual_tss: actualLoad,
              actual_duration: actualDuration,
            })
            .eq('id', workoutId);

          if (error) {
            console.error('[useActivityAutoLink] link failed:', error.message, error.code);
            continue;
          }

          // Also set the reverse pointer — server-side reads (check-in
          // context, EFI) look up activities.matched_planned_workout_id.
          // Non-fatal: the forward link above already stands, and the
          // server reconciler can backfill the pointer later.
          const { error: reverseErr } = await supabase
            .from('activities')
            .update({ matched_planned_workout_id: workoutId })
            .eq('id', activityId);
          if (reverseErr) {
            console.error('[useActivityAutoLink] reverse pointer failed:', reverseErr.message);
          }

          linkedAny = true;

          // Fire-and-forget adaptation detection.
          triggerAdaptationDetection(userId, workoutId, activityId).catch((err) => {
            console.error('[useActivityAutoLink] adaptation detection error:', err);
          });
        } catch (err) {
          console.error('[useActivityAutoLink] link error:', err);
        }
      }

      if (linkedAny && !cancelled) {
        onLinked?.();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [userId, activities, plannedWorkouts, ftp, onLinked]);
}

export default useActivityAutoLink;
