// Vercel API Route: Garmin Webhook Status
// Returns diagnostic information about webhook delivery, processing, and connection health
// Use this endpoint to debug connection issues

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Garmin token endpoint for health checks
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

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
      console.error('Auth error in webhook-status:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('Webhook status - checking for user:', user.id);

    // Get webhook statistics
    const stats = await getWebhookStats(user.id);

    return res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
      debug: {
        userId: user.id,
        userEmail: user.email
      }
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
      .select('id, provider_user_id, sync_enabled, last_sync_at, token_expires_at, access_token, updated_at, sync_error, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    if (integrationError) {
      console.error('Error fetching integration:', integrationError);
    }

    console.log('Webhook status - integration query result for user', userId, ':', {
      found: !!integration,
      provider_user_id: integration?.provider_user_id,
      sync_enabled: integration?.sync_enabled
    });

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

      // Get failed events (processed but with errors)
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

    // Check token validity and calculate time until expiration
    const now = new Date();
    const tokenExpiresAt = integration?.token_expires_at ? new Date(integration.token_expires_at) : null;
    const tokenValid = tokenExpiresAt ? tokenExpiresAt > now : false;
    const tokenExpiresInDays = tokenExpiresAt ? Math.floor((tokenExpiresAt - now) / (1000 * 60 * 60 * 24)) : null;
    const tokenExpiresInHours = tokenExpiresAt ? Math.floor((tokenExpiresAt - now) / (1000 * 60 * 60)) : null;

    // Build troubleshooting messages based on current state
    const troubleshooting = [];

    if (!integration) {
      troubleshooting.push('❌ No Garmin integration found. Please connect your Garmin account.');
    } else if (!integration.provider_user_id) {
      troubleshooting.push('⚠️ CRITICAL: No Garmin User ID stored. Webhooks cannot be matched to your account.');
      troubleshooting.push('Solution: Disconnect and reconnect your Garmin account to fetch the Garmin User ID.');
    } else if (!tokenValid) {
      troubleshooting.push('⚠️ Access token has expired. Activities may not sync.');
      if (integration.sync_error) {
        troubleshooting.push(`❌ Last refresh error: ${integration.sync_error}`);
        troubleshooting.push('The refresh token may have expired or been revoked.');
        troubleshooting.push('👉 Solution: Disconnect and reconnect your Garmin account to get new tokens.');
      } else if (!integration.refresh_token) {
        troubleshooting.push('❌ No refresh token available. Cannot auto-refresh.');
        troubleshooting.push('👉 Solution: Disconnect and reconnect your Garmin account.');
      } else {
        troubleshooting.push('The system will attempt to refresh the token automatically on next webhook.');
        troubleshooting.push('If issues persist, try disconnecting and reconnecting your Garmin account.');
      }
    } else if (tokenExpiresInDays !== null && tokenExpiresInDays < 7) {
      troubleshooting.push(`⚠️ Token expires in ${tokenExpiresInDays} days. It will be refreshed automatically.`);
    }

    if (totalEvents === 0 && integration?.provider_user_id) {
      troubleshooting.push('ℹ️ No webhooks received yet. Possible causes:');
      troubleshooting.push('   1. Webhook URL not registered in Garmin Developer Portal');
      troubleshooting.push('   2. No activities synced since connecting');
      troubleshooting.push('   3. Complete an activity and sync Garmin Connect to trigger a webhook');
    }

    if (failedEvents > 0) {
      troubleshooting.push(`⚠️ ${failedEvents} webhook(s) failed to process. Check recent events for details.`);
    }

    return {
      webhookEndpoint: process.env.NODE_ENV === 'production'
        ? 'https://www.tribos.studio/api/garmin-webhook'
        : 'http://localhost:3000/api/garmin-webhook',
      connectionHealth: {
        status: !integration ? 'not_connected' :
                !integration.provider_user_id ? 'missing_user_id' :
                (!tokenValid && integration.sync_error) ? 'token_refresh_failed' :
                (!tokenValid && !integration.refresh_token) ? 'missing_refresh_token' :
                !tokenValid ? 'token_expired' :
                'healthy',
        statusEmoji: !integration ? '❌' :
                     !integration.provider_user_id ? '⚠️' :
                     (!tokenValid && (integration.sync_error || !integration.refresh_token)) ? '❌' :
                     !tokenValid ? '🔄' : '✅',
        message: !integration ? 'Not connected to Garmin' :
                 !integration.provider_user_id ? 'Missing Garmin User ID - reconnect required' :
                 (!tokenValid && integration.sync_error) ? 'Token refresh failed - reconnect required' :
                 (!tokenValid && !integration.refresh_token) ? 'No refresh token - reconnect required' :
                 !tokenValid ? 'Token expired - will refresh on next sync' :
                 'Connected and healthy',
        syncError: integration?.sync_error || null
      },
      integration: integration ? {
        garminUserId: integration.provider_user_id,
        hasGarminUserId: !!integration.provider_user_id,
        syncEnabled: integration.sync_enabled,
        lastSyncAt: integration.last_sync_at,
        lastUpdatedAt: integration.updated_at,
        tokenExpiresAt: integration.token_expires_at,
        tokenValid: tokenValid,
        tokenExpiresIn: tokenExpiresInHours !== null
          ? (tokenExpiresInHours < 0 ? 'Expired' :
             tokenExpiresInDays > 0 ? `${tokenExpiresInDays} days` :
             `${tokenExpiresInHours} hours`)
          : 'Unknown',
        hasRefreshToken: !!integration.refresh_token,
        syncError: integration.sync_error || null
      } : null,
      webhookStats: {
        totalEvents,
        processedEvents,
        successfulEvents: processedEvents - failedEvents,
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
      recentEvents: recentEventDetails.map(e => ({
        ...e,
        statusEmoji: e.processed && !e.process_error ? '✅' :
                     e.processed && e.process_error ? '❌' : '⏳'
      })),
      troubleshooting: troubleshooting.length > 0 ? troubleshooting : ['✅ No issues detected']
    };

  } catch (error) {
    console.error('Error getting webhook stats:', error);
    throw error;
  }
}
