import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { estimateActivityTSS } from '../utils/computeFitnessSnapshots';

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
// Extra days of activity history to feed the EWA before the visible window
// so TFI has time to converge for riders without training_load_daily rows.
const WARMUP_DAYS = 90;

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

/**
 * Classify an activity into the spec §3.5 workout-type buckets. Runs three
 * tiers of signal so "Ride" / "VirtualRide" (Strava's default types) don't
 * collapse every session to endurance-green:
 *
 *   1. Activity name keywords — riders name their sessions "Tempo 3x15",
 *      "VO2max intervals", "recovery spin", etc. Strong signal when present.
 *   2. Ride intensity (effective_power / ftp or average_watts / ftp). Maps
 *      to training zones: <0.55 recovery, <0.75 endurance, <0.90 tempo,
 *      <0.95 sweet_spot, <1.05 threshold, <1.20 vo2, ≥1.20 anaerobic.
 *   3. Duration fallback — <30 min → recovery, >3 hours → long_ride.
 */
function classifyWorkoutType(activity, ftp) {
  const name = (activity?.name || '').toLowerCase();
  const type = (activity?.type || '').toLowerCase();

  // Tier 1: name keywords (most specific)
  if (/\brace\b/.test(name) || /\brace\b/.test(type)) return 'race';
  if (/vo[\s_-]?2/.test(name)) return 'vo2';
  if (/anaerobic|sprint|neuromuscular/.test(name)) return 'anaerobic';
  if (/threshold|\bftp\b/.test(name)) return 'threshold';
  if (/sweet[\s_-]?spot/.test(name)) return 'sweet_spot';
  if (/tempo/.test(name)) return 'tempo';
  if (/recovery|easy|\brecov\b/.test(name)) return 'recovery';
  if (/long\b/.test(name)) return 'long_ride';

  // Tier 2: intensity from power + FTP
  const power = activity?.effective_power
    ?? activity?.normalized_power
    ?? activity?.average_watts
    ?? null;
  if (ftp && ftp > 0 && power && power > 0) {
    const ri = power / ftp;
    if (ri < 0.55) return 'recovery';
    if (ri < 0.75) return 'endurance';
    if (ri < 0.90) return 'tempo';
    if (ri < 0.95) return 'sweet_spot';
    if (ri < 1.05) return 'threshold';
    if (ri < 1.20) return 'vo2';
    return 'anaerobic';
  }

  // Tier 3: duration-based fallback
  const minutes = (activity?.moving_time || 0) / 60;
  if (minutes > 180) return 'long_ride';
  if (minutes > 0 && minutes < 30) return 'recovery';

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

export default function useTodayChart(userId, opts = {}) {
  const externalActivities = opts.activities;
  const externalFtp = opts.userFtp;

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
        // Extra 90-day lead-in so the EWA-based fallback has time to
        // converge before the visible window starts.
        const warmupDate = isoDateOffset(today, -(WINDOW_DAYS - 1 + WARMUP_DAYS));

        // When Dashboard hands us its already-fetched activities + FTP, skip
        // the duplicate fetches — keeps the chart in lockstep with StatusBar
        // and avoids subtle column-mismatch bugs (Dashboard uses .select('*'),
        // a narrower select here can starve estimateActivityTSS of inputs).
        const promises = [
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
        ];

        // Treat an empty external array as "not yet loaded" — Dashboard
        // initialises activities to [] and populates async, so if we
        // trusted the empty array we'd render zeros. Require a non-empty
        // array or a non-null FTP to skip the self-fetch.
        const useExternalActivities = Array.isArray(externalActivities) && externalActivities.length > 0;
        if (!useExternalActivities) {
          promises.push(
            supabase
              .from('activities')
              .select('id, start_date, type, rss, tss, distance, moving_time, total_elevation_gain, average_watts, normalized_power, effective_power, kilojoules')
              .eq('user_id', userId)
              .is('duplicate_of', null)
              .gte('start_date', `${warmupDate}T00:00:00Z`)
              .lte('start_date', `${today}T23:59:59Z`)
              .order('start_date', { ascending: true }),
          );
        }
        if (externalFtp == null) {
          promises.push(
            supabase
              .from('user_profiles')
              .select('ftp')
              .eq('id', userId)
              .maybeSingle(),
          );
        }

        const results = await Promise.all(promises);
        if (cancelled) return;

        const loadResult = results[0];
        const planResult = results[1];
        let cursor = 2;
        const activitiesResult = useExternalActivities ? null : results[cursor++];
        const profileResult = externalFtp != null ? null : results[cursor++];

        const rawLoad = loadResult.data || [];
        const plan = planResult.data || null;
        const rawActivities = useExternalActivities
          ? externalActivities
          : (activitiesResult?.data || []);
        const userFtp = externalFtp ?? profileResult?.data?.ftp ?? 200;

        // --- Activity-derived daily RSS series over the full warm-up span ---
        // Used to back-fill any day without a training_load_daily row so the
        // chart renders for riders whose canonical load table is sparse.
        const totalSpan = WINDOW_DAYS + WARMUP_DAYS;
        const dailyRss = new Array(totalSpan).fill(0);
        const dailyDates = new Array(totalSpan);
        for (let i = 0; i < totalSpan; i += 1) {
          dailyDates[i] = isoDateOffset(today, -(totalSpan - 1 - i));
        }
        const dateIndex = new Map(dailyDates.map((d, i) => [d, i]));

        for (const act of rawActivities) {
          const date = act.start_date?.slice(0, 10);
          if (!date) continue;
          const idx = dateIndex.get(date);
          if (idx == null) continue;
          const rss = act.rss ?? act.tss ?? estimateActivityTSS(act, userFtp);
          if (!rss) continue;
          // Cap per-activity at 500 to match Dashboard's trainingMetrics guard.
          dailyRss[idx] += Math.min(rss, 500);
        }

        // Diagnostic: surface enough state in console to triage when the
        // chart looks unexpectedly empty. Cheap to log, easy to ignore.
        const totalRss = dailyRss.reduce((a, b) => a + b, 0);
        if (rawActivities.length > 0 && totalRss === 0) {
          console.warn('[useTodayChart] activities returned but daily RSS = 0',
            { activityCount: rawActivities.length, sample: rawActivities[0] });
        } else if (rawActivities.length === 0) {
          console.warn('[useTodayChart] zero activities returned for window',
            { startDate, today, externalActivitiesProvided: !!externalActivities });
        }

        // Iterative EWA — exposes daily TFI and AFI at each step.
        const computedTfi = new Array(totalSpan).fill(0);
        const computedAfi = new Array(totalSpan).fill(0);
        let tfi = 0;
        let afi = 0;
        for (let i = 0; i < totalSpan; i += 1) {
          tfi = tfi + (dailyRss[i] - tfi) / 42;
          afi = afi + (dailyRss[i] - afi) / 7;
          computedTfi[i] = tfi;
          computedAfi[i] = afi;
        }

        // FS (form score) = yesterday's TFI − yesterday's AFI (spec §3.6).
        const computedFs = new Array(totalSpan).fill(0);
        for (let i = 0; i < totalSpan; i += 1) {
          if (i === 0) {
            computedFs[i] = 0;
          } else {
            computedFs[i] = computedTfi[i - 1] - computedAfi[i - 1];
          }
        }

        // Canonical values from training_load_daily win when present; the
        // activity-derived values fill the gaps.
        const byDate = new Map(rawLoad.map((r) => [r.date, r]));
        const days = [];
        const windowStartIdx = WARMUP_DAYS; // first index of the visible window
        for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
          const globalIdx = windowStartIdx + offset;
          const date = dailyDates[globalIdx];
          const canonical = byDate.get(date);
          const tfiVal = canonical?.tfi ?? Math.round(computedTfi[globalIdx]);
          const afiVal = canonical?.afi ?? Math.round(computedAfi[globalIdx]);
          const fsVal = canonical?.form_score ?? Math.round(computedFs[globalIdx]);
          days.push({
            date,
            tfi: tfiVal,
            afi: afiVal,
            fs: fsVal,
            source: canonical ? 'canonical' : 'computed',
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
          // Only plot rides that fall inside the visible window.
          const globalIdx = dateIndex.get(localDate);
          if (globalIdx == null || globalIdx < windowStartIdx) continue;
          const workoutType = classifyWorkoutType(act, userFtp);
          const style = WORKOUT_STYLE[workoutType] || WORKOUT_STYLE.default;
          const load = act.rss ?? act.tss ?? estimateActivityTSS(act, userFtp) ?? 0;
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

        // KPI strip — latest day in the visible window. Prefers canonical
        // values where present, falls back to the computed series.
        const lastDay = days[days.length - 1];
        const dayIdx28 = Math.max(0, days.length - 29);
        const day28 = days[dayIdx28];
        let deltaPct28d = null;
        if (lastDay?.tfi && day28?.tfi && day28.tfi > 0) {
          deltaPct28d = ((lastDay.tfi - day28.tfi) / day28.tfi) * 100;
        }

        setState({
          days,
          phases,
          rides,
          kpi: {
            tfi: lastDay?.tfi ?? null,
            afi: lastDay?.afi ?? null,
            fs: lastDay?.fs ?? null,
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
    // Depend on the length + first id so the hook recomputes when Dashboard
    // finishes loading activities and when FTP arrives. Using the array
    // reference directly would re-run on every Dashboard render.
  }, [userId, externalActivities?.length, externalActivities?.[0]?.id, externalFtp]);

  return state;
}
