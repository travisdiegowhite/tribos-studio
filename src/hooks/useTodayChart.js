import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useTodayChart — past-only fitness-curve data hook.
 *
 * Spec §13 step 4: fetches the rider's last ~6 weeks of training_load_daily
 * rows, active plan metadata, and completed activities to build the
 * structured data the FitnessCurveChart renders. Projection (spec §3.10)
 * lands in step 5 — this hook returns `projectionDays: []` for now.
 *
 * Return shape:
 *   {
 *     days:    [{ date: 'YYYY-MM-DD', tfi, afi, fs }],         // past only
 *     phases:  [{ startDate, endDate, phase }],                // aligned to days[]
 *     rides:   [{ date, workoutType, size, color }],           // ride markers
 *     kpi:     { tfi, afi, fs, deltaPct28d },                  // KPI strip values
 *     plan:    { currentWeek, totalWeeks, methodology } | null,
 *     today:   'YYYY-MM-DD',
 *     loading: boolean,
 *     error:   string | null,
 *   }
 */

const WINDOW_DAYS = 42;

// Workout-type → colour + dot-size (spec §3.5).
const WORKOUT_STYLE = {
  recovery:     { color: '#639922', size: 'small' },
  endurance:    { color: '#639922', size: 'small' },
  easy:         { color: '#639922', size: 'small' },
  tempo:        { color: '#C49A0A', size: 'medium' },
  long_ride:    { color: '#C49A0A', size: 'medium' },
  sweet_spot:   { color: '#D4600A', size: 'large' },
  threshold:    { color: '#D4600A', size: 'large' },
  vo2:          { color: '#C43C2A', size: 'large' },
  anaerobic:    { color: '#C43C2A', size: 'large' },
  race:         { color: '#C43C2A', size: 'large' },
  rest:         { color: '#FFFFFF', size: 'small', hollow: true },
  default:      { color: '#7A7970', size: 'medium' },
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoDateOffset(baseIso, offsetDays) {
  const d = new Date(`${baseIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function classifyWorkoutType(raw) {
  const s = (raw || '').toLowerCase();
  if (!s) return 'endurance';
  if (s.includes('recovery')) return 'recovery';
  if (s.includes('vo2') || s.includes('vo_2')) return 'vo2';
  if (s.includes('anaerobic')) return 'anaerobic';
  if (s.includes('threshold') || s.includes('ftp')) return 'threshold';
  if (s.includes('sweet')) return 'sweet_spot';
  if (s.includes('tempo')) return 'tempo';
  if (s.includes('race')) return 'race';
  if (s.includes('long')) return 'long_ride';
  if (s.includes('easy')) return 'easy';
  if (s.includes('rest')) return 'rest';
  return 'endurance';
}

// Spec §3.4 phase colour palette (exported so the chart can colour bands).
export const PHASE_COLOR = {
  base: '#2A8C82',
  build: '#C49A0A',
  peak: '#D4600A',
  taper: '#C43C2A',
  recovery: '#7A7970',
};

/**
 * Match derivePhase() — kept in sync with api/utils/contextHelpers.js.
 * Runs purely on plan-week position so we can back-fill historical phases.
 */
export function derivePhaseForWeek(currentWeek, totalWeeks) {
  if (!currentWeek || !totalWeeks) return 'base';
  const ratio = currentWeek / totalWeeks;
  if (ratio <= 0.33) return 'base';
  if (ratio <= 0.66) return 'build';
  if (ratio <= 0.85) return 'peak';
  return 'taper';
}

function groupPhases(perDay) {
  if (perDay.length === 0) return [];
  const out = [];
  let current = { startDate: perDay[0].date, endDate: perDay[0].date, phase: perDay[0].phase };
  for (let i = 1; i < perDay.length; i += 1) {
    const d = perDay[i];
    if (d.phase === current.phase) {
      current.endDate = d.date;
    } else {
      out.push(current);
      current = { startDate: d.date, endDate: d.date, phase: d.phase };
    }
  }
  out.push(current);
  return out;
}

export default function useTodayChart(userId) {
  const [state, setState] = useState({
    days: [],
    phases: [],
    rides: [],
    kpi: { tfi: null, afi: null, fs: null, deltaPct28d: null },
    plan: null,
    today: todayIso(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    let cancelled = false;

    async function load() {
      try {
        const today = todayIso();
        const startDate = isoDateOffset(today, -(WINDOW_DAYS - 1));

        const [loadResult, planResult, activitiesResult] = await Promise.all([
          supabase
            .from('training_load_daily')
            .select('date, tfi, afi, form_score')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', today)
            .order('date', { ascending: true }),

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
            .select('id, start_date, type, rss, tss, duration_seconds, moving_time')
            .eq('user_id', userId)
            .is('duplicate_of', null)
            .gte('start_date', `${startDate}T00:00:00Z`)
            .lte('start_date', `${today}T23:59:59Z`)
            .order('start_date', { ascending: true }),
        ]);

        if (cancelled) return;

        const rawLoad = loadResult.data || [];
        const plan = planResult.data || null;
        const rawActivities = activitiesResult.data || [];

        // Build dense day series — fill any missing calendar days by
        // carrying the last known tfi/afi forward and zeroing-out fs until
        // the next real row lands. Keeps the chart's x axis evenly spaced.
        const byDate = new Map(rawLoad.map((r) => [r.date, r]));
        const days = [];
        for (let offset = -(WINDOW_DAYS - 1); offset <= 0; offset += 1) {
          const date = isoDateOffset(today, offset);
          const row = byDate.get(date);
          days.push({
            date,
            tfi: row?.tfi ?? null,
            afi: row?.afi ?? null,
            fs: row?.form_score ?? null,
          });
        }

        // Phase band: for each day, resolve plan week via started_at + duration_weeks.
        let phases = [];
        if (plan?.started_at && plan?.duration_weeks) {
          const planStart = new Date(plan.started_at);
          const perDay = days.map((d) => {
            const dDate = new Date(`${d.date}T12:00:00Z`);
            const weeksSinceStart = Math.floor((dDate - planStart) / (7 * 86400000));
            const planWeek = Math.max(1, Math.min(plan.duration_weeks, weeksSinceStart + 1));
            return { date: d.date, phase: derivePhaseForWeek(planWeek, plan.duration_weeks) };
          });
          phases = groupPhases(perDay);
        }

        // Ride dots — one per calendar day, keep hardest session if multiple.
        const byDay = new Map();
        for (const act of rawActivities) {
          const localDate = act.start_date?.slice(0, 10);
          if (!localDate) continue;
          const workoutType = classifyWorkoutType(act.type);
          const style = WORKOUT_STYLE[workoutType] || WORKOUT_STYLE.default;
          const load = act.rss ?? act.tss ?? 0;
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
        }
        const rides = Array.from(byDay.values());

        // KPI strip uses the latest non-null row.
        const latestLoad = [...rawLoad].reverse().find((r) => r.tfi != null);
        const row28dAgo = rawLoad.find((r) => r.date <= isoDateOffset(today, -28))
          || rawLoad[0]
          || null;
        let deltaPct28d = null;
        if (latestLoad?.tfi && row28dAgo?.tfi && row28dAgo.tfi > 0) {
          deltaPct28d = ((latestLoad.tfi - row28dAgo.tfi) / row28dAgo.tfi) * 100;
        }

        setState({
          days,
          phases,
          rides,
          kpi: {
            tfi: latestLoad?.tfi ?? null,
            afi: latestLoad?.afi ?? null,
            fs: latestLoad?.form_score ?? null,
            deltaPct28d,
          },
          plan: plan ? {
            currentWeek: plan.current_week,
            totalWeeks: plan.duration_weeks,
            methodology: plan.methodology,
          } : null,
          today,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('[useTodayChart] fetch failed:', err);
          setState((s) => ({ ...s, loading: false, error: err.message || 'failed' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  return state;
}
