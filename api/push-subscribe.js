/**
 * Push Subscription Management Endpoint
 *
 * POST   — Subscribe (upsert push subscription for authenticated user)
 * DELETE — Unsubscribe (mark subscription inactive)
 *
 * Auth: Requires Bearer JWT token in Authorization header.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'DELETE', 'OPTIONS'] })) {
    return;
  }

  const supabase = getSupabaseAdmin();

  // Authenticate user via JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    if (req.method === 'POST') {
      return await handleSubscribe(supabase, user, req, res);
    } else if (req.method === 'DELETE') {
      return await handleUnsubscribe(supabase, user, req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleSubscribe(supabase, user, req, res) {
  const { endpoint, p256dh, auth } = req.body || {};

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({
      error: 'Missing required fields: endpoint, p256dh, auth',
    });
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers['user-agent'] || null,
      is_active: true,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription:', error);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  return res.status(200).json({ success: true });
}

async function handleUnsubscribe(supabase, user, req, res) {
  const { endpoint } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing required field: endpoint' });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to deactivate push subscription:', error);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }

  return res.status(200).json({ success: true });
}
