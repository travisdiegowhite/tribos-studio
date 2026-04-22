import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { estimateActivityTSS } from '../utils/computeFitnessSnapshots';
import {
  PHASE_COLOR,
  WORKOUT_STYLE,
  classifyWorkoutType,
  derivePhaseForWeek,
  groupPhases,
} from './useTodayChart';

export type RangeKey = '6w' | '3m' | '6m' | '1y' | 'all';

export const RANGE_DAYS: Record<RangeKey, number> = {
  '6w': 42,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  'all': 1095,
};

const WARMUP_DAYS = 90;

export interface BanisterDay {
  date: string;
  tfi: number;
  afi: number;
  fs: number;
}

export interface BanisterRide {
  date: string;
  workoutType: string;
  size: string;
  color: string;
  hollow: boolean;
}

export interface BanisterRace {
  date: string;
  name: string;
}

export interface BanisterPhase {
  startDate: string;
  endDate: string;
  phase: string;
}

export interface BanisterKpi {
  tfi: number | null;
  afi: number | null;
  fs: number | null;
  deltaPct28d: number | null;
}

export interface BanisterChartData {
  days: BanisterDay[];
  rides: BanisterRide[];
  races: BanisterRace[];
  phases: BanisterPhase[];
  kpi: BanisterKpi;
  loading: boolean;
  error: string | null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoDateOffset(baseIso: string, offsetDays: number): string {
  const d = new Date(`${baseIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const EMPTY_STATE: BanisterChartData = {
  days: [],
  rides: [],
  races: [],
  phases: [],
  kpi: { tfi: null, afi: null, fs: null, deltaPct28d: null },
  loading: true,
  error: null,
};

export default function useBanisterChart(
  userId: string | undefined,
  opts: { rangeKey?: RangeKey; userFtp?: number } = {},
): BanisterChartData {
  const { rangeKey = '6m', userFtp: externalFtp } = opts;

  const [state, setState] = useState<BanisterChartData>(EMPTY_STATE);

  useEffect(() => {
    if (!userId) {
      setState({ ...EMPTY_STATE, loading: false });
      return;
    }
    let cancelled = false;
    setState(EMPTY_STATE);

    async function load() {
      try {
        const today = todayIso();
        const windowDays = RANGE_DAYS[rangeKey];
        const startDate = isoDateOffset(today, -(windowDays - 1));
        const warmupDate = isoDateOffset(today, -(windowDays - 1 + WARMUP_DAYS));

        const [planResult, activitiesResult, profileResult] = await Promise.all([
          supabase
            .from('training_plans')
            .select('id, current_week, duration_weeks, methodology, started_at')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),

          supabase
            .from('activities')
            .select('id, name, start_date, type, rss, tss, distance, moving_time, total_elevation_gain, average_watts, normalized_power, effective_power, kilojoules')
            .eq('user_id', userId)
            .is('duplicate_of', null)
            .gte('start_date', `${warmupDate}T00:00:00Z`)
            .lte('start_date', `${today}T23:59:59Z`)
            .order('start_date', { ascending: true }),

          externalFtp == null
            ? supabase.from('user_profiles').select('ftp').eq('id', userId).maybeSingle()
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const plan = planResult.data || null;
        const rawActivities = activitiesResult.data || [];
        const userFtp: number = externalFtp ?? (profileResult?.data as { ftp: number } | null)?.ftp ?? 200;

        // EWA over full warm-up + window span
        const totalSpan = windowDays + WARMUP_DAYS;
        const dailyRss = new Array(totalSpan).fill(0);
        const dailyDates: string[] = new Array(totalSpan);
        for (let i = 0; i < totalSpan; i++) {
          dailyDates[i] = isoDateOffset(today, -(totalSpan - 1 - i));
        }
        const dateIndex = new Map(dailyDates.map((d, i) => [d, i]));

        for (const act of rawActivities) {
          const date = act.start_date?.slice(0, 10);
          if (!date) continue;
          const idx = dateIndex.get(date);
          if (idx == null) continue;
          const rss = estimateActivityTSS(act, userFtp);
          if (!rss) continue;
          dailyRss[idx] += Math.min(rss, 500);
        }

        const computedTfi = new Array(totalSpan).fill(0);
        const computedAfi = new Array(totalSpan).fill(0);
        let tfi = 0;
        let afi = 0;
        for (let i = 0; i < totalSpan; i++) {
          tfi = tfi + (dailyRss[i] - tfi) / 42;
          afi = afi + (dailyRss[i] - afi) / 7;
          computedTfi[i] = tfi;
          computedAfi[i] = afi;
        }

        const computedFs = new Array(totalSpan).fill(0);
        for (let i = 0; i < totalSpan; i++) {
          computedFs[i] = i === 0 ? 0 : computedTfi[i - 1] - computedAfi[i - 1];
        }

        const days: BanisterDay[] = [];
        const windowStartIdx = WARMUP_DAYS;
        for (let offset = 0; offset < windowDays; offset++) {
          const globalIdx = windowStartIdx + offset;
          const date = dailyDates[globalIdx];
          days.push({
            date,
            tfi: Math.round(computedTfi[globalIdx]),
            afi: Math.round(computedAfi[globalIdx]),
            fs: Math.round(computedFs[globalIdx]),
          });
        }

        // Phase bands from active plan
        let phases: BanisterPhase[] = [];
        if (plan?.started_at && plan?.duration_weeks) {
          const planStart = new Date(plan.started_at);
          const perDay = days.map((d) => {
            const dDate = new Date(`${d.date}T12:00:00Z`);
            const weeksSinceStart = Math.floor((dDate.getTime() - planStart.getTime()) / (7 * 86400000));
            const planWeek = Math.max(1, Math.min(plan.duration_weeks, weeksSinceStart + 1));
            return { date: d.date, phase: derivePhaseForWeek(planWeek, plan.duration_weeks) };
          });
          phases = groupPhases(perDay) as BanisterPhase[];
        }

        // Ride dots — one per day, keep hardest session
        const byDay = new Map<string, BanisterRide & { load: number }>();
        const races: BanisterRace[] = [];
        const seenRaceDates = new Set<string>();

        for (const act of rawActivities) {
          const localDate = act.start_date?.slice(0, 10);
          if (!localDate) continue;
          const globalIdx = dateIndex.get(localDate);
          if (globalIdx == null || globalIdx < windowStartIdx) continue;

          const workoutType = classifyWorkoutType(act, userFtp);
          const style = (WORKOUT_STYLE as Record<string, { color: string; size: string; hollow?: boolean }>)[workoutType] || WORKOUT_STYLE.default;
          const load = estimateActivityTSS(act, userFtp) ?? 0;

          const existing = byDay.get(localDate);
          if (!existing || load > existing.load) {
            byDay.set(localDate, {
              date: localDate,
              workoutType,
              size: style.size,
              color: style.color,
              hollow: !!style.hollow,
              load,
            });
          }

          if (workoutType === 'race' && !seenRaceDates.has(localDate)) {
            seenRaceDates.add(localDate);
            races.push({ date: localDate, name: act.name || 'Race' });
          }
        }
        const rides = Array.from(byDay.values()).map(({ load: _load, ...r }) => r);

        // KPI strip
        const lastDay = days[days.length - 1];
        const dayIdx28 = Math.max(0, days.length - 29);
        const day28 = days[dayIdx28];
        let deltaPct28d: number | null = null;
        if (lastDay?.tfi && day28?.tfi && day28.tfi > 0) {
          deltaPct28d = ((lastDay.tfi - day28.tfi) / day28.tfi) * 100;
        }

        setState({
          days,
          rides,
          races,
          phases,
          kpi: {
            tfi: lastDay?.tfi ?? null,
            afi: lastDay?.afi ?? null,
            fs: lastDay?.fs ?? null,
            deltaPct28d,
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('[useBanisterChart] fetch failed:', err);
          setState((s) => ({ ...s, loading: false, error: (err as Error).message || 'failed' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userId, rangeKey, externalFtp]);

  return state;
}

export { PHASE_COLOR };
