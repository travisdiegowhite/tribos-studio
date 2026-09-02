/**
 * Weekly Performance Evidence Engine job.
 *
 * GET  ?action=compute-weekly   (cron, Mondays 04:00 UTC — after recompute-user-tau
 *                                02:00, training-load-daily rollforward 02:30, and
 *                                fitness-snapshots 03:00)
 *   For every active user: compute the verdict for the latest COMPLETE week
 *   (Monday–Sunday) and upsert into fitness_evidence_weekly. Idempotent.
 *
 * POST { action: 'backfill', userId, fromWeek }   (cron-secret authed)
 *   Compute every week from fromWeek (a Monday, YYYY-MM-DD) through the latest
 *   complete week, sequentially so the hysteresis chain (prevVerdict) is fed
 *   from the previously computed week. Used for the founder's historical
 *   backfill and for onboarding an athlete's history.
 *
 * The math lives in api/utils/evidenceEngine.js (pure; calibrated in
 * docs/EVIDENCE_ENGINE_CALIBRATION.md). This file only binds it to cleaned
 * production data — the cleaned-inputs contract (duplicate_of IS NULL,
 * non-hidden) is hard-coded in fetchEvidenceInputs, not left to callers.
 *
 * Guardrails: reads training_load_daily, never writes it; per-athlete data
 * only; athletes with no relevant cycling activity are skipped with a logged
 * reason (no row); thin-but-present data stores an insufficient_data row
 * (the coach silence rule needs it).
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { findActiveUserIds } from './utils/trainingLoadRecompute.js';
import { computeWeekVerdict, DEFAULT_CONFIG } from './utils/evidenceEngine.js';

const supabase = getSupabaseAdmin();
const DAY = 86400000;

// Non-cycling activity types excluded from evidence signals (matches the
// calibration export in scripts/evidence-engine/export-queries.sql).
const EXCLUDED_TYPES = ['Run', 'TrailRun', 'Walk', 'Hike', 'VirtualRun'];
const EXCLUDED_SPORT_TYPES = ['running', 'trail_running', 'walking', 'hiking'];

/** Monday (UTC) of the week containing d. */
export function mondayOf(d) {
  const t = new Date(d);
  const day = t.getUTCDay(); // 0=Sun
  const back = day === 0 ? 6 : day - 1;
  const m = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back));
  return m.toISOString().slice(0, 10);
}

/** Latest COMPLETE Monday-Sunday week: the week before the one containing now. */
export function latestCompleteWeek(now = new Date()) {
  const thisMonday = mondayOf(now);
  return new Date(Date.parse(`${thisMonday}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);
}

/**
 * Fetch the engine's inputs for one athlete-week window. Exported for tests —
 * the cleaned-inputs invariant lives HERE and only here.
 *
 * lookbackDays covers the longest signal span (EF window 35d + baseline 180d)
 * plus slack; the daily model series covers the residual-reference spans.
 */
export async function fetchEvidenceInputs(client, userId, weekStart, { lookbackDays = 240 } = {}) {
  const weekEndMs = Date.parse(`${weekStart}T00:00:00Z`) + 7 * DAY;
  const fromIso = new Date(weekEndMs - lookbackDays * DAY).toISOString();
  const toIso = new Date(weekEndMs).toISOString();

  const { data: rideRows, error: ridesErr } = await client
    .from('activities')
    .select(
      'id, start_date, type, sport_type, trainer, moving_time, ' +
      'avg_w:average_watts, avg_hr:average_heartrate, ep:effective_power, ' +
      'p60:power_curve_summary->60s, p300:power_curve_summary->300s, p1200:power_curve_summary->1200s, ' +
      'ef:ride_analytics->efficiency_factor, vi:ride_analytics->variability_index'
    )
    .eq('user_id', userId)
    .is('duplicate_of', null)                       // cleaned-inputs invariant
    .or('is_hidden.is.null,is_hidden.eq.false')     // cleaned-inputs invariant
    .gte('start_date', fromIso)
    .lt('start_date', toIso)
    .not('type', 'in', `("${EXCLUDED_TYPES.join('","')}")`)
    .order('start_date', { ascending: true });
  if (ridesErr) throw new Error(`rides query: ${ridesErr.message}`);
  const rides = (rideRows || [])
    .filter((r) => !EXCLUDED_SPORT_TYPES.includes(r.sport_type || 'cycling'))
    .map((r) => ({
      ...r,
      avg_w: r.avg_w == null ? null : Math.round(Number(r.avg_w)),
      avg_hr: r.avg_hr == null ? null : Math.round(Number(r.avg_hr)),
      ep: r.ep == null ? null : Math.round(Number(r.ep)),
      p60: r.p60 == null ? null : Number(r.p60),
      p300: r.p300 == null ? null : Number(r.p300),
      p1200: r.p1200 == null ? null : Number(r.p1200),
      ef: r.ef == null ? null : Number(r.ef),
      vi: r.vi == null ? null : Number(r.vi),
    }));

  const { data: segRows, error: segErr } = await client
    .from('training_segment_rides')
    .select('seg:training_segments!inner(display_name, auto_name, distance_meters, user_id), ridden_at, dur_s:duration_seconds, w:avg_power, hr:avg_hr, activity_id')
    .eq('training_segments.user_id', userId)
    // Familiarity-only traversals carry no timing; they are not efforts and
    // must not reach the coach narrative as if they were.
    .not('duration_seconds', 'is', null)
    .gte('ridden_at', fromIso)
    .lt('ridden_at', toIso);
  if (segErr) throw new Error(`segments query: ${segErr.message}`);
  const segments = (segRows || []).map((t) => ({
    seg: t.seg?.display_name || t.seg?.auto_name || 'segment',
    dist_m: t.seg?.distance_meters == null ? null : Number(t.seg.distance_meters),
    ridden_at: t.ridden_at,
    dur_s: t.dur_s,
    w: t.w == null ? null : Math.round(Number(t.w)),
    hr: t.hr,
    activity_id: t.activity_id,
  }));

  // Daily model series — canonical-first with legacy fallback (freeze policy:
  // read-only, `canonical ?? legacy`).
  const { data: dailyRows, error: dailyErr } = await client
    .from('training_load_daily')
    .select('date, tfi, ctl, form_score, tsb')
    .eq('user_id', userId)
    .gte('date', fromIso.slice(0, 10))
    .lt('date', toIso.slice(0, 10))
    .order('date', { ascending: true });
  if (dailyErr) throw new Error(`daily query: ${dailyErr.message}`);
  const daily = (dailyRows || []).map((r) => ({
    date: r.date,
    tfi: Number(r.tfi ?? r.ctl ?? 0),
    fs: Number(r.form_score ?? r.tsb ?? 0),
  }));
  const dailyTfi = new Map(daily.map((r) => [r.date, r.tfi]));

  // Week-end model snapshot (last available day <= Sunday of the week).
  let weekModel = null;
  for (let back = 0; back < 14 && !weekModel; back++) {
    const d = new Date(weekEndMs - (1 + back) * DAY).toISOString().slice(0, 10);
    const row = daily.find((r) => r.date === d);
    if (row) weekModel = { tfi: Math.round(row.tfi), fs: Math.round(row.fs) };
  }
  const model = new Map(weekModel ? [[weekStart, weekModel]] : []);

  return { rides, segments, model, dailyTfi };
}

/** Compute one athlete-week and upsert. Returns the stored verdict row shape. */
export async function computeAndUpsertWeek(client, userId, weekStart, cfg = DEFAULT_CONFIG) {
  const inputs = await fetchEvidenceInputs(client, userId, weekStart);

  if (inputs.rides.length === 0) {
    return { skipped: true, reason: 'no cycling activities in lookback window' };
  }

  // Hysteresis chain: previous week's stored verdict.
  const prevWeek = new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);
  const { data: prevRow } = await client
    .from('fitness_evidence_weekly')
    .select('verdict')
    .eq('user_id', userId)
    .eq('week', prevWeek)
    .maybeSingle();
  const prevVerdict = prevRow && prevRow.verdict !== 'insufficient_data' ? prevRow.verdict : null;

  const v = computeWeekVerdict(inputs, weekStart, cfg, prevVerdict);

  const row = {
    user_id: userId,
    week: weekStart,
    verdict: v.verdict,
    verdict_raw: v.verdictRaw,
    score: v.score,
    confidence: v.confidence,
    signals: v.signals,
    model_divergence: v.model_divergence,
    narrative_facts: v.narrative_facts,
    engine_version: 1,
    computed_at: new Date().toISOString(),
  };
  const { error } = await client
    .from('fitness_evidence_weekly')
    .upsert(row, { onConflict: 'user_id,week' });
  if (error) throw new Error(`upsert: ${error.message}`);
  return { skipped: false, verdict: v };
}

/**
 * Above this share of failures, the run is reported as a failure.
 *
 * This job caught every error per user and returned 200 { success: true },
 * so when `fitness_evidence_weekly` turned out never to have been created,
 * the cron went green every Monday for a month while writing nothing. A
 * schema or credential fault fails 100% of users at once; one athlete with
 * unparseable data fails 1-in-60 and should stay quiet.
 */
export const FAILURE_RATE_THRESHOLD = 0.5;

/** Did enough of this run fail that it should read as broken? */
export function isRunFailed({ evaluated, errors }) {
  if (!evaluated || errors === 0) return false;
  return errors / evaluated >= FAILURE_RATE_THRESHOLD;
}

export default async function handler(req, res) {
  const auth = verifyCronAuth(req);
  if (!auth.authorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'POST' && req.body?.action === 'backfill') {
      const { userId, fromWeek } = req.body;
      if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(fromWeek || '')) {
        return res.status(400).json({ error: 'backfill requires userId and fromWeek (YYYY-MM-DD Monday)' });
      }
      const results = { computed: 0, skipped: 0, errors: 0, weeks: [] };
      const last = latestCompleteWeek();
      for (let w = mondayOf(fromWeek); w <= last; w = new Date(Date.parse(`${w}T00:00:00Z`) + 7 * DAY).toISOString().slice(0, 10)) {
        try {
          const r = await computeAndUpsertWeek(supabase, userId, w);
          if (r.skipped) results.skipped++;
          else { results.computed++; results.weeks.push({ week: w, verdict: r.verdict.verdict, confidence: r.verdict.confidence }); }
        } catch (err) {
          results.errors++;
          console.error(`evidence backfill ${userId} ${w}:`, err.message);
        }
      }
      const attempted = results.computed + results.skipped + results.errors;
      if (isRunFailed({ evaluated: attempted, errors: results.errors })) {
        console.error('evidence backfill mostly failed:', JSON.stringify(results));
        return res.status(500).json({ success: false, ...results });
      }
      return res.status(200).json({ success: true, ...results });
    }

    // Default (cron): compute the latest complete week for every active user.
    const week = latestCompleteWeek();
    const userIds = await findActiveUserIds(supabase);
    const results = { week, evaluated: userIds.length, computed: 0, skipped: 0, errors: 0 };
    for (const userId of userIds) {
      try {
        const r = await computeAndUpsertWeek(supabase, userId, week);
        if (r.skipped) {
          results.skipped++;
          console.log(`evidence-weekly skip ${userId}: ${r.reason}`);
        } else {
          results.computed++;
        }
      } catch (err) {
        results.errors++;
        console.error(`evidence-weekly ${userId}:`, err.message);
      }
    }
    if (isRunFailed(results)) {
      // Non-2xx on purpose: this is what turns the Vercel cron red. A run that
      // wrote nothing for anybody must not report success.
      console.error('evidence-weekly FAILED:', JSON.stringify(results));
      return res.status(500).json({ success: false, ...results });
    }
    if (results.errors > 0) {
      console.warn('evidence-weekly partial errors:', JSON.stringify(results));
    }
    console.log('evidence-weekly done:', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('evidence-weekly fatal:', err);
    return res.status(500).json({ error: err.message });
  }
}
