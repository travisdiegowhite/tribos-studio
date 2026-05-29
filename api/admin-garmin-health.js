// Vercel API Route: Garmin pipeline health dashboard data (admin only)
//
// Single GET endpoint returning the operational signals we currently have ZERO
// visibility into:
//   - file_delivery_rate: % of activity webhook events that include the FIT
//     callbackURL (i.e. ACTIVITY_FILE_DATA pings). Empirically ~25-30%.
//   - stuck_events: webhook events past the retry budget without an imported
//     activity row.
//   - reconciliation_backlog: activities flagged summary_only or needs_resync
//     waiting for the future reconcile cron to either complete them or give
//     up on them.
//   - per_user_last_complete: when each connected Garmin user last received a
//     complete (streams+power-where-applicable) activity.
//
// Tolerant of the Phase 1 migration (093) not being applied yet — completeness
// blocks return {available:false, reason} instead of 500'ing.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

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

    const [delivery, stuck, backlog, perUser] = await Promise.all([
      getFileDeliveryRate(since),
      getStuckEventCount(),
      getReconciliationBacklog(),
      getPerUserLastComplete(),
    ]);

    return res.status(200).json({
      success: true,
      windowDays,
      since,
      fileDelivery: delivery,
      stuckEvents: stuck,
      reconciliationBacklog: backlog,
      perUserLastComplete: perUser,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('garmin-health error:', err);
    return res.status(500).json({ error: 'Failed to compute garmin health', message: err.message });
  }
}

async function getFileDeliveryRate(since) {
  // % of activity-related webhook events that came with a FIT callbackURL.
  // CONNECT_ACTIVITY and ACTIVITY_DETAIL are summaries; ACTIVITY_FILE_DATA is
  // the only event type guaranteed to carry the FIT URL.
  const types = ['CONNECT_ACTIVITY', 'ACTIVITY_DETAIL', 'ACTIVITY_FILE_DATA'];
  const { data, error } = await supabase
    .from('garmin_webhook_events')
    .select('event_type, file_url')
    .in('event_type', types)
    .gte('created_at', since)
    .limit(10000);
  if (error) return { available: false, reason: error.message };

  const buckets = {};
  let withFitPing = 0;
  let totalActivities = 0;
  const activityIds = new Set();

  for (const row of data || []) {
    buckets[row.event_type] = (buckets[row.event_type] || 0) + 1;
  }

  // Re-query for ACTIVITY_FILE_DATA-per-activity rate (file delivery as a
  // ratio of activities, not raw events): count distinct activities that
  // received at least one ACTIVITY_FILE_DATA in the window vs distinct
  // activities seen at all.
  const { data: activityRows } = await supabase
    .from('garmin_webhook_events')
    .select('activity_id, event_type')
    .in('event_type', types)
    .gte('created_at', since)
    .limit(10000);

  if (activityRows) {
    const seen = new Map();
    for (const row of activityRows) {
      if (!row.activity_id) continue;
      const had = seen.get(row.activity_id) || new Set();
      had.add(row.event_type);
      seen.set(row.activity_id, had);
    }
    totalActivities = seen.size;
    for (const had of seen.values()) {
      if (had.has('ACTIVITY_FILE_DATA')) withFitPing++;
    }
  }

  return {
    eventCountsByType: buckets,
    activitiesSeen: totalActivities,
    activitiesWithFitPing: withFitPing,
    rate: totalActivities > 0 ? +(withFitPing / totalActivities).toFixed(3) : null,
  };
}

async function getStuckEventCount() {
  // Events marked processed=true but with a process_error indicating give-up
  // (max retries / unrecoverable). This is the "lost forever" bucket.
  const { count, error } = await supabase
    .from('garmin_webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('processed', true)
    .is('activity_imported_id', null)
    .not('process_error', 'is', null);
  if (error) return { available: false, reason: error.message };
  return { processedWithError: count || 0 };
}

async function getReconciliationBacklog() {
  // Activities flagged as needing more data, broken down by status. Tolerant
  // of the migration not being applied yet.
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('data_completeness')
      .eq('provider', 'garmin')
      .not('data_completeness', 'is', null);
    if (error) return { available: false, reason: error.message };
    const counts = { summary_only: 0, full: 0, needs_resync: 0, unrecoverable: 0 };
    for (const row of data || []) counts[row.data_completeness] = (counts[row.data_completeness] || 0) + 1;
    return { available: true, counts };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

async function getPerUserLastComplete() {
  // For each connected Garmin integration, when did they last receive a
  // 'full' activity? Helps spot users whose pipeline has silently stalled.
  try {
    const { data: integrations, error: intErr } = await supabase
      .from('bike_computer_integrations')
      .select('user_id, status, last_sync_at')
      .eq('provider', 'garmin');
    if (intErr) return { available: false, reason: intErr.message };

    const rows = [];
    for (const integ of integrations || []) {
      let lastCompleteAt = null;
      try {
        const { data: act } = await supabase
          .from('activities')
          .select('start_date')
          .eq('user_id', integ.user_id)
          .eq('provider', 'garmin')
          .eq('data_completeness', 'full')
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        lastCompleteAt = act?.start_date || null;
      } catch (_) {
        // data_completeness column may not exist yet; leave null.
      }
      rows.push({
        userId: integ.user_id,
        status: integ.status,
        lastSyncAt: integ.last_sync_at,
        lastCompleteActivityAt: lastCompleteAt,
      });
    }
    return { available: true, users: rows };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}
