// Vercel API Route: Secure Strava Authentication
// Handles token exchange and storage server-side

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
import { completeActivationStep } from './utils/activation.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for server operations
);

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const rateLimitResult = await rateLimitMiddleware(
    req,
    res,
    RATE_LIMITS.STRAVA_AUTH.name,
    RATE_LIMITS.STRAVA_AUTH.limit,
    RATE_LIMITS.STRAVA_AUTH.windowMinutes
  );

  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, code, userId } = req.body;

    // Validate required environment variables
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Strava credentials not configured' });
    }

    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(req, res, code, userId);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, userId);

      case 'disconnect':
        return await disconnect(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Strava auth error:', error);

    return res.status(500).json({
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function exchangeCodeForToken(req, res, code, userId) {
  if (!code || !userId) {
    return res.status(400).json({ error: 'Code and userId required' });
  }

  try {
    console.log('🔄 Exchanging Strava code for tokens...');

    // Exchange code with Strava
    const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Strava token exchange failed:', error);
      throw new Error(`Strava token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    console.log('✅ Strava tokens received');

    // Calculate expiration
    const expiresAt = new Date(tokenData.expires_at * 1000).toISOString();

    console.log('📝 Storing Strava integration in database...', {
      userId,
      athleteId: tokenData.athlete.id,
      athleteUsername: tokenData.athlete.username,
      expiresAt
    });

    // Store tokens in bike_computer_integrations table
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'strava',
        provider_user_id: tokenData.athlete.id.toString(),
        provider_user_data: {
          username: tokenData.athlete.username,
          firstname: tokenData.athlete.firstname,
          lastname: tokenData.athlete.lastname,
          profile: tokenData.athlete.profile,
          scopes: ['read', 'activity:read_all', 'profile:read_all']
        },
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        sync_enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error storing tokens:', dbError.message || dbError.code);
      throw new Error(`Failed to store authentication data: ${dbError.message || dbError.code || 'Unknown error'}`);
    }

    console.log('✅ Strava integration stored successfully');

    // Track activation step
    await completeActivationStep(supabase, userId, 'connect_device').catch(() => {});

    // Return success without exposing tokens
    return res.status(200).json({
      success: true,
      athlete: {
        id: tokenData.athlete.id,
        username: tokenData.athlete.username,
        firstname: tokenData.athlete.firstname,
        lastname: tokenData.athlete.lastname,
        profile: tokenData.athlete.profile
      }
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

async function getConnectionStatus(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('provider_user_id, provider_user_data, token_expires_at, updated_at, sync_enabled')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .maybeSingle();

    if (error) {
      console.error('Error fetching integration:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!integration) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is still valid (with 5 minute buffer)
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const isExpired = (expiresAt.getTime() - 300000) < now.getTime();

    return res.status(200).json({
      connected: true,
      isExpired,
      username: integration.provider_user_data?.username ||
                `${integration.provider_user_data?.firstname} ${integration.provider_user_data?.lastname}`,
      userId: integration.provider_user_id,
      syncEnabled: integration.sync_enabled,
      lastUpdated: integration.updated_at
    });

  } catch (error) {
    console.error('Get connection status error:', error);
    throw error;
  }
}

async function disconnect(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // First, get the access token for deauthorization
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching integration for deauth:', fetchError);
    }

    // Call Strava deauthorize endpoint (required by Strava API Agreement)
    // This revokes the access token on Strava's side
    if (integration?.access_token) {
      try {
        // Check if token needs refresh before deauthorizing
        let accessToken = integration.access_token;
        const expiresAt = new Date(integration.token_expires_at);
        const now = new Date();

        if (expiresAt.getTime() < now.getTime() && integration.refresh_token) {
          // Token expired, refresh it first
          console.log('🔄 Refreshing expired token before deauthorization...');
          const refreshResponse = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: process.env.STRAVA_CLIENT_ID,
              client_secret: process.env.STRAVA_CLIENT_SECRET,
              refresh_token: integration.refresh_token,
              grant_type: 'refresh_token'
            })
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            accessToken = refreshData.access_token;
          }
        }

        console.log('🔄 Calling Strava deauthorize endpoint...');
        const deauthResponse = await fetch(`${STRAVA_OAUTH_BASE}/deauthorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `access_token=${accessToken}`
        });

        if (deauthResponse.ok) {
          console.log('✅ Strava access token successfully revoked');
        } else {
          const errorText = await deauthResponse.text();
          console.error('⚠️ Strava deauthorize response:', deauthResponse.status, errorText);
          // Continue with local cleanup even if deauth fails
        }
      } catch (deauthError) {
        console.error('⚠️ Error calling Strava deauthorize (continuing with local cleanup):', deauthError.message);
        // Continue with local cleanup even if deauth fails
      }
    }

    // Delete user's Strava activities (required within 48 hours per API Agreement)
    console.log('🗑️ Deleting user Strava activities...');
    const { error: activitiesError, count: activitiesDeleted } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (activitiesError) {
      console.error('Error deleting Strava activities:', activitiesError);
    } else {
      console.log(`✅ Deleted ${activitiesDeleted || 0} Strava activities`);
    }

    // Delete user's speed profile (derived from Strava data)
    console.log('🗑️ Deleting user speed profile...');
    const { error: profileError } = await supabase
      .from('user_speed_profiles')
      .delete()
      .eq('user_id', userId);

    if (profileError) {
      console.error('Error deleting speed profile:', profileError);
    } else {
      console.log('✅ Speed profile deleted');
    }

    // Delete any Strava webhook events
    console.log('🗑️ Deleting Strava webhook events...');
    const { error: webhookError } = await supabase
      .from('strava_webhook_events')
      .delete()
      .eq('user_id', userId);

    if (webhookError) {
      console.error('Error deleting webhook events:', webhookError);
    }

    // Finally, delete the stored integration
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (error) {
      throw new Error('Failed to disconnect Strava');
    }

    console.log('✅ Strava integration fully disconnected and all data deleted');

    return res.status(200).json({
      success: true,
      message: 'Strava connection disconnected and all Strava data deleted',
      deleted: {
        activities: activitiesDeleted || 0,
        speedProfile: !profileError,
        webhookEvents: !webhookError
      }
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}
