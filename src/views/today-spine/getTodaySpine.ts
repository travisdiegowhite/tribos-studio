/**
 * getTodaySpine — the single data assembler for the Training-Arc Today.
 *
 * `assembleSpine()` is pure (no Supabase, no React) so the projection /
 * readiness / labelling logic is unit-testable; `getTodaySpine()` runs the
 * Supabase reads (mirroring the query shapes proven in
 * src/views/today/useTodayData.ts) and hands the rows to it.
 *
 * Reader policy per CLAUDE.md — canonical-first with legacy fallback:
 *   training_load_daily.tfi ?? .ctl, .afi ?? .atl, .form_score ?? .tsb
 *   activities.rss ?? .tss   ·   planned_workouts.target_rss ?? .target_tss
 * The page is read-only, so no dual-write is required.
 */

import { supabase } from '../../lib/supabase';
import { estimateActivityTSS } from '../../utils/computeFitnessSnapshots';
import { stepDay } from '../../lib/training/tsb-projection';
import { TYPE_TSS_PER_HOUR } from '../../lib/training/constants';
import { PERSONAS } from '../../data/coachingPersonas';
import { fmtDate } from '../today/athleteMetrics';
import type { AthleteActivityRow, ServerLoadRow } from '../today/athleteMetrics';
import { mapRowToRecentRide, type RecentRide } from '../today/shared/recentRides';
import type { DayActivity, DayNode, SpineData, SpineEvent, WeekRollup, CoachSeed } from './types';

const PAST_SPAN = 42; // 43-day history incl. today (indices 0..42)
const DEFAULT_FUTURE_SPAN = 21; // 3-week projection when there's no goal event
const MIN_FUTURE_SPAN = 21; // never show less than 3 weeks ahead
const MAX_FUTURE_SPAN = 112; // cap the projection at 16 weeks
const KM_PER_MILE = 1.609344;
const M_PER_FOOT = 0.3048;
const RSS_CAP = 500;

// ── date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
/** 'TUE 30 JUN' — matches the prototype's date-flag / node-header format. */
function dateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase();
}

// ── athlete-facing wording ───────────────────────────────────────────────────

function readinessFromFS(fs: number): number {
  return Math.max(28, Math.min(96, Math.round(52 + fs * 1.86)));
}
function daysStr(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

const REST_TYPES = /rest|recover|off/i;

/**
 * Resolve a planned workout row's daily RSS. Canonical-first, then estimate from
 * workout type × duration via the training lib's TYPE_TSS_PER_HOUR convention —
 * coach-generated plans can carry null target_rss, and a coach-built plan must
 * shape the projection exactly like a library plan.
 */
export function plannedRowRSS(p: PlannedRow): number {
  if (REST_TYPES.test(p.workout_type ?? '')) return 0;
  const stored = p.target_rss ?? p.target_tss;
  if (stored != null && Number(stored) > 0) return Number(stored);
  const type = (p.workout_type ?? 'endurance').toLowerCase();
  const perHour = TYPE_TSS_PER_HOUR[type] ?? TYPE_TSS_PER_HOUR.endurance;
  const minutes = Number(p.duration_minutes ?? p.target_duration ?? 0) || 60;
  return Math.round(perHour.mid * (minutes / 60));
}
function formWord(fs: number): string {
  if (fs > 10) return 'fresh and building';
  if (fs >= 5) return 'fresh';
  if (fs >= -5) return 'in the grey zone';
  if (fs >= -20) return 'loading';
  return 'deeply fatigued';
}

const ENDURANCE_NAMES = ['Foothills loop', 'Valley endurance', 'Reservoir loop', 'Canyon spin'];

function formatDur(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Build the teal-header zone chip for a day (ported from the prototype's
 * activity()), preferring a real completed-activity / planned-workout name.
 */
function labelActivity(opts: {
  rss: number;
  durationSec: number;
  index: number;
  isToday: boolean;
  todaysWorkout: { name: string; type: string; durationMin: number } | null;
  plannedName: string | null;
  realName: string | null;
}): DayActivity {
  const { rss, durationSec, index, isToday, todaysWorkout, plannedName, realName } = opts;

  if (isToday && todaysWorkout) {
    const dur = formatDur(todaysWorkout.durationMin);
    return {
      tag: 'PLAN',
      name: todaysWorkout.name,
      meta: [dur, rss > 0 ? `${Math.round(rss)} RSS` : null].filter(Boolean).join(' · ') || 'planned',
      tagColor: '#ffffff',
    };
  }
  if (rss <= 0) {
    return { tag: 'REST', name: plannedName ?? 'Recovery day', meta: 'off the bike', tagColor: '#dfeae6' };
  }
  const min = durationSec > 0 ? Math.round(durationSec / 60) : Math.round(rss * 1.4);
  const meta = [formatDur(min), `${Math.round(rss)} RSS`].filter(Boolean).join(' · ');
  if (rss < 45) {
    return { tag: 'Z1', name: realName ?? plannedName ?? 'Recovery spin', meta, tagColor: '#d3efe1' };
  }
  if (rss < 70) {
    return {
      tag: 'Z2',
      name: realName ?? plannedName ?? ENDURANCE_NAMES[index % ENDURANCE_NAMES.length],
      meta,
      tagColor: '#d3efe1',
    };
  }
  if (rss < 88) {
    return { tag: 'Z3', name: realName ?? plannedName ?? 'Tempo blocks', meta, tagColor: '#ffe1a0' };
  }
  return { tag: 'Z4', name: realName ?? plannedName ?? 'Threshold 4×8', meta, tagColor: '#ffcf8f' };
}

// ── pure assembler ───────────────────────────────────────────────────────────

export interface PlannedRow {
  scheduled_date: string;
  name?: string | null;
  workout_type?: string | null;
  duration_minutes?: number | null;
  target_duration?: number | null;
  target_rss?: number | null;
  target_tss?: number | null;
}

export interface AssembleInput {
  now: Date;
  serverLoad: ServerLoadRow[];
  activities: Array<AthleteActivityRow & { name?: string | null }>;
  ftp: number;
  planned: PlannedRow[];
  todaysWorkout: { name: string; type: string; durationMin: number } | null;
  event: SpineEvent | null;
  persona: { id: string; name: string };
  recentRides: RecentRide[];
  weekRollup: WeekRollup;
}

const EMPTY_ROLLUP: WeekRollup = {
  distanceKm: 0,
  distanceMi: 0,
  elevationM: 0,
  elevationFt: 0,
  rideCount: 0,
};

export function assembleSpine(input: AssembleInput): SpineData {
  const { now, serverLoad, activities, ftp, planned, todaysWorkout, event, persona, recentRides, weekRollup } =
    input;

  const today = startOfDay(now);
  const start90 = addDays(today, -90);

  // Per-day RSS / ride-seconds / a representative name, over the last 90 days.
  const dailyRSS: Record<string, number> = {};
  const dailySec: Record<string, number> = {};
  const dailyName: Record<string, string> = {};
  for (let d = new Date(start90); d <= today; d = addDays(d, 1)) {
    dailyRSS[fmtDate(d)] = 0;
    dailySec[fmtDate(d)] = 0;
  }
  for (const a of activities) {
    const key = a.start_date?.split('T')[0];
    if (key && dailyRSS[key] !== undefined) {
      dailyRSS[key] += Math.min(estimateActivityTSS(a, ftp), RSS_CAP);
      dailySec[key] += Number(a.moving_time) || 0;
      if (a.name && !dailyName[key]) dailyName[key] = a.name;
    }
  }

  // EWA walk (server-preferred), capturing TFI/AFI at every day.
  const serverByDate = new Map<string, ServerLoadRow>();
  for (const r of serverLoad) serverByDate.set(r.date, r);
  const tfiByDate: Record<string, number> = {};
  const afiByDate: Record<string, number> = {};
  const sortedDays = Object.keys(dailyRSS).sort();
  let tfi = 0;
  let afi = 0;
  let daysWithLoad = 0;
  for (const day of sortedDays) {
    const server = serverByDate.get(day);
    if (server && Number.isFinite(Number(server.tfi)) && Number.isFinite(Number(server.afi))) {
      tfi = Number(server.tfi);
      afi = Number(server.afi);
    } else {
      const rss = dailyRSS[day];
      tfi = tfi + (rss - tfi) / 42;
      afi = afi + (rss - afi) / 7;
    }
    if (dailyRSS[day] > 0 || server) daysWithLoad += 1;
    tfiByDate[day] = tfi;
    afiByDate[day] = afi;
  }

  const volHoursAt = (dateKey: string): number => {
    let sec = 0;
    const end = new Date(`${dateKey}T00:00:00`);
    for (let k = 0; k < 7; k++) {
      sec += dailySec[fmtDate(addDays(end, -k))] || 0;
    }
    return sec / 3600;
  };

  const todayKey = fmtDate(today);
  const todayServer = serverByDate.get(todayKey);

  // ── Past 43 days ────────────────────────────────────────────────────────
  const days: DayNode[] = [];
  for (let i = 0; i <= PAST_SPAN; i++) {
    const date = fmtDate(addDays(today, i - PAST_SPAN));
    const dTfi = Math.round(tfiByDate[date] ?? 0);
    const dAfi = Math.round(afiByDate[date] ?? 0);
    const isToday = i === PAST_SPAN;
    const fs =
      isToday && todayServer && Number.isFinite(Number(todayServer.form_score))
        ? Math.round(Number(todayServer.form_score))
        : dTfi - dAfi;
    const rss = Math.round(dailyRSS[date] ?? 0);
    days.push({
      index: i,
      date,
      dateLabel: dateLabel(date),
      isFuture: false,
      tfi: dTfi,
      afi: dAfi,
      fs,
      rss,
      planned: rss > 0,
      readiness: readinessFromFS(fs),
      volHours: volHoursAt(date),
      activity: labelActivity({
        rss,
        durationSec: dailySec[date] ?? 0,
        index: i,
        isToday,
        todaysWorkout,
        plannedName: null,
        realName: dailyName[date] ?? null,
      }),
    });
  }

  // ── Future days (projection) ────────────────────────────────────────────
  const plannedByDate = new Map<string, PlannedRow>();
  for (const p of planned) plannedByDate.set(p.scheduled_date, p);
  const hasPlan = planned.length > 0;

  // With no plan at all, fill future days with the rider's recent daily rhythm
  // so the curve reflects "keep this up" instead of an artificial nosedive.
  // With a plan, an empty day IS a rest day — no phantom fill.
  let trailing = 0;
  for (let k = 0; k < 7; k++) trailing += dailyRSS[fmtDate(addDays(today, -k))] || 0;
  const maintenanceRSS = trailing / 7;

  // Size the projection window to the goal event (so it lands on the axis, not
  // pinned misleadingly at the 3-week edge), clamped to a sane 3–16 week range.
  const futureSpan =
    event && event.daysToRace > 0
      ? Math.min(Math.max(event.daysToRace, MIN_FUTURE_SPAN), MAX_FUTURE_SPAN)
      : DEFAULT_FUTURE_SPAN;

  let state = { tfi: tfiByDate[todayKey] ?? 0, afi: afiByDate[todayKey] ?? 0, formScore: 0 };
  for (let k = 1; k <= futureSpan; k++) {
    const date = fmtDate(addDays(today, k));
    const p = plannedByDate.get(date);
    const rss = p ? plannedRowRSS(p) : hasPlan ? 0 : maintenanceRSS;
    const isPlannedSession = !!p && rss > 0;
    state = stepDay(state, rss);
    const dTfi = Math.round(state.tfi);
    const dAfi = Math.round(state.afi);
    const fs = dTfi - dAfi;
    const durationMin = p ? Number(p.duration_minutes ?? p.target_duration ?? 0) : 0;
    days.push({
      index: PAST_SPAN + k,
      date,
      dateLabel: dateLabel(date),
      isFuture: true,
      tfi: dTfi,
      afi: dAfi,
      fs,
      rss: Math.round(rss),
      planned: isPlannedSession,
      readiness: readinessFromFS(fs),
      volHours: durationMin / 60,
      activity: labelActivity({
        rss: Math.round(rss),
        durationSec: durationMin * 60,
        index: k,
        isToday: false,
        todaysWorkout: null,
        plannedName: p?.name ?? p?.workout_type ?? null,
        realName: null,
      }),
    });
  }

  // ── Header summary line ─────────────────────────────────────────────────
  // Only treat the projection as a "peak" when it's a genuine future build —
  // otherwise a flat/declining rest-week projection reads as "peak in 1 day".
  const todayNode = days[PAST_SPAN];
  const futureNodes = days.slice(PAST_SPAN + 1);
  let peakDaysOut: number | null = null;
  if (futureNodes.length) {
    let best = futureNodes[0];
    futureNodes.forEach((n) => {
      if (n.tfi > best.tfi) best = n;
    });
    const climbing = best.tfi >= todayNode.tfi + 2 && best.index - PAST_SPAN >= 7;
    if (climbing) peakDaysOut = best.index - PAST_SPAN;
  }
  let summaryLine: string | null = null;
  const fw = formWord(todayNode.fs);
  if (event && peakDaysOut) {
    const gap = event.daysToRace - peakDaysOut;
    const timing = Math.abs(gap) <= 7 ? 'right on' : gap > 0 ? 'ahead of' : 'past';
    summaryLine = `You're ${fw}. Peak in ${daysStr(peakDaysOut)}, ${timing} ${event.name}.`;
  } else if (event) {
    summaryLine = `You're ${fw}. ${daysStr(event.daysToRace)} to ${event.name}.`;
  } else if (peakDaysOut) {
    summaryLine = `You're ${fw}. Fitness peaks in about ${daysStr(peakDaysOut)} on your current rhythm.`;
  } else {
    summaryLine = `You're ${fw}.`;
  }

  // ── Coach seed (recommendation block) ───────────────────────────────────
  const isRestToday = todaysWorkout != null && /rest|recover/i.test(todaysWorkout.type);
  let recBody: string;
  if (!todaysWorkout) {
    recBody = `No session prescribed today. You're ${fw} — an easy spin or full rest both work.`;
  } else if (isRestToday) {
    recBody = `Rest day. You're ${fw} — stay off the bike and let the work settle in.`;
  } else {
    const dur = formatDur(todaysWorkout.durationMin);
    recBody = `${dur ? `${dur} ` : ''}${todaysWorkout.type}. You're ${fw} — ${
      todayNode.fs >= 5 ? 'keep it controlled and bank the work.' : 'respect the fatigue and keep it honest.'
    }`;
  }
  const rec: CoachSeed = {
    personaId: persona.id,
    personaName: persona.name,
    oneLineTake: null,
    recTitle: todaysWorkout?.name ?? (todayNode.rss > 0 ? todayNode.activity.name : 'Recovery day'),
    recBody,
  };

  return {
    days,
    todayIndex: PAST_SPAN,
    event,
    weekRollup: weekRollup ?? EMPTY_ROLLUP,
    recentRides,
    coach: rec,
    summaryLine,
    hasHistory: daysWithLoad >= 7,
  };
}

// ── Supabase-backed loader ───────────────────────────────────────────────────

function todayLocalDateString(): string {
  return fmtDate(new Date());
}

export async function getTodaySpine(userId: string): Promise<SpineData> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyKey = ninetyDaysAgo.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const todayKey = todayLocalDateString();

  const [personaRes, profileRes, activitiesRes, serverLoadRes, plannedRes, raceRes, recentRes, mapRes] =
    await Promise.all([
      supabase.from('user_coach_settings').select('coaching_persona').eq('user_id', userId).maybeSingle(),
      supabase.from('user_profiles').select('ftp').eq('id', userId).maybeSingle(),
      supabase
        .from('activities')
        .select(
          'start_date, name, rss, tss, moving_time, distance, total_elevation_gain, ' +
            'average_watts, effective_power, normalized_power, kilojoules, ' +
            'type, sport_type, average_heartrate, is_hidden, duplicate_of',
        )
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', ninetyDaysAgo.toISOString())
        .order('start_date', { ascending: true })
        .limit(500),
      supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score, ctl, atl, tsb')
        .eq('user_id', userId)
        .gte('date', ninetyKey)
        .order('date', { ascending: true }),
      supabase
        .from('planned_workouts')
        .select('scheduled_date, name, workout_type, duration_minutes, target_duration, target_rss, target_tss')
        .eq('user_id', userId)
        .gte('scheduled_date', todayKey)
        .order('scheduled_date', { ascending: true })
        .limit(120),
      supabase
        .from('race_goals')
        .select('id, name, race_date, priority, status')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .gte('race_date', todayKey)
        .order('race_date', { ascending: true })
        .limit(5),
      supabase
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', sevenDaysAgo.toISOString())
        .order('start_date', { ascending: false })
        .limit(20),
      supabase
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .order('start_date', { ascending: false })
        .limit(50),
    ]);

  // Persona.
  const personaId =
    personaRes.data?.coaching_persona && personaRes.data.coaching_persona !== 'pending'
      ? (personaRes.data.coaching_persona as string)
      : 'pragmatist';
  const persona = { id: personaId, name: PERSONAS[personaId]?.name ?? 'The Pragmatist' };

  const ftp = (profileRes.data?.ftp as number | null) || 200;

  // Canonical-first mapping of the daily load rows.
  const serverLoad: ServerLoadRow[] = (serverLoadRes.data ?? []).map((r) => ({
    date: r.date as string,
    tfi: (r.tfi ?? r.ctl ?? null) as number | null,
    afi: (r.afi ?? r.atl ?? null) as number | null,
    form_score: (r.form_score ?? r.tsb ?? null) as number | null,
  }));

  const activities = (activitiesRes.data ?? []) as unknown as Array<
    AthleteActivityRow & { name?: string | null }
  >;

  // Today's prescribed workout (for the node header + coach recommendation).
  const todayPlan = (plannedRes.data ?? []).find((p) => p.scheduled_date === todayKey) ?? null;
  const todaysWorkout = todayPlan
    ? {
        name: todayPlan.name || todayPlan.workout_type || 'Workout',
        type: (todayPlan.workout_type || 'endurance') as string,
        durationMin: Number(todayPlan.duration_minutes ?? todayPlan.target_duration ?? 0),
      }
    : null;

  // Goal event — prefer A-priority, else the soonest upcoming.
  const raceRows = raceRes.data ?? [];
  const aRace = raceRows.find((r) => r.priority === 'A') ?? raceRows[0] ?? null;
  let event: SpineEvent | null = null;
  if (aRace?.race_date) {
    const ms = new Date(`${aRace.race_date}T00:00:00`).getTime() - startOfDay(now).getTime();
    event = {
      name: aRace.name ?? 'Goal event',
      date: aRace.race_date,
      daysToRace: Math.max(0, Math.ceil(ms / 86_400_000)),
      priority: aRace.priority ?? null,
    };
  }

  // Recent rides for the map — last 4 with usable geometry.
  const mapSource = (mapRes.data && mapRes.data.length > 0 ? mapRes.data : recentRes.data ?? []) as Array<
    Record<string, unknown> & { id: string; name: string | null; start_date: string; provider: string | null }
  >;
  const recentRides = mapSource
    .map(mapRowToRecentRide)
    .filter((r) => r.polyline)
    .slice(0, 4);

  // This-week rollup for the map chips.
  const week = recentRes.data ?? [];
  const distanceM = week.reduce(
    (s: number, a) => s + (Number(a.distance_meters) || Number(a.distance) || 0),
    0,
  );
  const elevationM = week.reduce(
    (s: number, a) => s + (Number(a.elevation_gain_meters) || Number(a.total_elevation_gain) || 0),
    0,
  );
  const weekRollup: WeekRollup = {
    distanceKm: distanceM / 1000,
    distanceMi: distanceM / 1000 / KM_PER_MILE,
    elevationM,
    elevationFt: elevationM / M_PER_FOOT,
    rideCount: week.length,
  };

  return assembleSpine({
    now,
    serverLoad,
    activities,
    ftp,
    planned: (plannedRes.data ?? []) as PlannedRow[],
    todaysWorkout,
    event,
    persona,
    recentRides,
    weekRollup,
  });
}
