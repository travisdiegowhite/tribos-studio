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
import { getPlanTemplate } from '../../data/trainingPlanTemplates';
import { PERSONAS } from '../../data/coachingPersonas';
import {
  classifyFormBandDisplay,
  classifyFsConfidenceTier,
} from '../../utils/formBands';
import { freshnessFromFormScore, todayColors } from '../../utils/todayVocabulary';
import { decodePolyline } from '../today/shared/decodePolyline';
import { deriveIntervalSegments } from './deriveIntervalSegments';
import type {
  ConsistencyDay,
  PersonaId,
  Today,
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : trimmed).trim();
}

function isRunType(type: string | null | undefined): boolean {
  if (!type) return false;
  return /run/i.test(type);
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

  const planQuery = supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Canonical athlete state — most recent training_load_daily row.
  const loadQuery = supabase
    .from('training_load_daily')
    .select('date, form_score, tfi, afi, fs_confidence')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Active micro-block covering today (for the single context chip).
  const blockQuery = supabase
    .from('block_instances')
    .select('block_type, start_date, end_date, status')
    .eq('user_id', userId)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Latest coach message → one-line take.
  const coachMsgQuery = supabase
    .from('coach_conversations')
    .select('message, role, timestamp')
    .eq('user_id', userId)
    .eq('role', 'coach')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const [personaRes, planRes, loadRes, blockRes, coachRes, ribbonRes, historyRes] =
    await Promise.all([
      personaQuery,
      planQuery,
      loadQuery,
      blockQuery,
      coachMsgQuery,
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
  const activePlan = planRes.data;
  let prescription: TodayPrescription | null = null;
  if (activePlan?.id) {
    const { data: workoutRow } = await supabase
      .from('planned_workouts')
      .select('id, name, workout_type, duration_minutes, target_duration, target_rss, target_tss')
      .eq('plan_id', activePlan.id)
      .eq('scheduled_date', today)
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

  // ── Athlete clearance ──────────────────────────────────────────────────────
  const load = loadRes.data;
  const fs = (load?.form_score as number | null) ?? null;
  const tfi = (load?.tfi as number | null) ?? null;
  const afi = (load?.afi as number | null) ?? null;
  const fsConfidence = (load?.fs_confidence as number | null) ?? null;
  const formVerdict = freshnessFromFormScore(fs);

  // ── Plan context chip ──────────────────────────────────────────────────────
  let blockName: string | null = null;
  let dayIndex: number | null = null;
  let dayTotal: number | null = null;
  let chipLabel: string | null = null;
  const block = blockRes.data;
  if (block?.start_date && block?.end_date) {
    blockName = humanizeBlock(block.block_type as string);
    const start = new Date(block.start_date as string);
    const end = new Date(block.end_date as string);
    const now = new Date(today);
    const msDay = 86400000;
    dayIndex = Math.floor((now.getTime() - start.getTime()) / msDay) + 1;
    dayTotal = Math.floor((end.getTime() - start.getTime()) / msDay) + 1;
    chipLabel = `${blockName} · Day ${dayIndex} of ${dayTotal}`;
  } else if (activePlan) {
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

  // ── Coach one-line take ────────────────────────────────────────────────────
  const oneLineTake = firstSentence(coachRes.data?.message as string | null);

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
    coach: { personaId, personaName, oneLineTake },
    athleteState: {
      fs,
      tfi,
      afi,
      formBand: classifyFormBandDisplay(fs),
      formWord: fs == null ? 'Building baseline' : formVerdict.word,
      formColor: fs == null ? todayColors.gray : formVerdict.color,
      formRampPos: fs == null ? 0.5 : clamp01((fs + 30) / 60),
      confidenceTier: classifyFsConfidenceTier(fsConfidence),
    },
    planContext: { blockName, dayIndex, dayTotal, chipLabel },
    ribbon,
  };
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
    const top = matches[0];
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

function humanizeBlock(blockType: string | null | undefined): string {
  if (!blockType) return 'Training block';
  const label = blockType
    .split('_')
    .map((w) => capitalize(w))
    .join(' ');
  return `${label} block`;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
