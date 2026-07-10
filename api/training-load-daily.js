/**
 * API Route: Training Load Daily — population + preview
 *
 * The population half of docs/tfi-duality-decision.md option (a).
 *
 * Endpoints:
 * - GET  /api/training-load-daily?action=rollforward   Nightly cron: recompute
 *   the trailing 180 days for every user with recent activity, writing
 *   training_load_daily through yesterday (user-local). The FIRST run doubles
 *   as the historical backfill — no separate mechanism.
 * - POST /api/training-load-daily {action:'recompute'}  Authed self-service
 *   recompute for the calling user (e.g. right after a bulk import).
 * - POST /api/training-load-daily {action:'preview'}    Authed dry-run for the
 *   calling user: returns the would-be server numbers next to the
 *   client-style numbers (fixed 42/7, no terrain/MTB, 90-day cold start) so
 *   the displayed-number jump is quantified before/after enabling — the
 *   check docs/tfi-duality-decision.md §5.1 asked for.
 *
 * Cron cadence: daily at 02:30 UTC — after recompute-user-tau (02:00) so the
 * walk uses fresh adaptive tau, before database-cleanup (03:00).
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import {
  recomputeTrainingLoadForUser,
  computeTrainingLoadRows,
  findActiveUserIds,
} from './utils/trainingLoadRecompute.js';

const supabase = getSupabaseAdmin();

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  const action = req.query.action || req.body?.action;

  // Vercel cron (GET) — same unauthenticated-GET convention as
  // /api/fitness-snapshots?action=compute-weekly. Returns counts only.
  if (req.method === 'GET' && action === 'rollforward') {
    return handleRollforward(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (action) {
    case 'recompute':
      return handleRecompute(req, res, authUser);
    case 'preview':
      return handlePreview(req, res, authUser);
    default:
      return res.status(400).json({ error: 'Invalid action. Use: recompute or preview' });
  }
}

async function handleRollforward(req, res) {
  const started = Date.now();
  try {
    const userIds = await findActiveUserIds(supabase);
    let usersProcessed = 0;
    let rowsWritten = 0;
    const failures = [];

    for (const userId of userIds) {
      try {
        const result = await recomputeTrainingLoadForUser(supabase, userId);
        usersProcessed++;
        rowsWritten += result.rowsWritten;
      } catch (err) {
        console.error(`training-load rollforward failed for ${userId}:`, err.message);
        failures.push(userId);
      }
    }

    console.log(
      `training-load rollforward: ${usersProcessed}/${userIds.length} users, ` +
        `${rowsWritten} rows, ${failures.length} failures, ${Date.now() - started}ms`,
    );
    return res.json({
      success: failures.length === 0,
      usersProcessed,
      usersTotal: userIds.length,
      rowsWritten,
      failures: failures.length,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    console.error('training-load rollforward error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleRecompute(req, res, authUser) {
  try {
    const result = await recomputeTrainingLoadForUser(supabase, authUser.id);
    return res.json({
      success: true,
      rowsWritten: result.rowsWritten,
      lastDay: result.lastDay
        ? {
            date: result.lastDay.date,
            tfi: result.lastDay.tfi,
            afi: result.lastDay.afi,
            form_score: result.lastDay.form_score,
          }
        : null,
    });
  } catch (error) {
    console.error('training-load recompute error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handlePreview(req, res, authUser) {
  try {
    const { rows, profile } = await computeTrainingLoadRows(supabase, authUser.id);
    const server = rows.length > 0 ? rows[rows.length - 1] : null;

    // Client-style comparison: the exact estimator + walk the UI falls back
    // to today (estimateActivityTSS — no terrain/MTB; fixed tau 42/7;
    // 90-day cold start). Same dynamic-import-from-src pattern as
    // api/process-deviation.js.
    const { estimateActivityTSS } = await import('../src/utils/computeFitnessSnapshots.ts');
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data: activities } = await supabase
      .from('activities')
      .select(
        'start_date, type, sport_type, moving_time, distance, ' +
          'total_elevation_gain, average_watts, average_heartrate, ' +
          'kilojoules, rss, tss, effective_power, normalized_power',
      )
      .eq('user_id', authUser.id)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', since.toISOString())
      .order('start_date', { ascending: true });

    const dailyRSS = {};
    for (const a of activities ?? []) {
      const key = a.start_date?.split('T')[0];
      if (!key) continue;
      dailyRSS[key] = (dailyRSS[key] || 0) + Math.min(estimateActivityTSS(a, profile.ftp), 500);
    }
    let ctl = 0;
    let atl = 0;
    for (const key of Object.keys(dailyRSS).sort()) {
      const rss = dailyRSS[key];
      ctl = ctl + (rss - ctl) / 42;
      atl = atl + (rss - atl) / 7;
    }

    const clientTfi = Math.round(ctl * 100) / 100;
    return res.json({
      server: server
        ? { date: server.date, tfi: server.tfi, afi: server.afi, form_score: server.form_score }
        : null,
      clientStyle: { tfi: clientTfi, atl: Math.round(atl * 100) / 100 },
      deltaTfi: server ? Math.round((server.tfi - clientTfi) * 100) / 100 : null,
      deltaTfiPct:
        server && clientTfi > 0
          ? Math.round(((server.tfi - clientTfi) / clientTfi) * 1000) / 10
          : null,
      tau: { tfi: profile.tfiTau, afi: profile.afiTau },
    });
  } catch (error) {
    console.error('training-load preview error:', error);
    return res.status(500).json({ error: error.message });
  }
}
