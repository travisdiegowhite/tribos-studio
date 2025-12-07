// Vercel API Route: Garmin Webhook Status
// Returns diagnostic information about webhook delivery and processing

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
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
    // Get integration status first
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('provider_user_id, sync_enabled, last_sync_at, token_expires_at, access_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    if (integrationError) {
      console.error('Error fetching integration:', integrationError);
    }

    // Get total webhook events for this user's Garmin ID
    let totalEvents = 0;
    let processedEvents = 0;
    let failedEvents = 0;
    let recentEvents = 0;
    let lastEvent = null;
    let recentEventDetails = [];

    if (integration?.provider_user_id) {
      // Get total webhook events
      const { count: total } = await supabase
        .from('garmin_webhook_events')
        .select('*', { count: 'exact', head: true })
        .eq('garmin_user_id', integration.provider_user_id);
      totalEvents = total || 0;

      // Get processed events
      const { count: processed } = await supabase
        .from('garmin_webhook_events')
        .select('*', { count: 'exact', head: true })
        .eq('garmin_user_id', integration.provider_user_id)
        .eq('processed', true);
      processedEvents = processed || 0;

      // Get failed events
      const { count: failed } = await supabase
        .from('garmin_webhook_events')
        .select('*', { count: 'exact', head: true })
        .eq('garmin_user_id', integration.provider_user_id)
        .eq('processed', true)
        .not('process_error', 'is', null);
      failedEvents = failed || 0;

      // Get last webhook received
      const { data: last } = await supabase
        .from('garmin_webhook_events')
        .select('received_at, event_type, processed, process_error')
        .eq('garmin_user_id', integration.provider_user_id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastEvent = last;

      // Get recent webhooks (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recent } = await supabase
        .from('garmin_webhook_events')
        .select('*', { count: 'exact', head: true })
        .eq('garmin_user_id', integration.provider_user_id)
        .gte('received_at', yesterday);
      recentEvents = recent || 0;

      // Get recent event details (last 10)
      const { data: details } = await supabase
        .from('garmin_webhook_events')
        .select('id, received_at, processed, process_error, activity_id, event_type, processed_at')
        .eq('garmin_user_id', integration.provider_user_id)
        .order('received_at', { ascending: false })
        .limit(10);
      recentEventDetails = details || [];
    }

    // Check token validity
    const tokenValid = integration?.token_expires_at
      ? new Date(integration.token_expires_at) > new Date()
      : false;

    return {
      webhookEndpoint: process.env.NODE_ENV === 'production'
        ? 'https://tribos-studio.vercel.app/api/garmin-webhook'
        : 'http://localhost:3000/api/garmin-webhook',
      integration: integration ? {
        garminUserId: integration.provider_user_id,
        hasGarminUserId: !!integration.provider_user_id,
        syncEnabled: integration.sync_enabled,
        lastSyncAt: integration.last_sync_at,
        tokenExpiresAt: integration.token_expires_at,
        tokenValid: tokenValid
      } : null,
      webhookStats: {
        totalEvents,
        processedEvents,
        failedEvents,
        pendingEvents: totalEvents - processedEvents,
        recentEvents24h: recentEvents
      },
      lastWebhook: lastEvent ? {
        receivedAt: lastEvent.received_at,
        eventType: lastEvent.event_type,
        processed: lastEvent.processed,
        error: lastEvent.process_error
      } : null,
      recentEvents: recentEventDetails,
      diagnostics: {
        hasIntegration: !!integration,
        hasGarminUserId: !!integration?.provider_user_id,
        tokenValid: tokenValid,
        webhookTableExists: true, // If we got here, table exists
        troubleshooting: !integration?.provider_user_id ? [
          'CRITICAL: No Garmin User ID stored. Webhooks cannot be matched to your account.',
          'Solution: Disconnect and reconnect your Garmin account to fetch the Garmin User ID.'
        ] : totalEvents === 0 ? [
          'No webhooks received yet. Possible causes:',
          '1. Webhook URL not registered in Garmin Developer Portal',
          '2. Garmin Connect app needs to sync after your ride',
          '3. Make sure webhook URL is: https://tribos-studio.vercel.app/api/garmin-webhook'
        ] : []
      }
    };

  } catch (error) {
    console.error('Error getting webhook stats:', error);
    throw error;
  }
}
