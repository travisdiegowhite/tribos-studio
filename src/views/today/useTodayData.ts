/**
 * useTodayData — Today view data orchestrator
 *
 * Single hook the TodayView component reads from. Composes existing
 * Supabase tables and API endpoints into the shape declared in the spec.
 *
 * Reads:
 *   - planned_workouts (today's prescribed workout)
 *   - training_load_daily (Form Score / TFI / AFI / RSS)
 *   - fitness_snapshots (28-day max ceilings + 4-week trend)
 *   - activity_efi (EFI · 28D)
 *   - weekly_tcas (TCAS · 6W)
 *   - training_plans + getPlanTemplate (phase strip + week-in-plan)
 *   - race_goals (next A race + days-to-race)
 *   - user_coach_settings.coaching_persona (persona name for the coach header)
 *   - coach_conversations (last 4 messages for the conversation cluster)
 *   - activities (last 5 rides + 7-day rollup)
 *
 * APIs:
 *   - POST /api/route-analysis (today's matched route)
 *   - POST /api/fitness-summary (surface=today; persona-voiced paragraph)
 *
 * Reader policy: canonical-first with legacy fallback per CLAUDE.md.
 *   form_score ?? tsb, tfi ?? ctl, afi ?? atl, rss ?? tss.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getPlanTemplate } from '../../data/trainingPlanTemplates';
import { PERSONAS } from '../../data/coachingPersonas';
import {
  freshnessFromFormScore,
  fatigueWordFromAFI,
  fitnessWordFromTrend,
  trendWordFromDelta,
  efiWord,
  tcasWord,
  phaseColor,
  todayColors,
  type FitnessTrend,
} from '../../utils/todayVocabulary';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface TodayBrief {
  workout: {
    id: string;
    name: string;
    durationMin: number;
    type: string;
  } | null;
  route: {
    id: string;
    name: string;
    distanceKm: number;
    matchPct: number;
    polyline: string | null;
    elevationGainM: number;
  } | null;
  coachMessage: string | null;
  coachPersona: { id: string; name: string };
}

export interface AthleteState {
  formScore: number | null;
  formWord: string;
  formColor: string;
  fitness: number | null;
  fitnessRelative: number; // 0-1 against 28d TFI max
  fitnessWord: string;
  fitnessColor: string;
  fatigue: number | null;
  fatigueRelative: number; // 0-1 against 28d AFI max
  fatigueWord: string;
  fatigueColor: string;
  trend: FitnessTrend;
  trendDeltaPct: number;
  trendWord: string;
  trendColor: string;
}

export interface PlanPhaseSegment {
  name: string;
  weeks: number;
  color: string;
}

export interface PlanExecution {
  phases: PlanPhaseSegment[];
  currentWeekInPlan: number;
  totalWeeks: number;
  currentPhase: string;
  daysToRace: number | null;
  raceName: string | null;
  efi28d: number | null;
  efiWord: string;
  efiColor: string;
  tcas: number | null;
  tcasWord: string;
  tcasColor: string;
  weekRideCount: { completed: number; planned: number };
  weekDistanceMi: number;
}

export interface ConversationMessage {
  role: 'user' | 'coach';
  content: string;
  timestamp: string;
}

export interface RecentRide {
  id: string;
  name: string;
  startDate: string;
  distanceKm: number;
  elevationM: number;
  durationSec: number;
  polyline: string | null;
  provider: string | null;
}

export interface RecentRidesData {
  rides: RecentRide[];
  weekRollup: {
    distanceMi: number;
    elevationFt: number;
    rideTime: string;
  };
}

export interface UseTodayDataReturn {
  loading: boolean;
  brief: TodayBrief;
  athleteState: AthleteState;
  planExecution: PlanExecution;
  conversation: { messages: ConversationMessage[] };
  recentRides: RecentRidesData;
  refreshConversation: () => Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const KM_PER_MILE = 1.609344;
const M_PER_FOOT = 0.3048;

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoMondayOfThisWeek(): { startKey: string; endKey: string } {
  const start = new Date();
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startKey: fmt(start), endKey: fmt(end) };
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0h';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function deriveCurrentPhase(
  template: ReturnType<typeof getPlanTemplate>,
  currentWeek: number,
): { name: string; segments: PlanPhaseSegment[]; total: number } {
  if (!template?.phases?.length) {
    return { name: 'Building baseline', segments: [], total: 0 };
  }
  const segments: PlanPhaseSegment[] = template.phases.map((p) => ({
    name: p.phase,
    weeks: p.weeks.length,
    color: phaseColor(p.phase),
  }));
  const total = segments.reduce((sum, s) => sum + s.weeks, 0);
  const current = template.phases.find((p) => p.weeks.includes(currentWeek));
  return { name: current?.phase ?? template.phases[0].phase, segments, total };
}

interface RawTrainingLoadDailyRow {
  date: string;
  rss: number | null;
  tss: number | null;
  tfi: number | null;
  ctl: number | null;
  afi: number | null;
  atl: number | null;
  form_score: number | null;
  tsb: number | null;
}

interface RawFitnessSnapshotRow {
  snapshot_week: string;
  tfi: number | null;
  ctl: number | null;
  afi: number | null;
  atl: number | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_BRIEF: TodayBrief = {
  workout: null,
  route: null,
  coachMessage: null,
  coachPersona: { id: 'pragmatist', name: 'The Pragmatist' },
};

const EMPTY_ATHLETE_STATE: AthleteState = {
  formScore: null,
  formWord: 'Building baseline',
  formColor: todayColors.gray,
  fitness: null,
  fitnessRelative: 0,
  fitnessWord: 'Building baseline',
  fitnessColor: todayColors.gray,
  fatigue: null,
  fatigueRelative: 0,
  fatigueWord: 'Building baseline',
  fatigueColor: todayColors.gray,
  trend: 'flat',
  trendDeltaPct: 0,
  trendWord: 'Building baseline',
  trendColor: todayColors.gray,
};

const EMPTY_PLAN_EXECUTION: PlanExecution = {
  phases: [],
  currentWeekInPlan: 0,
  totalWeeks: 0,
  currentPhase: 'Building baseline',
  daysToRace: null,
  raceName: null,
  efi28d: null,
  efiWord: 'Building baseline',
  efiColor: todayColors.gray,
  tcas: null,
  tcasWord: 'Building baseline',
  tcasColor: todayColors.gray,
  weekRideCount: { completed: 0, planned: 0 },
  weekDistanceMi: 0,
};

const EMPTY_RECENT_RIDES: RecentRidesData = {
  rides: [],
  weekRollup: { distanceMi: 0, elevationFt: 0, rideTime: '0h' },
};

export function useTodayData(userId: string | null): UseTodayDataReturn {
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<TodayBrief>(EMPTY_BRIEF);
  const [athleteState, setAthleteState] = useState<AthleteState>(EMPTY_ATHLETE_STATE);
  const [planExecution, setPlanExecution] = useState<PlanExecution>(EMPTY_PLAN_EXECUTION);
  const [conversation, setConversation] = useState<{ messages: ConversationMessage[] }>({ messages: [] });
  const [recentRides, setRecentRides] = useState<RecentRidesData>(EMPTY_RECENT_RIDES);

  const loadConversation = useCallback(async (): Promise<ConversationMessage[]> => {
    if (!userId) return [];
    const { data } = await supabase
      .from('coach_conversations')
      .select('role, message, timestamp')
      .eq('user_id', userId)
      .in('role', ['user', 'coach'])
      .order('timestamp', { ascending: false })
      .limit(4);
    return (data ?? [])
      .reverse()
      .map((m) => ({
        role: m.role === 'coach' ? 'coach' : 'user',
        content: m.message,
        timestamp: m.timestamp,
      })) as ConversationMessage[];
  }, [userId]);

  const refreshConversation = useCallback(async () => {
    const msgs = await loadConversation();
    setConversation({ messages: msgs });
  }, [loadConversation]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // ── 1. Persona ───────────────────────────────────────────────────
        const personaQuery = supabase
          .from('user_coach_settings')
          .select('coaching_persona')
          .eq('user_id', userId)
          .maybeSingle();

        // ── 2. Active training plan + today's workout ────────────────────
        const planQuery = supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // ── 3. Last 30 days of training_load_daily for AFI/TFI ceilings ─
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
        const thirtyKey = thirtyDaysAgo.toISOString().slice(0, 10);
        const tldQuery = supabase
          .from('training_load_daily')
          .select('date, rss, tss, tfi, ctl, afi, atl, form_score, tsb')
          .eq('user_id', userId)
          .gte('date', thirtyKey)
          .order('date', { ascending: false })
          .limit(60);

        // ── 4. Fitness snapshots (last ~6 weeks) for 4-week trend ────────
        const sixWeeksAgo = new Date();
        sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
        const fsKey = sixWeeksAgo.toISOString().slice(0, 10);
        const snapshotsQuery = supabase
          .from('fitness_snapshots')
          .select('snapshot_week, tfi, ctl, afi, atl')
          .eq('user_id', userId)
          .gte('snapshot_week', fsKey)
          .order('snapshot_week', { ascending: false })
          .limit(8);

        // ── 5. EFI / TCAS ────────────────────────────────────────────────
        const efiQuery = supabase
          .from('activity_efi')
          .select('efi, efi_28d, computed_at')
          .eq('user_id', userId)
          .order('computed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const tcasQuery = supabase
          .from('weekly_tcas')
          .select('tcas, week_ending')
          .eq('user_id', userId)
          .order('week_ending', { ascending: false })
          .limit(1)
          .maybeSingle();

        // ── 6. Race goal (next upcoming, prefer A) ───────────────────────
        const raceQuery = supabase
          .from('race_goals')
          .select('id, name, race_date, priority, status')
          .eq('user_id', userId)
          .eq('status', 'upcoming')
          .gte('race_date', todayLocalDateString())
          .order('race_date', { ascending: true })
          .limit(5);

        // ── 7. Recent activities (last 30 days, last 5 with polylines) ──
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentActivitiesQuery = supabase
          .from('activities')
          .select(
            'id, name, start_date, distance_meters, distance, elevation_gain_meters, total_elevation_gain, duration_seconds, moving_time, elapsed_time, polyline, summary_polyline, map_summary_polyline, provider',
          )
          .eq('user_id', userId)
          .is('duplicate_of', null)
          .or('is_hidden.eq.false,is_hidden.is.null')
          .gte('start_date', sevenDaysAgo.toISOString())
          .order('start_date', { ascending: false })
          .limit(20);

        // ── 8. Older activities for the map (up to 5 with polylines) ────
        const thirtyDaysForMap = new Date();
        thirtyDaysForMap.setDate(thirtyDaysForMap.getDate() - 30);
        const mapActivitiesQuery = supabase
          .from('activities')
          .select(
            'id, name, start_date, distance_meters, distance, elevation_gain_meters, total_elevation_gain, duration_seconds, moving_time, elapsed_time, polyline, summary_polyline, map_summary_polyline, provider',
          )
          .eq('user_id', userId)
          .is('duplicate_of', null)
          .or('is_hidden.eq.false,is_hidden.is.null')
          .gte('start_date', thirtyDaysForMap.toISOString())
          .order('start_date', { ascending: false })
          .limit(15);

        const [
          personaRes,
          planRes,
          tldRes,
          snapshotsRes,
          efiRes,
          tcasRes,
          raceRes,
          recentRes,
          mapRes,
        ] = await Promise.all([
          personaQuery,
          planQuery,
          tldQuery,
          snapshotsQuery,
          efiQuery,
          tcasQuery,
          raceQuery,
          recentActivitiesQuery,
          mapActivitiesQuery,
        ]);

        if (cancelled) return;

        // ── Persona ──────────────────────────────────────────────────────
        const personaId =
          personaRes.data?.coaching_persona && personaRes.data.coaching_persona !== 'pending'
            ? (personaRes.data.coaching_persona as string)
            : 'pragmatist';
        const personaName = PERSONAS[personaId]?.name ?? 'The Pragmatist';

        // ── Today's workout (across this plan) ───────────────────────────
        const today = todayLocalDateString();
        let todaysWorkout: {
          id: string;
          name: string;
          durationMin: number;
          type: string;
        } | null = null;
        let activePlan = planRes.data;

        if (activePlan?.id) {
          const { data: workoutRow } = await supabase
            .from('planned_workouts')
            .select('id, name, workout_type, duration_minutes, target_duration')
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', today)
            .limit(1)
            .maybeSingle();
          if (workoutRow) {
            todaysWorkout = {
              id: workoutRow.id,
              name: workoutRow.name || workoutRow.workout_type || 'Workout',
              durationMin: workoutRow.duration_minutes || workoutRow.target_duration || 0,
              type: workoutRow.workout_type || 'endurance',
            };
          }
        }

        // ── Athlete state (Form / Fitness / Fatigue / Trend) ─────────────
        const tldRows = (tldRes.data ?? []) as RawTrainingLoadDailyRow[];
        const latestTld = tldRows[0] ?? null;
        const formScore = latestTld
          ? Number(latestTld.form_score ?? latestTld.tsb)
          : null;
        const tfiToday = latestTld ? Number(latestTld.tfi ?? latestTld.ctl) : null;
        const afiToday = latestTld ? Number(latestTld.afi ?? latestTld.atl) : null;

        // 28-day max for fitness/fatigue bars (relative-to-ceiling).
        const tfiValues = tldRows
          .map((r) => Number(r.tfi ?? r.ctl))
          .filter((n): n is number => Number.isFinite(n) && n > 0);
        const afiValues = tldRows
          .map((r) => Number(r.afi ?? r.atl))
          .filter((n): n is number => Number.isFinite(n) && n > 0);
        const tfiMax = tfiValues.length > 0 ? Math.max(...tfiValues) : 0;
        const afiMax = afiValues.length > 0 ? Math.max(...afiValues) : 0;
        const fitnessRelative = tfiToday && tfiMax ? Math.min(1, tfiToday / tfiMax) : 0;
        const fatigueRelative = afiToday && afiMax ? Math.min(1, afiToday / afiMax) : 0;

        // 4-week trend from snapshots: compare oldest available snapshot's
        // TFI to the most recent. Fall back to today vs 28d ago in tldRows.
        const snapshots = (snapshotsRes.data ?? []) as RawFitnessSnapshotRow[];
        let trendDeltaPct = 0;
        if (snapshots.length >= 2) {
          const newest = Number(snapshots[0].tfi ?? snapshots[0].ctl);
          const oldest = Number(
            snapshots[snapshots.length - 1].tfi ?? snapshots[snapshots.length - 1].ctl,
          );
          if (oldest > 0 && Number.isFinite(newest)) {
            trendDeltaPct = ((newest - oldest) / oldest) * 100;
          }
        } else if (tldRows.length >= 28 && tfiToday && Number.isFinite(tfiToday)) {
          const tfi28dAgo = Number(tldRows[tldRows.length - 1].tfi ?? tldRows[tldRows.length - 1].ctl);
          if (tfi28dAgo > 0) {
            trendDeltaPct = ((tfiToday - tfi28dAgo) / tfi28dAgo) * 100;
          }
        }

        const formVerdict = freshnessFromFormScore(formScore);
        const trendVerdict = trendWordFromDelta(trendDeltaPct);
        const fitnessVerdict = fitnessWordFromTrend(trendVerdict.direction);
        const fatigueVerdict = fatigueWordFromAFI(afiMax > 0 ? fatigueRelative : null);

        // ── Plan execution ──────────────────────────────────────────────
        let planExec = EMPTY_PLAN_EXECUTION;
        if (activePlan) {
          const template = activePlan.template_id ? getPlanTemplate(activePlan.template_id) : undefined;
          const phaseInfo = deriveCurrentPhase(template, activePlan.current_week ?? 1);

          // Week ride completion across this plan for this ISO week.
          const { startKey, endKey } = isoMondayOfThisWeek();
          const { data: weekWorkouts } = await supabase
            .from('planned_workouts')
            .select('id, completed, workout_type')
            .eq('plan_id', activePlan.id)
            .gte('scheduled_date', startKey)
            .lt('scheduled_date', endKey);
          const ridingWorkouts = (weekWorkouts ?? []).filter((w) => w.workout_type !== 'rest');
          const completed = ridingWorkouts.filter((w) => w.completed).length;
          const planned = ridingWorkouts.length;

          // Week distance from `recentRes` activities filtered to this week.
          const weekActivities = (recentRes.data ?? []).filter((a) => {
            const d = new Date(a.start_date as string).getTime();
            return d >= new Date(startKey).getTime() && d < new Date(endKey).getTime();
          });
          const weekDistanceKm = weekActivities.reduce(
            (sum: number, a) =>
              sum + ((Number(a.distance_meters) || Number(a.distance) || 0) / 1000),
            0,
          );

          const efiVal = (efiRes.data?.efi_28d ?? efiRes.data?.efi ?? null) as number | null;
          const tcasVal = (tcasRes.data?.tcas ?? null) as number | null;

          const efiV = efiWord(efiVal);
          const tcasV = tcasWord(tcasVal);

          // Race: prefer A-priority, else next upcoming
          const raceRows = raceRes.data ?? [];
          const aRace = raceRows.find((r) => r.priority === 'A') ?? raceRows[0] ?? null;
          let daysToRace: number | null = null;
          if (aRace?.race_date) {
            const ms = new Date(aRace.race_date).getTime() - Date.now();
            daysToRace = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
          }

          planExec = {
            phases: phaseInfo.segments,
            currentWeekInPlan: activePlan.current_week ?? 1,
            totalWeeks: phaseInfo.total || (activePlan.duration_weeks ?? 0),
            currentPhase: phaseInfo.name,
            daysToRace,
            raceName: aRace?.name ?? null,
            efi28d: efiVal,
            efiWord: efiV.word,
            efiColor: efiV.color,
            tcas: tcasVal,
            tcasWord: tcasV.word,
            tcasColor: tcasV.color,
            weekRideCount: { completed, planned },
            weekDistanceMi: weekDistanceKm / KM_PER_MILE,
          };
        }

        // ── Recent rides + 7-day rollup ─────────────────────────────────
        const sevenDayActivities = recentRes.data ?? [];
        const weekDistanceM = sevenDayActivities.reduce(
          (sum: number, a) => sum + (Number(a.distance_meters) || Number(a.distance) || 0),
          0,
        );
        const weekElevationM = sevenDayActivities.reduce(
          (sum: number, a) =>
            sum + (Number(a.elevation_gain_meters) || Number(a.total_elevation_gain) || 0),
          0,
        );
        const weekDurationSec = sevenDayActivities.reduce(
          (sum: number, a) =>
            sum +
            (Number(a.duration_seconds) ||
              Number(a.moving_time) ||
              Number(a.elapsed_time) ||
              0),
          0,
        );

        // Map list: take from the wider window so the map has 5 rides even
        // if the user hasn't ridden in the last 7 days.
        const mapSource = (mapRes.data && mapRes.data.length > 0 ? mapRes.data : sevenDayActivities) as Array<{
          id: string;
          name: string | null;
          start_date: string;
          distance_meters: number | null;
          distance: number | null;
          elevation_gain_meters: number | null;
          total_elevation_gain: number | null;
          duration_seconds: number | null;
          moving_time: number | null;
          elapsed_time: number | null;
          polyline: string | null;
          summary_polyline: string | null;
          map_summary_polyline: string | null;
          provider: string | null;
        }>;
        const ridesForMap: RecentRide[] = mapSource
          .map((a) => ({
            id: a.id,
            name: a.name ?? 'Untitled Ride',
            startDate: a.start_date,
            distanceKm:
              (Number(a.distance_meters) || Number(a.distance) || 0) / 1000,
            elevationM:
              Number(a.elevation_gain_meters) || Number(a.total_elevation_gain) || 0,
            durationSec:
              Number(a.duration_seconds) ||
              Number(a.moving_time) ||
              Number(a.elapsed_time) ||
              0,
            polyline:
              a.polyline ||
              a.summary_polyline ||
              a.map_summary_polyline ||
              null,
            provider: a.provider,
          }))
          .filter((r) => r.polyline)
          .slice(0, 5);

        // ── Today's matched route (best route) ─────────────────────────
        let routeForBrief: TodayBrief['route'] = null;
        if (todaysWorkout) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const res = await fetch('/api/route-analysis', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'get_matches',
                  workouts: [{
                    id: todaysWorkout.id,
                    name: todaysWorkout.name,
                    category: todaysWorkout.type,
                    duration: todaysWorkout.durationMin,
                  }],
                }),
              });
              if (res.ok) {
                const json = await res.json();
                const matches = json.matches?.[todaysWorkout.id] ?? [];
                const top = matches[0];
                if (top?.activity) {
                  routeForBrief = {
                    id: top.activity.id,
                    name: top.activity.name || 'Matched Route',
                    distanceKm: (top.activity.distance ?? 0) / 1000,
                    matchPct: Number(top.matchScore ?? 0),
                    polyline:
                      top.activity.map_summary_polyline ||
                      top.activity.summary_polyline ||
                      null,
                    elevationGainM: Number(top.activity.total_elevation_gain ?? 0),
                  };
                }
              }
            }
          } catch (err) {
            console.error('today: route match fetch failed', err);
          }
        }

        // ── Coach paragraph (surface=today) ────────────────────────────
        let coachMessage: string | null = null;
        if (formScore != null && tfiToday != null && afiToday != null) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const res = await fetch('/api/fitness-summary', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  surface: 'today',
                  clientMetrics: {
                    tfi: Math.round(tfiToday),
                    afi: Math.round(afiToday),
                    formScore: Math.round(formScore),
                    ctlDeltaPct: trendDeltaPct,
                  },
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
              });
              if (res.ok) {
                const json = await res.json();
                coachMessage = json.summary ?? null;
              }
            }
          } catch (err) {
            console.error('today: fitness-summary fetch failed', err);
          }
        }

        // ── Conversation messages (last 4) ─────────────────────────────
        const messages = await loadConversation();

        if (cancelled) return;

        setBrief({
          workout: todaysWorkout,
          route: routeForBrief,
          coachMessage,
          coachPersona: { id: personaId, name: personaName },
        });
        setAthleteState({
          formScore,
          formWord: formVerdict.word,
          formColor: formVerdict.color,
          fitness: tfiToday,
          fitnessRelative,
          fitnessWord: fitnessVerdict.word,
          fitnessColor: fitnessVerdict.color,
          fatigue: afiToday,
          fatigueRelative,
          fatigueWord: fatigueVerdict.word,
          fatigueColor: fatigueVerdict.color,
          trend: trendVerdict.direction,
          trendDeltaPct,
          trendWord: trendVerdict.word,
          trendColor: trendVerdict.color,
        });
        setPlanExecution(planExec);
        setConversation({ messages });
        setRecentRides({
          rides: ridesForMap,
          weekRollup: {
            distanceMi: (weekDistanceM / 1000) / KM_PER_MILE,
            elevationFt: weekElevationM / M_PER_FOOT,
            rideTime: formatDuration(weekDurationSec),
          },
        });
      } catch (err) {
        console.error('useTodayData failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loadConversation]);

  return {
    loading,
    brief,
    athleteState,
    planExecution,
    conversation,
    recentRides,
    refreshConversation,
  };
}
