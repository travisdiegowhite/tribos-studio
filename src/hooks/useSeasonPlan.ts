/**
 * useSeasonPlan — loads what the Season tab needs and runs the season engine.
 *
 * Reads (never writes, in this phase):
 *   - season_plans: the athlete's saved season covering today, if any;
 *   - race_goals in the season window (races live there, not in a season table);
 *   - fitness_snapshots.weekly_hours: the typical-hours median (last 8 weeks)
 *     and the hours actually ridden in the season's past weeks.
 *
 * The engine runs client-side on every change; see src/lib/season/engine.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getTodayString } from '../utils/dateUtils';
import { computeSeason, mondayOf, typicalWeeklyHours, type SeasonPlan } from '../lib/season/engine';
import {
  DEFAULT_SEASON_WEEKS,
  DEFAULT_WEEKLY_HOURS,
  defaultSeasonStart,
  seasonEndDate,
  toSeasonRaces,
  type RaceGoalRow,
} from '../lib/season/view';

const RACE_COLUMNS = 'id, name, race_date, priority, race_type, distance_km, elevation_gain_m, goal_time_minutes, status';

export type HoursSource = 'history' | 'athlete' | 'default';

interface SeasonPlanRow {
  id: string;
  name: string;
  start_date: string;
  weeks: number;
  fallback_weekly_hours: number | null;
}

export interface SeasonPlanState {
  loading: boolean;
  error: string | null;
  plan: SeasonPlan | null;
  /** The saved season_plans row, or null when showing the default season. */
  savedPlan: SeasonPlanRow | null;
  hoursSource: HoursSource;
  /** Hours ridden per finished week, keyed by the week's Monday. */
  ridden: Record<string, number>;
  todayLocal: string;
}

export function useSeasonPlan(): SeasonPlanState {
  const { user } = useAuth();
  const todayLocal = getTodayString();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    savedPlan: SeasonPlanRow | null;
    races: RaceGoalRow[];
    history: (number | null)[];
    ridden: Record<string, number>;
  }>({ loading: true, error: null, savedPlan: null, races: [], history: [], ridden: {} });

  useEffect(() => {
    let active = true;
    if (!user?.id) return;

    (async () => {
      try {
        // The saved season that covers today: the latest one starting on or before today.
        const { data: plans, error: planError } = await supabase
          .from('season_plans')
          .select('id, name, start_date, weeks, fallback_weekly_hours')
          .eq('user_id', user.id)
          .lte('start_date', todayLocal)
          .order('start_date', { ascending: false })
          .limit(1);
        // A missing table (migration 128 not applied) degrades to the default season.
        const savedPlan = !planError && plans?.[0] ? (plans[0] as SeasonPlanRow) : null;
        const startDate = savedPlan?.start_date ?? defaultSeasonStart(todayLocal);
        const weeks = savedPlan?.weeks ?? DEFAULT_SEASON_WEEKS;

        const raceQuery = (columns: string) =>
          supabase
            .from('race_goals')
            .select(columns)
            .eq('user_id', user.id)
            .gte('race_date', startDate)
            .lte('race_date', seasonEndDate(startDate, weeks))
            .order('race_date', { ascending: true });
        // Canonical-first with fallback: is_focus arrives with migration 128.
        let { data: races, error: raceError } = await raceQuery(`${RACE_COLUMNS}, is_focus`);
        if (raceError) ({ data: races, error: raceError } = await raceQuery(RACE_COLUMNS));
        if (raceError) throw raceError;

        const { data: snapshots } = await supabase
          .from('fitness_snapshots')
          .select('snapshot_week, weekly_hours')
          .eq('user_id', user.id)
          .lt('snapshot_week', todayLocal)
          .order('snapshot_week', { ascending: false })
          .limit(16);
        // Finished weeks inside the season window are drawn as what was ridden.
        const thisMonday = mondayOf(todayLocal);
        const ridden: Record<string, number> = {};
        for (const s of snapshots ?? []) {
          const week = String(s.snapshot_week).slice(0, 10);
          if (s.weekly_hours != null && week >= startDate && week < thisMonday) ridden[week] = Number(s.weekly_hours);
        }

        if (!active) return;
        setState({
          loading: false,
          error: null,
          savedPlan,
          races: (races ?? []) as unknown as RaceGoalRow[],
          // Newest last, as typicalWeeklyHours expects (it reads the last 8).
          history: (snapshots ?? []).map((s) => (s.weekly_hours == null ? null : Number(s.weekly_hours))).reverse(),
          ridden,
        });
      } catch (err) {
        if (!active) return;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load your season.' }));
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, todayLocal]);

  return useMemo(() => {
    const { savedPlan } = state;
    const athleteHours = savedPlan?.fallback_weekly_hours ? Number(savedPlan.fallback_weekly_hours) : null;
    const fromHistory = typicalWeeklyHours(state.history, NaN);
    const hoursSource: HoursSource = Number.isFinite(fromHistory) ? 'history' : athleteHours ? 'athlete' : 'default';
    const hours = hoursSource === 'history' ? fromHistory : (athleteHours ?? DEFAULT_WEEKLY_HOURS);

    const plan = state.loading || state.error
      ? null
      : computeSeason({
          startDate: savedPlan?.start_date ?? defaultSeasonStart(todayLocal),
          weeks: savedPlan?.weeks ?? DEFAULT_SEASON_WEEKS,
          races: toSeasonRaces(state.races),
          typicalWeeklyHours: hours,
        });

    return { loading: state.loading, error: state.error, plan, savedPlan, hoursSource, ridden: state.ridden, todayLocal };
  }, [state, todayLocal]);
}
