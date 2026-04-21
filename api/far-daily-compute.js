/**
 * Vercel Cron Handler: FAR Daily Compute
 *
 * Runs nightly at 05:00 UTC (after tau recompute at 02:00).
 * Computes FAR for all users who have ≥29 rows of TFI in training_load_daily.
 *
 * Also callable manually via POST /api/far-daily-compute for smoke testing.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { computeFARFromTFI } from './utils/metricsComputation.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  // Allow GET from cron scheduler, POST for manual smoke-test invocation
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();

  try {
    // Fetch distinct user IDs who have ≥29 rows in training_load_daily.
    // Using a subquery count rather than pulling all rows keeps this lean.
    const { data: users, error: usersErr } = await supabase
      .rpc('get_users_with_sufficient_tfi', { min_rows: 29 });

    if (usersErr) {
      // rpc may not exist yet — fall back to a direct query
      console.warn('[far-cron] RPC unavailable, falling back to direct query:', usersErr.message);
    }

    let userIds;

    if (users && users.length > 0) {
      userIds = users.map(u => u.user_id);
    } else {
      // Fallback: pull distinct user IDs that have ≥29 rows (last 35 days gives buffer)
      const { data: rawUsers, error: rawErr } = await supabase
        .from('training_load_daily')
        .select('user_id')
        .gte('date', new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

      if (rawErr) {
        console.error('[far-cron] Failed to fetch users:', rawErr.message);
        return res.status(500).json({ error: 'Failed to fetch user list' });
      }

      // Deduplicate
      const seen = new Set();
      userIds = (rawUsers || []).reduce((acc, r) => {
        if (!seen.has(r.user_id)) { seen.add(r.user_id); acc.push(r.user_id); }
        return acc;
      }, []);
    }

    console.log(`[far-cron] Processing FAR for ${userIds.length} users`);

    const today = new Date().toISOString().slice(0, 10);
    let computed = 0;
    let suppressed = 0;
    let errors = 0;

    // Process users sequentially to avoid hammering the connection pool
    for (const userId of userIds) {
      try {
        const result = await computeFARFromTFI(supabase, userId, today);
        if (result) computed++;
        else suppressed++;
      } catch (err) {
        errors++;
        console.error(`[far-cron] Error computing FAR for user ${userId}:`, err.message);
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`[far-cron] Done. computed=${computed} suppressed=${suppressed} errors=${errors} elapsed=${elapsed}ms`);

    return res.status(200).json({
      ok: true,
      users_processed: userIds.length,
      computed,
      suppressed,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    console.error('[far-cron] Unexpected error:', error);
    return res.status(500).json({ error: 'FAR compute failed' });
  }
}
