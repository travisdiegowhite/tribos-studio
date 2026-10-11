/**
 * useSeasonPlan — loads what the Season tab needs, runs the season engine, and
 * saves the athlete's edits.
 *
 * Reads:
 *   - race_goals in the season window (races live there, not in a season table);
 *   - fitness_snapshots.weekly_hours: the typical-hours median (last 8 weeks)
 *     and the hours actually ridden in the season's past weeks;
 *   - season_plans: the athlete's season record (fallback hours, change log).
 *
 * Edits apply to local state at once, so the engine re-runs and every verdict
 * updates on the click. Changed races are saved together about a second after
 * the last click (race_goals + calendar mirror, then a season_plan_events row
 * per change), and every save reports: a toast with Undo, or a red toast that
 * says what failed and puts the race back.
 *
 * The window is rolling (8 weeks back, 52 ahead) until fixed seasons are
 * decided; see src/lib/season/view.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getTodayString } from '../utils/dateUtils';
import { computeSeason, mondayOf, typicalWeeklyHours, type Priority, type SeasonPlan } from '../lib/season/engine';
import {
  DEFAULT_SEASON_WEEKS,
  DEFAULT_WEEKLY_HOURS,
  defaultSeasonStart,
  seasonEndDate,
  toSeasonRaces,
  type RaceGoalRow,
} from '../lib/season/view';
import { describeChange, eventsFor, moveRace, removeRace, sameRace, setFocus, setPriority } from '../lib/season/edits';
import { RACE_GOAL_COLUMNS, deleteRace, ensureSeasonPlan, logSeasonEvents, saveRace } from '../lib/season/seasonWrites';

/** Quiet period after the last click before changes are saved. */
export const SAVE_DEBOUNCE_MS = 1000;

export type HoursSource = 'history' | 'athlete' | 'default';
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface SeasonPlanRow {
  id: string;
  name: string;
  start_date: string;
  weeks: number;
  fallback_weekly_hours: number | null;
}

export interface SeasonActions {
  move: (raceId: string, weeks: number) => void;
  setPriority: (raceId: string, priority: Priority) => void;
  setFocus: (raceId: string) => void;
  remove: (raceId: string) => Promise<boolean>;
  /** Save anything still waiting now (before the race form opens, so it can't overwrite the form). */
  flush: () => Promise<void>;
  reload: () => void;
}

export interface SeasonPlanState {
  loading: boolean;
  error: string | null;
  plan: SeasonPlan | null;
  /** The athlete's season record, if they have one. */
  savedPlan: SeasonPlanRow | null;
  hoursSource: HoursSource;
  /** Hours ridden per finished week, keyed by the week's Monday. */
  ridden: Record<string, number>;
  todayLocal: string;
  /** The race_goals rows behind the plan (for the race form). */
  rows?: RaceGoalRow[];
  actions?: SeasonActions;
  saveStatus?: SaveStatus;
}

interface LoadedState {
  loading: boolean;
  error: string | null;
  savedPlan: SeasonPlanRow | null;
  races: RaceGoalRow[];
  history: (number | null)[];
  ridden: Record<string, number>;
}

export function useSeasonPlan(): SeasonPlanState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const todayLocal = getTodayString();
  const startDate = defaultSeasonStart(todayLocal);
  const weeks = DEFAULT_SEASON_WEEKS;

  const [state, setState] = useState<LoadedState>({
    loading: true,
    error: null,
    savedPlan: null,
    races: [],
    history: [],
    ridden: {},
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // The latest rows (for saves that run after a render) and the last saved version of each race.
  const racesRef = useRef<RaceGoalRow[]>([]);
  const savedRef = useRef<Map<string, RaceGoalRow>>(new Map());
  const dirtyRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planIdRef = useRef<string | null>(null);

  // ─── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    if (!userId) return;

    (async () => {
      try {
        // The athlete's season record, if any. A missing table (migration 128
        // not applied) just means no record.
        const { data: plans, error: planError } = await supabase
          .from('season_plans')
          .select('id, name, start_date, weeks, fallback_weekly_hours')
          .eq('user_id', userId)
          .order('start_date', { ascending: false })
          .limit(1);
        const savedPlan = !planError && plans?.[0] ? (plans[0] as SeasonPlanRow) : null;

        const raceQuery = (columns: string) =>
          supabase
            .from('race_goals')
            .select(columns)
            .eq('user_id', userId)
            .gte('race_date', startDate)
            .lte('race_date', seasonEndDate(startDate, weeks))
            .order('race_date', { ascending: true });
        // Canonical-first with fallback: is_focus arrives with migration 128.
        let { data: races, error: raceError } = await raceQuery(`${RACE_GOAL_COLUMNS}, is_focus`);
        if (raceError) ({ data: races, error: raceError } = await raceQuery(RACE_GOAL_COLUMNS));
        if (raceError) throw raceError;

        const { data: snapshots } = await supabase
          .from('fitness_snapshots')
          .select('snapshot_week, weekly_hours')
          .eq('user_id', userId)
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
        const rows = (races ?? []) as unknown as RaceGoalRow[];
        racesRef.current = rows;
        savedRef.current = new Map(rows.map((r) => [r.id, r]));
        dirtyRef.current.clear();
        planIdRef.current = savedPlan?.id ?? null;
        setState({
          loading: false,
          error: null,
          savedPlan,
          races: rows,
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
  }, [userId, todayLocal, startDate, weeks, reloadKey]);

  // ─── Save ────────────────────────────────────────────────────────────────
  const setRaces = useCallback((next: RaceGoalRow[]) => {
    racesRef.current = next;
    setState((s) => ({ ...s, races: next }));
  }, []);

  /** Put races back to given versions (or drop them when absent) in local state. */
  const restoreLocal = useCallback(
    (versions: Map<string, RaceGoalRow | undefined>) => {
      let next = racesRef.current.filter((r) => !(versions.has(r.id) && versions.get(r.id) === undefined));
      next = next.map((r) => (versions.get(r.id) ? (versions.get(r.id) as RaceGoalRow) : r));
      for (const [id, row] of versions) if (row && !next.some((r) => r.id === id)) next.push(row);
      next.sort((a, b) => String(a.race_date).localeCompare(String(b.race_date)));
      setRaces(next);
    },
    [setRaces],
  );

  const flush = useCallback(
    async (opts: { undoable?: boolean } = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!userId || dirtyRef.current.size === 0) return;
      const ids = [...dirtyRef.current];
      dirtyRef.current.clear();

      const changes = ids
        .map((id) => ({ id, before: savedRef.current.get(id), after: racesRef.current.find((r) => r.id === id) }))
        .filter((c) => c.after && !sameRace(c.before, c.after));
      if (changes.length === 0) {
        setSaveStatus('idle');
        return;
      }

      setSaveStatus('saving');
      const failures: string[] = [];
      for (const c of changes) {
        const result = await saveRace(userId, c.after as RaceGoalRow);
        if (result.success) savedRef.current.set(c.id, c.after as RaceGoalRow);
        else failures.push(result.error ?? 'Unknown error');
      }

      const saved = changes.filter((c) => savedRef.current.get(c.id) === c.after);
      if (failures.length > 0) {
        // Put the races that didn't save back to their last saved version.
        restoreLocal(new Map(changes.filter((c) => !saved.includes(c)).map((c) => [c.id, c.before])));
        setSaveStatus('error');
        notifications.show({ title: "Couldn't save your season", message: failures.join(' '), color: 'red', autoClose: 8000 });
      } else {
        setSaveStatus('saved');
      }
      if (saved.length === 0) return;

      // Change log (best effort; the races are already saved).
      const drafts = saved.flatMap((c) => eventsFor(c.before, c.after));
      if (!planIdRef.current) {
        const plan = await ensureSeasonPlan(userId, startDate, weeks);
        if (plan.success && plan.data) planIdRef.current = plan.data;
      }
      if (planIdRef.current) await logSeasonEvents(userId, planIdRef.current, drafts);

      const message = saved.length === 1 ? describeChange(saved[0].before, saved[0].after) : `Saved ${saved.length} changes.`;
      notifications.show({
        title: message,
        message: opts.undoable === false ? undefined : 'Tap to undo',
        color: 'teal',
        autoClose: 6000,
        onClick:
          opts.undoable === false
            ? undefined
            : () => {
                // Undo is another edit: restore the previous versions and save them now.
                restoreLocal(new Map(saved.map((c) => [c.id, c.before])));
                for (const c of saved) dirtyRef.current.add(c.id);
                void flushRef.current({ undoable: false });
              },
      });
    },
    [userId, startDate, weeks, restoreLocal],
  );
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const edit = useCallback(
    (next: RaceGoalRow[]) => {
      const before = new Map(racesRef.current.map((r) => [r.id, r]));
      for (const r of next) if (before.get(r.id) !== r) dirtyRef.current.add(r.id);
      setRaces(next);
      setSaveStatus('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flushRef.current(), SAVE_DEBOUNCE_MS);
    },
    [setRaces],
  );

  // Leaving the tab saves anything still waiting.
  useEffect(() => () => void flushRef.current(), []);

  // ─── Plan ────────────────────────────────────────────────────────────────
  const { savedPlan } = state;
  const athleteHours = savedPlan?.fallback_weekly_hours ? Number(savedPlan.fallback_weekly_hours) : null;
  const fromHistory = typicalWeeklyHours(state.history, NaN);
  const hoursSource: HoursSource = Number.isFinite(fromHistory) ? 'history' : athleteHours ? 'athlete' : 'default';
  const hours = hoursSource === 'history' ? fromHistory : (athleteHours ?? DEFAULT_WEEKLY_HOURS);

  const plan = useMemo(
    () =>
      state.loading || state.error
        ? null
        : computeSeason({ startDate, weeks, races: toSeasonRaces(state.races), typicalWeeklyHours: hours }),
    [state.loading, state.error, state.races, startDate, weeks, hours],
  );
  const planRef = useRef(plan);
  planRef.current = plan;

  const actions = useMemo<SeasonActions>(
    () => ({
      move: (raceId, by) => edit(moveRace(racesRef.current, raceId, by)),
      setPriority: (raceId, priority) => edit(setPriority(racesRef.current, raceId, priority)),
      setFocus: (raceId) => {
        if (planRef.current) edit(setFocus(racesRef.current, raceId, planRef.current));
      },
      remove: async (raceId) => {
        const row = racesRef.current.find((r) => r.id === raceId);
        if (!userId || !row) return false;
        await flushRef.current({ undoable: false }); // save anything pending first
        setSaveStatus('saving');
        const result = await deleteRace(userId, row);
        if (!result.success) {
          setSaveStatus('error');
          notifications.show({ title: "Couldn't remove the race", message: result.error, color: 'red', autoClose: 8000 });
          return false;
        }
        savedRef.current.delete(raceId);
        setRaces(removeRace(racesRef.current, raceId));
        setSaveStatus('saved');
        if (!planIdRef.current) {
          const p = await ensureSeasonPlan(userId, startDate, weeks);
          if (p.success && p.data) planIdRef.current = p.data;
        }
        if (planIdRef.current) await logSeasonEvents(userId, planIdRef.current, eventsFor(row, undefined));
        notifications.show({
          title: describeChange(row, undefined),
          message: 'Tap to undo',
          color: 'teal',
          autoClose: 6000,
          onClick: async () => {
            const back = await saveRace(userId, row, true);
            if (!back.success) {
              notifications.show({ title: `Couldn't bring back ${row.name ?? 'the race'}`, message: back.error, color: 'red' });
              return;
            }
            savedRef.current.set(row.id, row);
            restoreLocal(new Map([[row.id, row]]));
            if (planIdRef.current) await logSeasonEvents(userId, planIdRef.current, eventsFor(undefined, row));
          },
        });
        return true;
      },
      flush: () => flushRef.current(),
      reload: () => {
        void flushRef.current({ undoable: false }).then(() => setReloadKey((k) => k + 1));
      },
    }),
    [edit, userId, setRaces, restoreLocal, startDate, weeks],
  );

  return {
    loading: state.loading,
    error: state.error,
    plan,
    savedPlan,
    hoursSource,
    ridden: state.ridden,
    todayLocal,
    rows: state.races,
    actions,
    saveStatus,
  };
}
