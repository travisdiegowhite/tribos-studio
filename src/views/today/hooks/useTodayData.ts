/**
 * Today View data orchestrator.
 *
 * Composes existing hooks (`useTrainingPlan`) and the new sub-hooks for
 * EFI / TCAS / next race / coach conversation / 7-day rollup / persona /
 * trend delta. Issues parallel network calls for today's planned workout,
 * its matched route, and the persona-voiced coach paragraph.
 *
 * Per-cluster loading flags so each card can flip independently — the
 * caller does NOT block the entire view on the slowest fetch.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTrainingPlan } from '../../../hooks/useTrainingPlan';
import { useCoachPersona, type CoachPersona } from './useCoachPersona';
import { useEfi28d } from './useEfi28d';
import { useWeeklyTcas } from './useWeeklyTcas';
import { useNextARace, type NextARace } from './useNextARace';
import { useCoachConversation, type CoachMessage } from './useCoachConversation';
import { use7DayRollup, type SevenDayRollup } from './use7DayRollup';
import { useTrendDelta, type TrendData } from './useTrendDelta';
import type { PlanPhase, TrainingPhase } from '../../../types/training';

export interface TodayWorkout {
  id: string;
  name: string;
  durationMin: number;
  category: string;
}

export interface TodayRouteMatch {
  id: string;
  name: string;
  distanceKm: number;
  matchPct: number;
  polyline: string | null;
  providerActivityId: string | null;
  provider: string | null;
}

export interface RecentRideRow {
  id: string;
  name: string;
  start_date: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
  polyline?: string | null;
  summary_polyline?: string | null;
  map_summary_polyline?: string | null;
  provider?: string;
  provider_activity_id?: string | null;
  is_hidden?: boolean | null;
}

export interface PlanContext {
  phases: PlanPhase[];
  currentPhase: TrainingPhase | null;
  currentWeekInPlan: number;
  totalWeeks: number;
}

export interface WeekRideCount {
  completed: number;
  planned: number;
}

export interface TodayData {
  persona: CoachPersona;
  brief: {
    workout: TodayWorkout | null;
    route: TodayRouteMatch | null;
    coachMessage: string | null;
    cached: boolean;
  };
  athleteState: TrendData;
  planExecution: {
    plan: PlanContext;
    race: NextARace | null;
    efi28d: number | null;
    tcas: number | null;
    weekRideCount: WeekRideCount;
    weekDistanceKm: number;
  };
  conversation: {
    messages: CoachMessage[];
  };
  recentRides: {
    rides: RecentRideRow[];
    rollup: SevenDayRollup;
  };
  loading: {
    brief: boolean;
    athleteState: boolean;
    planExecution: boolean;
    conversation: boolean;
    recentRides: boolean;
  };
  refresh: {
    conversation: () => Promise<void>;
  };
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface PlannedWorkoutRow {
  id: string;
  title?: string | null;
  workout_type?: string | null;
  category?: string | null;
  duration_minutes?: number | null;
}

function workoutFromRow(row: PlannedWorkoutRow | null): TodayWorkout | null {
  if (!row) return null;
  const name = row.title || row.workout_type || 'Workout';
  return {
    id: row.id,
    name,
    durationMin: row.duration_minutes ?? 60,
    category: row.workout_type || row.category || 'endurance',
  };
}

export function useTodayData(userId: string | null | undefined): TodayData {
  const { activePlan, currentPhase, currentWeek, getWorkoutsForWeek } = useTrainingPlan({ userId: userId ?? undefined });
  const { persona, loading: personaLoading } = useCoachPersona(userId);
  const { efi28d, loading: efiLoading } = useEfi28d(userId);
  const { tcas, loading: tcasLoading } = useWeeklyTcas(userId);
  const { race, loading: raceLoading } = useNextARace(userId);
  const { messages, loading: conversationLoading, refresh: refreshConversation } = useCoachConversation(userId, { limit: 4 });
  const { rollup, loading: rollupLoading } = use7DayRollup(userId);
  const { data: trend, loading: trendLoading } = useTrendDelta(userId);

  const [todayWorkoutRow, setTodayWorkoutRow] = useState<PlannedWorkoutRow | null>(null);
  const [todayWorkoutLoading, setTodayWorkoutLoading] = useState<boolean>(Boolean(userId));
  const [routeMatch, setRouteMatch] = useState<TodayRouteMatch | null>(null);
  const [routeMatchLoading, setRouteMatchLoading] = useState<boolean>(false);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachMessageCached, setCoachMessageCached] = useState<boolean>(false);
  const [coachMessageLoading, setCoachMessageLoading] = useState<boolean>(false);
  const [recentRides, setRecentRides] = useState<RecentRideRow[]>([]);
  const [recentRidesLoading, setRecentRidesLoading] = useState<boolean>(Boolean(userId));

  // Today's planned workout — across all active plans.
  useEffect(() => {
    if (!userId) {
      setTodayWorkoutRow(null);
      setTodayWorkoutLoading(false);
      return;
    }

    let cancelled = false;
    setTodayWorkoutLoading(true);

    (async () => {
      const today = todayDateString();
      const { data: plansData } = await supabase
        .from('training_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active');

      const planIds = Array.isArray(plansData) ? (plansData as Array<{ id: string }>).map((p) => p.id) : [];

      if (planIds.length === 0) {
        if (!cancelled) {
          setTodayWorkoutRow(null);
          setTodayWorkoutLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from('planned_workouts')
        .select('id, title, workout_type, category, duration_minutes')
        .in('plan_id', planIds)
        .eq('scheduled_date', today)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setTodayWorkoutRow((data as PlannedWorkoutRow | null) ?? null);
      setTodayWorkoutLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Route match for today's workout.
  useEffect(() => {
    if (!userId || !todayWorkoutRow) {
      setRouteMatch(null);
      setRouteMatchLoading(false);
      return;
    }

    let cancelled = false;
    setRouteMatchLoading(true);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setRouteMatch(null);
            setRouteMatchLoading(false);
          }
          return;
        }

        const workoutId = todayWorkoutRow.id;
        const res = await fetch('/api/route-analysis', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'get_matches',
            workouts: [
              {
                id: workoutId,
                name: todayWorkoutRow.title || todayWorkoutRow.workout_type || 'Workout',
                category: todayWorkoutRow.workout_type || todayWorkoutRow.category || 'endurance',
                duration: todayWorkoutRow.duration_minutes ?? 60,
              },
            ],
          }),
        });

        if (cancelled) return;

        if (!res.ok) {
          setRouteMatch(null);
          setRouteMatchLoading(false);
          return;
        }

        const json = await res.json();
        const matches = json.matches?.[workoutId] ?? [];
        const top = matches[0];
        if (!top) {
          setRouteMatch(null);
          setRouteMatchLoading(false);
          return;
        }
        const activity = top.activity ?? top;
        const polyline =
          activity.map_summary_polyline ||
          activity.summary_polyline ||
          activity.polyline ||
          null;
        setRouteMatch({
          id: activity.id,
          name: activity.name,
          distanceKm: (activity.distance ?? 0) / 1000,
          matchPct: Math.round(top.matchScore ?? 0),
          polyline,
          providerActivityId: activity.provider_activity_id ?? null,
          provider: activity.provider ?? null,
        });
        setRouteMatchLoading(false);
      } catch {
        if (!cancelled) {
          setRouteMatch(null);
          setRouteMatchLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, todayWorkoutRow]);

  // Coach paragraph (3-4 sentences, persona-voiced) via /api/fitness-summary.
  useEffect(() => {
    if (!userId || trend.tfi == null || trend.afi == null || trend.formScore == null) {
      setCoachMessage(null);
      setCoachMessageLoading(false);
      return;
    }

    let cancelled = false;
    setCoachMessageLoading(true);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setCoachMessage(null);
            setCoachMessageLoading(false);
          }
          return;
        }

        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch('/api/fitness-summary', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            surface: 'today',
            timezone: browserTimezone,
            clientMetrics: {
              tfi: trend.tfi,
              afi: trend.afi,
              formScore: trend.formScore,
              ctlDeltaPct: trend.trendDeltaPct,
            },
          }),
        });

        if (cancelled) return;
        if (!res.ok) {
          setCoachMessage(null);
          setCoachMessageLoading(false);
          return;
        }

        const json = await res.json();
        setCoachMessage(typeof json.summary === 'string' ? json.summary : null);
        setCoachMessageCached(Boolean(json.cached));
        setCoachMessageLoading(false);
      } catch {
        if (!cancelled) {
          setCoachMessage(null);
          setCoachMessageLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, trend.tfi, trend.afi, trend.formScore, trend.trendDeltaPct]);

  // Recent rides (last 5, with polylines for the dark map).
  useEffect(() => {
    if (!userId) {
      setRecentRides([]);
      setRecentRidesLoading(false);
      return;
    }

    let cancelled = false;
    setRecentRidesLoading(true);

    (async () => {
      const { data } = await supabase
        .from('activities')
        .select(
          'id, name, start_date, distance, total_elevation_gain, moving_time, summary_polyline, map_summary_polyline, polyline, provider, provider_activity_id, is_hidden'
        )
        .eq('user_id', userId)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .order('start_date', { ascending: false })
        .limit(5);

      if (cancelled) return;
      setRecentRides(Array.isArray(data) ? (data as RecentRideRow[]) : []);
      setRecentRidesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Plan context — phases, current week, current phase, total weeks.
  const plan: PlanContext = useMemo(() => {
    const template = activePlan?.template;
    const templateWeeks = template?.weekTemplates ? Object.keys(template.weekTemplates).length : 0;
    return {
      phases: template?.phases ?? [],
      currentPhase: currentPhase,
      currentWeekInPlan: currentWeek,
      totalWeeks: activePlan?.duration_weeks ?? templateWeeks,
    };
  }, [activePlan, currentPhase, currentWeek]);

  // This week's planned vs completed rides + week distance.
  const { weekRideCount, weekDistanceKm } = useMemo(() => {
    if (!activePlan) {
      return { weekRideCount: { completed: 0, planned: 0 }, weekDistanceKm: 0 };
    }
    const weekWorkouts = getWorkoutsForWeek(currentWeek);
    const planned = weekWorkouts.length;
    const completed = weekWorkouts.filter((w) =>
      Boolean((w as { completed?: boolean }).completed)
    ).length;
    return { weekRideCount: { completed, planned }, weekDistanceKm: rollup.distanceKm };
  }, [activePlan, currentWeek, getWorkoutsForWeek, rollup.distanceKm]);

  return {
    persona,
    brief: {
      workout: workoutFromRow(todayWorkoutRow),
      route: routeMatch,
      coachMessage,
      cached: coachMessageCached,
    },
    athleteState: trend,
    planExecution: {
      plan,
      race,
      efi28d,
      tcas,
      weekRideCount,
      weekDistanceKm,
    },
    conversation: { messages },
    recentRides: { rides: recentRides, rollup },
    loading: {
      brief: todayWorkoutLoading || routeMatchLoading || coachMessageLoading || personaLoading,
      athleteState: trendLoading,
      planExecution: efiLoading || tcasLoading || raceLoading || rollupLoading,
      conversation: conversationLoading,
      recentRides: recentRidesLoading,
    },
    refresh: { conversation: refreshConversation },
  };
}
