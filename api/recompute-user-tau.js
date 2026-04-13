/**
 * API Route: Recompute Adaptive EWA Time Constants
 *
 * Endpoints:
 *  - GET  /api/recompute-user-tau?action=recompute-all
 *      Nightly Vercel cron: iterate users with metrics_age set and derive
 *      fresh ewa_long_tau / ewa_short_tau values.
 *  - POST /api/recompute-user-tau?action=recompute-current
 *      Authenticated user trigger (e.g. immediately after saving their
 *      age in Settings) to refresh just their own tau values.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { recomputeUserTauConstants } from './utils/adaptiveTau.js';

const supabase = getSupabaseAdmin();

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  const action = req.query.action || req.body?.action;

  if (req.method === 'GET' && action === 'recompute-all') {
    return handleRecomputeAll(req, res);
  }

  if (req.method === 'POST' && action === 'recompute-current') {
    return handleRecomputeCurrent(req, res);
  }

  return res.status(400).json({
    error: 'Invalid action. Use: recompute-all (GET, cron) or recompute-current (POST, user).'
  });
}

/**
 * Cron: refresh tau for every user who has opted into adaptive windows
 * (i.e. metrics_age IS NOT NULL).
 */
async function handleRecomputeAll(req, res) {
  if (!verifyCronAuth(req).authorized) {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('id')
      .not('metrics_age', 'is', null);

    if (error) throw error;

    const userIds = (users || []).map((u) => u.id);
    console.log(`Adaptive-tau cron: ${userIds.length} users to process`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorSamples = [];

    for (const userId of userIds) {
      try {
        const result = await recomputeUserTauConstants(supabase, userId);
        if (result.skipped) {
          skipped++;
        } else {
          processed++;
        }
      } catch (err) {
        errors++;
        if (errorSamples.length < 5) {
          errorSamples.push({ userId, message: err.message });
        }
        console.error(`Adaptive-tau failed for ${userId}:`, err.message);
      }
    }

    console.log(
      `Adaptive-tau cron complete: processed=${processed}, skipped=${skipped}, errors=${errors}`
    );

    return res.json({
      success: true,
      processed,
      skipped,
      errors,
      errorSamples,
    });
  } catch (error) {
    console.error('Adaptive-tau cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * User-triggered single-user refresh (e.g. after saving age in Settings).
 */
async function handleRecomputeCurrent(req, res) {
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await recomputeUserTauConstants(supabase, authUser.id);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('Recompute current tau error:', error);
    return res.status(500).json({ error: error.message });
  }
}
