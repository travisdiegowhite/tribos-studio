/**
 * useActivityAutoLink
 *
 * Auto-links completed cycling activities to the calendar entry scheduled on
 * the same local date. Extracted from the (now-retired) TrainingPlanner so the
 * monthly calendar can own this behavior. Operates on rows in the legacy
 * snake_case shape, which is what `fetchPlannedSessions` hands back and what
 * TrainingCalendar already loads.
 *
 * The write goes to `calendar_entries` through linkEntryToActivity. It used to
 * go to `planned_workouts`, which no surface reads any more — so a ride would
 * be matched and the session would still show as not-done on /train.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { linkEntryToActivity } from '../lib/calendar/calendarMutations';
import { calculateTSS, estimateTSS } from '../utils/trainingPlans';
import { isPowerSport, getActivitySport } from '../utils/sportType';
import { entrySport, isStrengthSession } from '../../api/utils/entrySport.js';
import { triggerAdaptationDetection } from '../utils/adaptationTrigger';
import { formatLocalDate } from '../utils/dateUtils';

interface AutoLinkActivity {
  id: string;
  type?: string | null;
  sport_type?: string | null;
  start_date?: string;
  start_date_local?: string;
  average_watts?: number | null;
  normalized_power?: number | null;
  effective_power?: number | null;
  rss?: number | null;
  tss?: number | null;
  moving_time?: number | null;
  distance?: number | null;
  total_elevation_gain?: number | null;
}

interface PlannedWorkoutRow {
  id: string;
  scheduled_date?: string;
  activity_id?: string | null;
  entry_type?: string | null;
  sport?: string | null;
  workout_id?: string | null;
  workout_type?: string | null;
  target_load?: number | null;
  target_rss?: number | null;
  target_tss?: number | null;
}

/**
 * Whether an activity of `sport` can satisfy this calendar entry: never a
 * rest day or a note, and only an entry of the same sport — a run must not
 * complete the day's ride (multisport phase 3). A multi-sport race accepts
 * either.
 */
export function entryAcceptsActivity(entry: PlannedWorkoutRow, sport: string): boolean {
  const type = entry.entry_type ?? 'workout';
  if (type === 'rest' || type === 'note') return false;
  // Gym and mobility work never takes a ride or a run, whatever sport the row
  // was stored with: on 2026-11-20 a "Hip Mobility" entry stored as cycling
  // claimed the day's ride ahead of the sweet-spot session it belonged to.
  if (type === 'workout' && isStrengthSession(entry)) return false;
  const want = entry.sport ?? entrySport({ type, workout_id: entry.workout_id, workout_type: entry.workout_type });
  return want === sport || want === 'multi';
}

interface UseActivityAutoLinkArgs {
  userId?: string | null;
  /** Activities to consider for linking (rides and runs). */
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
 * Actual training load for an activity, written at link time. The server's
 * training-load recompute then overwrites it with its own score
 * (calendarWrite.syncActualLoads), so this only has to be close for the few
 * minutes in between — but it must not be systematically low.
 *
 * Order mirrors the server scorer: a device score (sanitized like
 * stressScoreSanitizer), then power. Power uses normalized power: average
 * power understates any session with surges or intervals (a 3×12 sweet-spot
 * ride read 41 on average power and 49 on NP). Power is gated on
 * `isPowerSport` so a footpod's watts on a run can't poison the figure;
 * otherwise estimate from duration/distance/elevation.
 */
export function getActivityTSS(activity: AutoLinkActivity, ftp?: number | null): number | null {
  const device = Number(activity.rss ?? activity.tss);
  if (Number.isFinite(device) && device > 0 && device < 1000) return Math.round(device);
  const power = activity.effective_power ?? activity.normalized_power ?? activity.average_watts;
  if (isPowerSport(activity) && power && activity.moving_time && ftp) {
    return calculateTSS(activity.moving_time, power, ftp);
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

function plannedLoadOf(entry: PlannedWorkoutRow): number {
  const load = Number(entry.target_load ?? entry.target_rss ?? entry.target_tss);
  return Number.isFinite(load) ? load : -1;
}

/**
 * Which activity completes which calendar entry, for activities not yet
 * linked anywhere.
 *
 * - An activity already on ANY loaded entry is skipped. The processed-ids ref
 *   resets on every reload, so without this an already-linked ride was linked
 *   again to the next free entry that day — one ride counted on two sessions.
 * - Among a day's candidates of the activity's sport, the one with the most
 *   planned load wins, so the real session beats a zero-load accessory.
 * - An entry is claimed once per pass, so a ride and a run on one day can't
 *   both land on the same session.
 */
export function pickLinks(
  activities: AutoLinkActivity[],
  plannedWorkouts: PlannedWorkoutRow[],
): { workoutId: string; activityId: string; activity: AutoLinkActivity }[] {
  const alreadyLinked = new Set(plannedWorkouts.map((w) => w.activity_id).filter(Boolean));
  const claimed = new Set<string>();
  const out: { workoutId: string; activityId: string; activity: AutoLinkActivity }[] = [];

  for (const activity of activities) {
    if (alreadyLinked.has(activity.id)) continue;
    const sport = getActivitySport(activity);
    if (sport !== 'cycling' && sport !== 'running') continue;

    const date = getActivityLocalDate(activity);
    if (!date) continue;

    let match: PlannedWorkoutRow | null = null;
    for (const w of plannedWorkouts) {
      if (!w.id || w.scheduled_date !== date || w.activity_id || claimed.has(w.id)) continue;
      if (!entryAcceptsActivity(w, sport)) continue;
      if (!match || plannedLoadOf(w) > plannedLoadOf(match)) match = w;
    }
    if (match) {
      claimed.add(match.id);
      out.push({ workoutId: match.id, activityId: activity.id, activity });
    }
  }
  return out;
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
      const toLink = pickLinks(
        activities.filter((a) => !processedRef.current.has(a.id)),
        plannedWorkouts,
      );

      let linkedAny = false;

      for (const { workoutId, activityId, activity } of toLink) {
        // Mark processed up-front so a failure doesn't loop forever.
        processedRef.current.add(activityId);

        try {
          const actualLoad = getActivityTSS(activity, ftp);
          const actualDuration = activity.moving_time
            ? Math.round(activity.moving_time / 60)
            : null;

          const result = await linkEntryToActivity(userId, workoutId, {
            activityId,
            actualLoad,
            actualDurationMin: actualDuration,
          });

          if (!result.success) {
            console.error('[useActivityAutoLink] link failed:', result.error);
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
