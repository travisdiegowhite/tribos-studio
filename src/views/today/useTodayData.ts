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
  fitnessWordFromSlope,
  efiWord,
  tcasWord,
  phaseColor,
  todayColors,
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

export interface SparklinePoint {
  date: string; // ISO date (YYYY-MM-DD)
  tfi: number;
}

export interface AthleteState {
  // FORM cell
  formScore: number | null;
  formWord: string;
  formColor: string;
  formEmpty: boolean;
  formDaysNeeded: number;

  // FITNESS sparkline
  fitnessHistory: SparklinePoint[]; // 28 days, ascending, forward-filled
  fitnessCurrent: number | null;
  fitnessWord: string;
  fitnessColor: string;
  fitnessDelta28d: number; // signed TFI points
  fitnessSlope14d: number; // TFI/day
  fitnessEmpty: boolean;
  fitnessDaysLogged: number;

  // FATIGUE cell
  fatigue: number | null;
  fatigueRelative: number; // (afi - min28d) / (max28d - min28d), clamped 0–1
  fatigueWord: string;
  fatigueColor: string;
  fatigueEmpty: boolean;
  fatigueDaysNeeded: number;
}

export interface PlanPhaseSegment {
  name: string;
  weeks: number;
  color: string;
}

export interface PlanExecution {
  // PLAN cell
  phases: PlanPhaseSegment[];
  currentWeekInPlan: number;
  totalWeeks: number;
  currentPhase: string;
  daysToRace: number | null;
  raceName: string | null;
  planEmpty: boolean;
  planStartsInDays: number | null;

  // EFI cell
  efi28d: number | null;
  efiWord: string;
  efiColor: string;
  efiEmpty: boolean;
  efiRidesNeeded: number;

  // TCAS cell
  tcas: number | null;
  tcasWord: string;
  tcasColor: string;
  tcasEmpty: boolean;
  tcasWeeksLogged: number;

  // THIS WK cell
  weekRideCount: { completed: number; planned: number };
  weekDistanceMi: number;
  weekEmpty: boolean;
  weekIsRestWeek: boolean;
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

/**
 * `training_load_daily` only has rows on activity days. To produce continuous
 * 28-day series for the sparkline (and the personal min/max range for the
 * fatigue bar), walk the calendar and carry the most recent observed value
 * forward into rest days.
 *
 * Returns ascending-by-date arrays of length `days` ending today (inclusive).
 * If there are no observed rows at all, returns empty arrays — the caller
 * should treat that as "empty" and render the empty-state visual.
 */
function buildContinuousSeries(
  rowsDescending: RawTrainingLoadDailyRow[],
  days: number,
): {
  tfi: SparklinePoint[];
  afi: number[];
  daysLogged: number;
} {
  if (rowsDescending.length === 0) {
    return { tfi: [], afi: [], daysLogged: 0 };
  }

  const byDate = new Map<string, RawTrainingLoadDailyRow>();
  for (const r of rowsDescending) byDate.set(r.date, r);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tfi: SparklinePoint[] = [];
  const afi: number[] = [];
  let lastTfi: number | null = null;
  let lastAfi: number | null = null;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const row = byDate.get(key);
    if (row) {
      const t = Number(row.tfi ?? row.ctl);
      const a = Number(row.afi ?? row.atl);
      if (Number.isFinite(t)) lastTfi = t;
      if (Number.isFinite(a)) lastAfi = a;
    }

    if (lastTfi != null) tfi.push({ date: key, tfi: lastTfi });
    if (lastAfi != null) afi.push(lastAfi);
  }

  // Count distinct activity days within the requested window — used for
  // empty-state thresholds.
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  let daysLogged = 0;
  for (const r of rowsDescending) {
    const d = new Date(r.date);
    if (d >= windowStart && d <= today) daysLogged++;
  }

  return { tfi, afi, daysLogged };
}

/**
 * Linear-regression slope of the last `n` points in `series`. Units are
 * "TFI per day" since each step is exactly one calendar day. Returns 0 when
 * there are fewer than `n` points.
 */
function slopeLastN(series: SparklinePoint[], n: number): number {
  if (series.length < n) return 0;
  const slice = series.slice(-n);
  // x is the day index 0..n-1, y is TFI.
  const meanX = (n - 1) / 2;
  const meanY = slice.reduce((s, p) => s + p.tfi, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (slice[i].tfi - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
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
  formWord: 'Need 7 more days',
  formColor: todayColors.gray,
  formEmpty: true,
  formDaysNeeded: 7,
  fitnessHistory: [],
  fitnessCurrent: null,
  fitnessWord: 'Building history',
  fitnessColor: todayColors.gray,
  fitnessDelta28d: 0,
  fitnessSlope14d: 0,
  fitnessEmpty: true,
  fitnessDaysLogged: 0,
  fatigue: null,
  fatigueRelative: 0,
  fatigueWord: 'Need 7 more days',
  fatigueColor: todayColors.gray,
  fatigueEmpty: true,
  fatigueDaysNeeded: 7,
};

const EMPTY_PLAN_EXECUTION: PlanExecution = {
  phases: [],
  currentWeekInPlan: 0,
  totalWeeks: 0,
  currentPhase: '',
  daysToRace: null,
  raceName: null,
  planEmpty: true,
  planStartsInDays: null,
  efi28d: null,
  efiWord: 'Building history',
  efiColor: todayColors.gray,
  efiEmpty: true,
  efiRidesNeeded: 0,
  tcas: null,
  tcasWord: 'Building history',
  tcasColor: todayColors.gray,
  tcasEmpty: true,
  tcasWeeksLogged: 0,
  weekRideCount: { completed: 0, planned: 0 },
  weekDistanceMi: 0,
  weekEmpty: true,
  weekIsRestWeek: false,
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

        // ── Athlete state ────────────────────────────────────────────────
        // Build forward-filled 28-day series. `training_load_daily` only has
        // rows on activity days (verified — the sole writer is
        // `upsertTrainingLoadDaily()` in api/utils/trainingLoad.js, called
        // only on Strava/Garmin/Wahoo activity ingestion). The sparkline and
        // the personal AFI range need continuous data, so we carry the most
        // recent observed value forward into rest days.
        const tldRows = (tldRes.data ?? []) as RawTrainingLoadDailyRow[];
        const latestTld = tldRows[0] ?? null;
        const formScore = latestTld
          ? Number(latestTld.form_score ?? latestTld.tsb)
          : null;

        const series = buildContinuousSeries(tldRows, 28);
        const tfiToday = series.tfi.length > 0
          ? series.tfi[series.tfi.length - 1].tfi
          : null;
        const afiToday = series.afi.length > 0
          ? series.afi[series.afi.length - 1]
          : null;

        // FATIGUE bar — position in the user's own 28-day AFI range so
        // "Productive" means the same thing for any rider's training load,
        // not an absolute AFI threshold.
        const afiMin = series.afi.length > 0 ? Math.min(...series.afi) : 0;
        const afiMax = series.afi.length > 0 ? Math.max(...series.afi) : 0;
        const afiRange = afiMax - afiMin;
        const fatigueRelative =
          afiToday != null && afiRange > 0
            ? Math.min(1, Math.max(0, (afiToday - afiMin) / afiRange))
            : 0;

        // FITNESS sparkline — slope of the last 14 days drives the word.
        const fitnessSlope14d = slopeLastN(series.tfi, 14);
        const fitnessDelta28d =
          series.tfi.length >= 2
            ? series.tfi[series.tfi.length - 1].tfi - series.tfi[0].tfi
            : 0;

        // Empty-state thresholds — see plan + spec.
        const formEmpty = series.daysLogged < 7;
        const fitnessEmpty = series.daysLogged < 14;
        const fatigueEmpty = series.daysLogged < 7;

        const formVerdict = freshnessFromFormScore(formEmpty ? null : formScore);
        const fitnessVerdict = fitnessWordFromSlope(fitnessSlope14d);
        const fatigueVerdict = fatigueWordFromAFI(
          fatigueEmpty || afiRange === 0 ? null : fatigueRelative,
        );

        // ── Plan execution ──────────────────────────────────────────────
        // Race: prefer A-priority, else next upcoming. Computed up front so
        // it's still available in the no-active-plan branch (an athlete can
        // have a race goal without a structured plan).
        const raceRows = raceRes.data ?? [];
        const aRace = raceRows.find((r) => r.priority === 'A') ?? raceRows[0] ?? null;
        let daysToRace: number | null = null;
        if (aRace?.race_date) {
          const ms = new Date(aRace.race_date).getTime() - Date.now();
          daysToRace = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
        }

        // EFI: hide when no recent activity_efi rows. The endpoint backfills
        // on first read so a non-null value here means there's enough data.
        const efiVal = (efiRes.data?.efi_28d ?? efiRes.data?.efi ?? null) as number | null;
        const efiEmpty = efiVal == null;
        const efiV = efiWord(efiEmpty ? null : efiVal);
        // EFI needs at least 5 matched workouts for the rolling 28d to be
        // stable enough to act on. We don't have a direct count here, but
        // the new athlete needs ~5 weeks of riding to fill out a meaningful
        // EFI history; show the gap as "rides needed" copy in the UI.
        const efiRidesNeeded = efiEmpty ? 5 : 0;

        // TCAS: hard-blocks at 4 fitness_snapshots in api/utils/metricsComputation.js.
        // Use the count of recent snapshots as the "weeksLogged" denominator.
        const tcasVal = (tcasRes.data?.tcas ?? null) as number | null;
        const tcasEmpty = tcasVal == null;
        const snapshotsCount = (snapshotsRes.data ?? []).length;
        const tcasWeeksLogged = Math.min(4, snapshotsCount);
        const tcasV = tcasWord(tcasEmpty ? null : tcasVal);

        let planExec: PlanExecution = {
          ...EMPTY_PLAN_EXECUTION,
          daysToRace,
          raceName: aRace?.name ?? null,
          efi28d: efiVal,
          efiWord: efiV.word,
          efiColor: efiEmpty ? todayColors.gray : efiV.color,
          efiEmpty,
          efiRidesNeeded,
          tcas: tcasVal,
          tcasWord: tcasV.word,
          tcasColor: tcasEmpty ? todayColors.gray : tcasV.color,
          tcasEmpty,
          tcasWeeksLogged,
        };

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

          // Pre-week-1: plan starts in the future.
          const planStartedAt = activePlan.started_at ?? activePlan.start_date ?? null;
          let planStartsInDays: number | null = null;
          if (planStartedAt) {
            const startMs = new Date(planStartedAt).getTime();
            const diffDays = Math.ceil((startMs - Date.now()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) planStartsInDays = diffDays;
          }

          // Rest week vs. open week — derived from the active phase. The
          // template uses `phase: 'recovery'` for low-load weeks; treat any
          // recovery or taper week with zero planned rides as intentional.
          const isRestPhase = phaseInfo.name === 'recovery' || phaseInfo.name === 'taper';

          planExec = {
            ...planExec,
            phases: phaseInfo.segments,
            currentWeekInPlan: activePlan.current_week ?? 1,
            totalWeeks: phaseInfo.total || (activePlan.duration_weeks ?? 0),
            currentPhase: phaseInfo.name,
            planEmpty: false,
            planStartsInDays,
            weekRideCount: { completed, planned },
            weekDistanceMi: weekDistanceKm / KM_PER_MILE,
            weekEmpty: planned === 0,
            weekIsRestWeek: isRestPhase && planned === 0,
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
        // The fitness-summary endpoint expects `ctlDeltaPct` (the legacy
        // 28-day TFI %-change). Derive it from the sparkline if both
        // endpoints exist; otherwise pass null and let the endpoint do
        // its own assembly.
        const ctlDeltaPct =
          series.tfi.length >= 2 && series.tfi[0].tfi > 0
            ? ((series.tfi[series.tfi.length - 1].tfi - series.tfi[0].tfi) /
                series.tfi[0].tfi) *
              100
            : 0;

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
                    ctlDeltaPct,
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
        const formDaysNeeded = Math.max(0, 7 - series.daysLogged);
        const fitnessDaysNeeded = Math.max(0, 14 - series.daysLogged);
        const fatigueDaysNeeded = Math.max(0, 7 - series.daysLogged);

        setAthleteState({
          formScore,
          formWord: formEmpty
            ? `Need ${formDaysNeeded} more day${formDaysNeeded === 1 ? '' : 's'}`
            : formVerdict.word,
          formColor: formEmpty ? todayColors.gray : formVerdict.color,
          formEmpty,
          formDaysNeeded,
          fitnessHistory: series.tfi,
          fitnessCurrent: tfiToday,
          fitnessWord: fitnessEmpty
            ? `Need ${fitnessDaysNeeded} more day${fitnessDaysNeeded === 1 ? '' : 's'}`
            : fitnessVerdict.word,
          fitnessColor: fitnessEmpty ? todayColors.gray : fitnessVerdict.color,
          fitnessDelta28d: fitnessDelta28d,
          fitnessSlope14d,
          fitnessEmpty,
          fitnessDaysLogged: series.daysLogged,
          fatigue: afiToday,
          fatigueRelative,
          fatigueWord: fatigueEmpty
            ? `Need ${fatigueDaysNeeded} more day${fatigueDaysNeeded === 1 ? '' : 's'}`
            : fatigueVerdict.word,
          fatigueColor: fatigueEmpty ? todayColors.gray : fatigueVerdict.color,
          fatigueEmpty,
          fatigueDaysNeeded,
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
