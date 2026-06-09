// Vercel API Route: Garmin webhook dead-letter queue admin (admin only)
//
// GET  — list dead-lettered events (newest first) with reason and payload
//        metadata, so every retry-exhausted activity event stays visible.
// POST — { action: 'redrive', ids: [...] } resets the listed events back into
//        the processing queue with a fresh retry budget (used after the
//        underlying cause — Garmin outage, bad deploy, expired token — is
//        fixed). The processor's normal 14d activity pickup window applies,
//        so redrive promptly; older events need their FIT URLs re-requested
//        via the recovery path instead.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { redriveEvents } from './utils/garmin/retryPolicy.js';

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
  if (setupCors(req, res, { allowedMethods: ['GET', 'POST', 'OPTIONS'] })) return;

  const { user, error: authError } = await verifyAdminAccess(req);
  if (!user) return res.status(401).json({ error: authError });

  try {
    if (req.method === 'GET') {
      return await listDeadLettered(req, res);
    }
    if (req.method === 'POST') {
      return await handleAction(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('garmin-dlq error:', err);
    return res.status(500).json({ error: 'DLQ operation failed', message: err.message });
  }
}

async function listDeadLettered(req, res) {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
  const { data, error } = await supabase
    .from('garmin_webhook_events')
    .select('id, event_type, garmin_user_id, user_id, activity_id, file_url, retry_count, dead_lettered_at, dead_letter_reason, created_at, batch_index')
    .eq('dead_lettered', true)
    .order('dead_lettered_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Tolerate migration 098 not being applied yet.
    return res.status(200).json({ success: true, available: false, reason: error.message, events: [] });
  }

  return res.status(200).json({
    success: true,
    available: true,
    count: data?.length || 0,
    events: data || [],
  });
}

async function handleAction(req, res) {
  const { action, ids } = req.body || {};

  if (action !== 'redrive') {
    return res.status(400).json({ error: `Unknown action: ${action}. Supported: redrive` });
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return res.status(400).json({ error: 'ids must be a non-empty array of up to 200 event IDs' });
  }

  const { redriven } = await redriveEvents(supabase, ids);
  console.log(`♻️ Redrove ${redriven}/${ids.length} dead-lettered Garmin events`);

  return res.status(200).json({ success: true, requested: ids.length, redriven });
}
