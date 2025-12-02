// Vercel API Route: Garmin Webhook Status
// Returns diagnostic information about webhook delivery and processing

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

export default async function handler(req, res) {
  // CORS handling
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user ID from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get webhook statistics
    const stats = await getWebhookStats(user.id);

    return res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook status error:', error);
    return res.status(500).json({
      error: 'Failed to get webhook status',
      message: error.message
    });
  }
}

async function getWebhookStats(userId) {
  try {
    // Get total webhook events
    const { count: totalEvents } = await supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get processed events
    const { count: processedEvents } = await supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('processed', true);

    // Get failed events
    const { count: failedEvents } = await supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('processed', true)
      .not('process_error', 'is', null);

    // Get last webhook received
    const { data: lastEvent } = await supabase
      .from('garmin_webhook_events')
      .select('received_at, event_type, processed, process_error')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(1)
      .single();

    // Get recent webhooks (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentEvents } = await supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('received_at', yesterday);

    // Get integration status
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('provider_user_id, sync_enabled, last_sync_at, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    // Get recent event details (last 10)
    const { data: recentEventDetails } = await supabase
      .from('garmin_webhook_events')
      .select('id, received_at, processed, process_error, activity_id, event_type, processed_at')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(10);

    return {
      webhookEndpoint: 'https://www.tribos.studio/api/garmin-webhook',
      totalEvents: totalEvents || 0,
      processedEvents: processedEvents || 0,
      failedEvents: failedEvents || 0,
      pendingEvents: (totalEvents || 0) - (processedEvents || 0),
      recentEvents24h: recentEvents || 0,
      lastWebhook: lastEvent ? {
        receivedAt: lastEvent.received_at,
        eventType: lastEvent.event_type,
        processed: lastEvent.processed,
        error: lastEvent.process_error
      } : null,
      integration: integration ? {
        garminUserId: integration.provider_user_id,
        syncEnabled: integration.sync_enabled,
        lastSyncAt: integration.last_sync_at,
        tokenExpiresAt: integration.token_expires_at
      } : null,
      recentEvents: recentEventDetails || []
    };

  } catch (error) {
    console.error('Error getting webhook stats:', error);
    throw error;
  }
}
