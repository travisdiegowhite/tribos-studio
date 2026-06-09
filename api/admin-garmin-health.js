// Vercel API Route: Garmin pipeline health dashboard data (admin only)
//
// Single GET endpoint returning the pipeline's operational signals. All
// metric computation lives in api/utils/garmin/healthMetrics.js — shared with
// the hourly garmin-health-monitor cron so the dashboard and the alerts can
// never disagree about the numbers.
//
// Response blocks:
//   - sli / breaches: the current snapshot exactly as the monitor cron sees it
//   - fileDelivery, stuckEvents, reconciliationBacklog, perUserLastComplete:
//     original dashboard blocks (back-compat shape)
//   - sloHistory: recent rows from garmin_health_snapshots for trend charts
//
// Tolerant of migrations (093/098) not being applied yet — blocks return
// {available:false, reason} instead of 500'ing.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import {
  computeHealthSnapshot,
  getFileDeliveryRate,
  getPerUserLastComplete,
} from './utils/garmin/healthMetrics.js';

const supabase = getSupabaseAdmin();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'travis@tribos.studio';

async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, error: 'Invalid or expired token' };
  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { user: null, error: 'Unauthorized - admin access denied' };
  }
  return { user, error: null };
}

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['GET', 'OPTIONS'] })) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user, error: authError } = await verifyAdminAccess(req);
  if (!user) return res.status(401).json({ error: authError });

  try {
    const windowDays = Math.max(1, Math.min(90, parseInt(req.query.windowDays, 10) || 30));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const [snapshot, windowDelivery, perUser, sloHistory] = await Promise.all([
      computeHealthSnapshot(supabase),
      getFileDeliveryRate(supabase, since),
      getPerUserLastComplete(supabase),
      getSloHistory(),
    ]);

    return res.status(200).json({
      success: true,
      windowDays,
      since,
      sli: snapshot.sli,
      breaches: snapshot.breaches,
      // Back-compat blocks (windowDays-scoped delivery, as before)
      fileDelivery: windowDelivery,
      stuckEvents: snapshot.detail.stuckEvents,
      reconciliationBacklog: snapshot.detail.reconciliationBacklog,
      perUserLastComplete: perUser,
      // New blocks
      deadLetter: snapshot.detail.deadLetter,
      queueLag: snapshot.detail.queueLag,
      tokenHealth: snapshot.detail.tokenHealth,
      slo: snapshot.detail.slo,
      sloHistory,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('garmin-health error:', err);
    return res.status(500).json({ error: 'Failed to compute garmin health', message: err.message });
  }
}

async function getSloHistory() {
  // Last 30 days of hourly snapshots, downsampled client-side if needed.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('garmin_health_snapshots')
    .select('created_at, file_delivery_rate, slo_full_within_24h, queue_lag_seconds, dead_lettered_24h, dead_lettered_open, unmatched_webhooks_24h, invalid_token_integrations, summary_only_backlog, breaches')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return { available: false, reason: error.message };
  return { available: true, snapshots: data || [] };
}
