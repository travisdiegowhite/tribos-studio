// Vercel API Route: Wahoo Fitness Authentication
// Wahoo uses OAuth 2.0

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';
const WAHOO_API_BASE = 'https://api.wahooligan.com/v1';

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
    'wahoo_auth',
    30,
    60
  );

  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, code, userId, routeData } = req.body;

    // Validate required environment variables
    if (!process.env.WAHOO_CLIENT_ID || !process.env.WAHOO_CLIENT_SECRET) {
      return res.status(200).json({
        error: 'Wahoo integration not configured',
        configured: false
      });
    }

    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(req, res, code, userId);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, userId);

      case 'disconnect':
        return await disconnect(req, res, userId);

      case 'sync_workouts':
        return await syncWorkouts(req, res, userId);

      case 'push_route':
        return await pushRoute(req, res, userId, routeData);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Wahoo auth error:', error);

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

  const redirectUri = process.env.WAHOO_REDIRECT_URI ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/wahoo/callback`;

  try {
    console.log('🔄 Exchanging Wahoo code for tokens...');

    // Exchange code with Wahoo
    const response = await fetch(`${WAHOO_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.WAHOO_CLIENT_ID,
        client_secret: process.env.WAHOO_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }).toString()
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Wahoo token exchange failed:', error);
      throw new Error(`Wahoo token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    console.log('✅ Wahoo tokens received');

    // Get user profile
    const userResponse = await fetch(`${WAHOO_API_BASE}/user`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    let userData = {};
    if (userResponse.ok) {
      userData = await userResponse.json();
    }

    // Calculate expiration
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'wahoo',
        provider_user_id: userData.id?.toString() || null,
        provider_user_data: {
          email: userData.email,
          first: userData.first,
          last: userData.last,
          created_at: userData.created_at
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
      console.error('Database error storing tokens:', dbError);
      throw new Error('Failed to store authentication data');
    }

    console.log('✅ Wahoo integration stored successfully');

    return res.status(200).json({
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        name: `${userData.first || ''} ${userData.last || ''}`.trim()
      }
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

async function refreshAccessToken(userId, refreshToken) {
  try {
    const response = await fetch(`${WAHOO_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.WAHOO_CLIENT_ID,
        client_secret: process.env.WAHOO_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const tokenData = await response.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Update stored tokens
    await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'wahoo');

    return tokenData.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

async function getValidAccessToken(userId) {
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'wahoo')
    .single();

  if (error || !integration) {
    throw new Error('Wahoo not connected');
  }

  // Check if token needs refresh (5 minute buffer)
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();

  if ((expiresAt.getTime() - 300000) < now.getTime()) {
    return await refreshAccessToken(userId, integration.refresh_token);
  }

  return integration.access_token;
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
      .eq('provider', 'wahoo')
      .maybeSingle();

    if (error) {
      console.error('Error fetching integration:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!integration) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is still valid
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const isExpired = (expiresAt.getTime() - 300000) < now.getTime();

    return res.status(200).json({
      connected: true,
      isExpired,
      username: integration.provider_user_data?.email ||
                `${integration.provider_user_data?.first} ${integration.provider_user_data?.last}`.trim(),
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
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'wahoo');

    if (error) {
      throw new Error('Failed to disconnect Wahoo');
    }

    console.log('✅ Wahoo integration disconnected');

    return res.status(200).json({
      success: true,
      message: 'Wahoo connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}

async function syncWorkouts(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const accessToken = await getValidAccessToken(userId);

    // Fetch workouts from Wahoo
    const response = await fetch(`${WAHOO_API_BASE}/workouts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch workouts from Wahoo');
    }

    const workoutsData = await response.json();
    const workouts = workoutsData.workouts || [];

    // TODO: Store workouts in activities table
    // For now, just return the count

    return res.status(200).json({
      success: true,
      synced: workouts.length,
      message: `Found ${workouts.length} workouts from Wahoo`
    });

  } catch (error) {
    console.error('Sync workouts error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function pushRoute(req, res, userId, routeData) {
  if (!userId || !routeData) {
    return res.status(400).json({ error: 'UserId and routeData required' });
  }

  try {
    const accessToken = await getValidAccessToken(userId);

    // Format route for Wahoo API
    const wahooRoute = {
      route: {
        name: routeData.name,
        description: routeData.description || '',
        // Wahoo expects route data in specific format
        // This would need the actual geometry converted to their format
      }
    };

    const response = await fetch(`${WAHOO_API_BASE}/routes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(wahooRoute)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Wahoo route push error:', errorText);
      throw new Error('Failed to push route to Wahoo');
    }

    const result = await response.json();

    return res.status(200).json({
      success: true,
      routeId: result.route?.id,
      message: 'Route pushed to Wahoo successfully'
    });

  } catch (error) {
    console.error('Push route error:', error);
    return res.status(500).json({ error: error.message });
  }
}
