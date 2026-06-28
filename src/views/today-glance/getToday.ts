/**
 * getToday — the single selector behind the Today glance.
 *
 * Splits into a fast SHELL read (prescription, athlete clearance, plan context,
 * coach take, ribbon) and a deferred ROUTE read (the matched route, which can
 * take ~1s via /api/route-analysis). The glance paints the shell immediately
 * and streams the route into the hero — see useToday.ts. This honors the
 * spec's "never block on route generation" rule without converting the app to
 * a React Router data router.
 *
 * Reader policy: canonical-first with legacy fallback per CLAUDE.md
 * (form_score / tfi / afi are canonical on training_load_daily; rss ?? tss on
 * activities). User-facing strings are RSS / TFI / AFI / FS only.
 */

import { supabase } from '../../lib/supabase';
import { resolveActivePlan } from '../../utils/activePlan';
import { getPlanTemplate } from '../../data/trainingPlanTemplates';
import { PERSONAS } from '../../data/coachingPersonas';
import { decodePolyline } from '../today/shared/decodePolyline';
import { deriveIntervalSegments } from './deriveIntervalSegments';
import { getAthleteState, EMPTY_ATHLETE_STATE } from './athleteState';
import { mapRowToRecentRide, type RecentRide } from '../today/shared/recentRides';
import type {
  ConsistencyDay,
  PersonaId,
  Today,
  TodayAthleteState,
  TodayOutlook,
  TodayPrescription,
  TodayRoute,
  RibbonKind,
} from './types';

const MATCH_THRESHOLD = 75; // matchPct at/above this counts as a good match

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function isRunType(type: string | null | undefined): boolean {
  if (!type) return false;
  return /run/i.test(type);
}

/**
 * Whether a prescription is a running session. Checks both the workout type
 * and the title, since some plans label a run with a generic type
 * (e.g. 'endurance') and only the name ("Easy Aerobic Run") says "run".
 */
export function prescriptionIsRun(p: TodayPrescription | null): boolean {
  return isRunType(p?.type) || isRunType(p?.title);
}

// ── Shell ───────────────────────────────────────────────────────────────────

export async function getTodayShell(userId: string): Promise<Today> {
  const today = todayLocalDateString();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const personaQuery = supabase
    .from('user_coach_settings')
    .select('coaching_persona')
    .eq('user_id', userId)
    .maybeSingle();

  // Canonical resolver (priority-first), shared with the dashboard/calendar.
  const planQuery = resolveActivePlan(supabase, userId);

  // Full athlete state (FORM + fitness story) computed from the activities
  // table, canonical-first — never blank for a rider with history.
  const athleteStatePromise = getAthleteState(userId).catch((err) => {
    console.error('getTodayShell: athlete state failed', err);
    return EMPTY_ATHLETE_STATE;
  });

  // Next race (prefer priority A) for the forward outlook.
  const raceQuery = supabase
    .from('race_goals')
    .select('name, race_date, priority, status')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .gte('race_date', today)
    .order('race_date', { ascending: true })
    .limit(5);

  // 7-day ribbon + history presence (for suggested vs first-run).
  const ribbonQuery = supabase
    .from('activities')
    .select('start_date, type, sport_type')
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .gte('start_date', sevenDaysAgo.toISOString())
    .order('start_date', { ascending: true })
    .limit(100);

  const historyQuery = supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .gte('start_date', ninetyDaysAgo.toISOString());

  const [personaRes, planRes, athleteState, raceRes, ribbonRes, historyRes] =
    await Promise.all([
      personaQuery,
      planQuery,
      athleteStatePromise,
      raceQuery,
      ribbonQuery,
      historyQuery,
    ]);

  // ── Persona ────────────────────────────────────────────────────────────────
  const rawPersona = (personaRes.data?.coaching_persona as string | null) ?? null;
  const personaId: PersonaId =
    rawPersona && rawPersona !== 'pending'
      ? (rawPersona as PersonaId)
      : 'pragmatist';
  const personaName =
    PERSONAS[personaId === 'pending' ? 'pragmatist' : personaId]?.name ??
    'The Pragmatist';

  // ── Prescription ───────────────────────────────────────────────────────────
  const activePlan = planRes;
  let prescription: TodayPrescription | null = null;
  {
    // User-scoped: today's workout from any plan/source, not just the active plan.
    const { data: workoutRow } = await supabase
      .from('planned_workouts')
      .select('id, name, workout_type, duration_minutes, target_duration, target_rss, target_tss')
      .eq('user_id', userId)
      .eq('scheduled_date', today)
      .order('plan_id', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (workoutRow) {
      const type = (workoutRow.workout_type as string) || 'endurance';
      prescription = {
        type,
        title: (workoutRow.name as string) || (workoutRow.workout_type as string) || 'Workout',
        durationMin:
          (workoutRow.duration_minutes as number) ||
          (workoutRow.target_duration as number) ||
          0,
        // Canonical-first: target_rss ?? target_tss.
        targetRSS:
          (workoutRow.target_rss as number | null) ??
          (workoutRow.target_tss as number | null) ??
          null,
        // planned_workouts has no interval-structure column today; the
        // interval-coloring gating dependency tracks this. Left null until a
        // structure source is wired (see deriveIntervalSegments.ts).
        structure: null,
        workoutId: workoutRow.id as string,
      };
    }
  }

  // ── Plan context chip ──────────────────────────────────────────────────────
  // Derived from the active training plan's phase (the sequencer's block chip was
  // retired with System B). blockGoal stays null; the outlook falls back to the race line.
  let blockName: string | null = null;
  const dayIndex: number | null = null;
  const dayTotal: number | null = null;
  let chipLabel: string | null = null;
  const blockGoal: string | null = null;
  if (activePlan) {
    const template = activePlan.template_id ? getPlanTemplate(activePlan.template_id) : undefined;
    const week = (activePlan.current_week as number) ?? 1;
    const phase = template?.phases?.find((p) => p.weeks.includes(week));
    if (phase) {
      blockName = `${capitalize(phase.phase)} block`;
      chipLabel = `${blockName} · Week ${week}`;
    } else if (activePlan.name) {
      chipLabel = activePlan.name as string;
    }
  }

  // ── Forward outlook ("where you're going") ──────────────────────────────────
  const outlook = buildOutlook(raceRes.data ?? [], blockGoal, today);

  // ── Ribbon ─────────────────────────────────────────────────────────────────
  const ribbon = buildRibbon((ribbonRes.data ?? []) as RibbonActivityRow[], today);

  const hasHistory = (historyRes.count ?? 0) > 0;

  // ── Provisional hero state (route resolves later) ──────────────────────────
  let heroState: Today['heroState'];
  if (prescription?.type === 'rest') {
    heroState = 'rest';
  } else if (prescription) {
    heroState = 'generating'; // route pending; finalized in useToday
  } else if (hasHistory) {
    heroState = 'suggested';
  } else {
    heroState = 'first-run';
  }

  return {
    date: today,
    heroState,
    prescription,
    route: null,
    // oneLineTake is filled by the deferred persona summary (getTodayCoach);
    // the shell leaves it null so the rail can stream it in.
    coach: { personaId, personaName, oneLineTake: null },
    athleteState,
    planContext: { blockName, dayIndex, dayTotal, chipLabel },
    outlook,
    ribbon,
  };
}

/**
 * Deferred persona-voiced fitness take. Calls the same /api/fitness-summary
 * endpoint the live Today uses (surface=today), so the coach line speaks to
 * current fitness rather than echoing the last chat message.
 */
export async function getTodayCoach(
  athleteState: TodayAthleteState,
): Promise<string | null> {
  const { tfi, afi, fs, ctlDeltaPct } = athleteState;
  if (tfi == null || afi == null || fs == null) return null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch('/api/fitness-summary', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        surface: 'today',
        clientMetrics: { tfi, afi, formScore: fs, ctlDeltaPct },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.summary as string | null) ?? null;
  } catch (err) {
    console.error('getTodayCoach: fitness-summary fetch failed', err);
    return null;
  }
}

// ── Deferred route ───────────────────────────────────────────────────────────

export async function getTodayRoute(
  prescription: TodayPrescription | null,
): Promise<TodayRoute | null> {
  if (!prescription || prescription.type === 'rest' || !prescription.workoutId) {
    return null;
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

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
            id: prescription.workoutId,
            name: prescription.title,
            category: prescription.type,
            duration: prescription.durationMin,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json.matches?.[prescription.workoutId] ?? [];

    // Sport gate: a run workout must match a run activity (and vice versa) so we
    // never show a gravel ride for an "Easy Aerobic Run". route-analysis ranks
    // by workout category only, so filter by the activity's sport here.
    const wantRun = prescriptionIsRun(prescription);
    const sportMatched = matches.filter((m: { activity?: { type?: string | null; sport_type?: string | null } }) => {
      const sport = m.activity?.sport_type || m.activity?.type;
      return isRunType(sport) === wantRun;
    });
    const top = sportMatched[0];
    if (!top?.activity) return null;

    const polyline: string | null =
      top.activity.map_summary_polyline || top.activity.summary_polyline || null;
    const coords = decodePolyline(polyline); // [lng, lat][]
    const geojson: GeoJSON.Geometry | null =
      coords.length >= 2 ? { type: 'LineString', coordinates: coords as number[][] } : null;

    return {
      id: top.activity.id,
      name: top.activity.name || 'Matched Route',
      geojson,
      polyline,
      distanceKm: (top.activity.distance ?? 0) / 1000,
      elevationGainM: Number(top.activity.total_elevation_gain ?? 0),
      matchPct: Number(top.matchScore ?? 0),
      intervalSegments: deriveIntervalSegments(prescription, coords.length),
      start: coords.length > 0 ? (coords[0] as [number, number]) : null,
    };
  } catch (err) {
    console.error('getTodayRoute: route match fetch failed', err);
    return null;
  }
}

/**
 * Deferred recent-rides fetch — the last 5 rides with route geometry, used to
 * fill the hero map when there's no single matched route (the run-day / no-match
 * case). Mirrors the live Today's map query; mapping/filtering is shared via
 * ../today/shared/recentRides.
 */
export async function getTodayRecentRoutes(userId: string): Promise<RecentRide[]> {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select(
        'id, name, start_date, provider, distance, distance_meters, ' +
          'total_elevation_gain, elevation_gain_meters, moving_time, ' +
          'duration_seconds, elapsed_time, polyline, summary_polyline, ' +
          'map_summary_polyline',
      )
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .order('start_date', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as unknown as Array<Record<string, unknown> & { id: string; start_date: string }>)
      .map(mapRowToRecentRide)
      .filter((r) => r.polyline)
      .slice(0, 5);
  } catch (err) {
    console.error('getTodayRecentRoutes: fetch failed', err);
    return [];
  }
}

/**
 * Finalize hero state once the deferred route is known. Pure so it can be
 * unit-tested without the network.
 */
export function finalizeHeroState(
  shellState: Today['heroState'],
  route: TodayRoute | null,
): Today['heroState'] {
  if (shellState !== 'generating') return shellState;
  if (route?.geojson && route.matchPct >= MATCH_THRESHOLD) return 'matched';
  return 'generated';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RibbonActivityRow {
  start_date: string;
  type?: string | null;
  sport_type?: string | null;
}

function buildRibbon(rows: RibbonActivityRow[], today: string): ConsistencyDay[] {
  // Seven cells ending today; today is hollow (prescribed, not yet done).
  const byDate = new Map<string, RibbonKind>();
  for (const r of rows) {
    const key = (r.start_date || '').slice(0, 10);
    if (!key) continue;
    const kind: RibbonKind = isRunType(r.sport_type || r.type) ? 'run' : 'ride';
    byDate.set(key, kind);
  }
  const days: ConsistencyDay[] = [];
  const end = new Date(today);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    if (key === today) {
      days.push({ date: key, kind: 'today' });
    } else {
      days.push({ date: key, kind: byDate.get(key) ?? 'rest' });
    }
  }
  return days;
}

interface RaceRow {
  name?: string | null;
  race_date?: string | null;
  priority?: string | null;
}

function buildOutlook(
  raceRows: RaceRow[],
  blockGoal: string | null,
  today: string,
): TodayOutlook {
  const aRace = raceRows.find((r) => r.priority === 'A') ?? raceRows[0] ?? null;
  let daysToRace: number | null = null;
  const raceName = aRace?.name ?? null;
  if (aRace?.race_date) {
    const ms = new Date(aRace.race_date).getTime() - new Date(today).getTime();
    daysToRace = Math.max(0, Math.ceil(ms / 86400000));
  }

  let line: string | null = null;
  if (blockGoal && raceName && daysToRace != null) {
    line = `${blockGoal} for ${raceName} · ${daysToRace} days out`;
  } else if (raceName && daysToRace != null) {
    line = `${raceName} · ${daysToRace} days out`;
  } else if (blockGoal) {
    line = blockGoal;
  }

  return { blockGoal, raceName, daysToRace, line };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
