// Vercel API Route: COROS Authentication
// COROS uses OAuth 2.0 with application/x-www-form-urlencoded format
// Docs: COROS API Reference V2.0.6

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
import { completeActivationStep } from './utils/activation.js';

// Initialize Supabase (server-side)
const supabase = getSupabaseAdmin();

const COROS_API_BASE = process.env.COROS_API_BASE || 'https://open.coros.com';

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const rateLimitResult = await rateLimitMiddleware(req, res, 'coros_auth', 30, 60);
  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, code, userId } = req.body;

    // Validate required environment variables
    if (!process.env.COROS_CLIENT_ID || !process.env.COROS_CLIENT_SECRET) {
      return res.status(200).json({
        error: 'COROS integration not configured',
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

      case 'refresh_token':
        return await refreshTokenAction(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('COROS auth error:', error);

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

  // Determine redirect URI
  let redirectUri = process.env.COROS_CALLBACK_URL;
  if (!redirectUri) {
    const baseUrl = process.env.PRODUCTION_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000';
    redirectUri = `${baseUrl}/oauth/coros/callback`;
  }

  try {
    console.log('🔄 Exchanging COROS code for tokens...');

    // COROS uses application/x-www-form-urlencoded for all requests
    const response = await fetch(`${COROS_API_BASE}/oauth2/accesstoken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.COROS_CLIENT_ID,
        client_secret: process.env.COROS_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }).toString()
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ COROS token exchange failed:', {
        status: response.status,
        error: error,
        redirect_uri_used: redirectUri
      });

      if (response.status === 400 || response.status === 401) {
        return res.status(400).json({
          error: 'COROS authentication failed',
          details: 'The authorization code may have expired or the redirect URI doesn\'t match. Please try again.',
        });
      }

      throw new Error(`COROS token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    console.log('✅ COROS tokens received');

    const { access_token, refresh_token, expires_in, openId } = tokenData;

    if (!access_token || !openId) {
      throw new Error('Invalid token response from COROS');
    }

    // Get user profile from COROS
    // COROS passes token as query parameter, not Bearer header
    let userData = {};
    try {
      const userResponse = await fetch(
        `${COROS_API_BASE}/coros/userinfosim?token=${access_token}&openId=${openId}`
      );

      if (userResponse.ok) {
        const userResult = await userResponse.json();
        if (userResult.result === '0000' && userResult.data) {
          userData = userResult.data;
        }
      }
    } catch (userErr) {
      console.warn('Could not fetch COROS user profile:', userErr.message);
    }

    // Calculate expiration
    const expiresAt = new Date(Date.now() + (expires_in || 2592000) * 1000).toISOString();

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'coros',
        provider_user_id: openId,
        provider_user_data: {
          nick: userData.nick || null,
          profilePhoto: userData.profilePhoto || null,
          openId: openId
        },
        access_token: access_token,
        refresh_token: refresh_token,
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

    console.log('✅ COROS integration stored successfully');

    // Track activation step
    await completeActivationStep(supabase, userId, 'connect_device').catch(() => {});

    return res.status(200).json({
      success: true,
      user: {
        openId: openId,
        nick: userData.nick || null
      }
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

async function refreshAccessToken(userId, refreshToken) {
  try {
    const response = await fetch(`${COROS_API_BASE}/oauth2/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.COROS_CLIENT_ID,
        client_secret: process.env.COROS_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh COROS token: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    if (result.result !== '0000') {
      throw new Error(`COROS refresh failed: ${result.message || 'Unknown error'}`);
    }

    // COROS refresh extends validity by 30 days from current time
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Update stored tokens
    await supabase
      .from('bike_computer_integrations')
      .update({
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');

    return { success: true, newExpiresAt: expiresAt };
  } catch (error) {
    console.error('COROS token refresh error:', error);
    throw error;
  }
}

export async function getValidAccessToken(userId) {
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('access_token, refresh_token, token_expires_at, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', 'coros')
    .single();

  if (error || !integration) {
    throw new Error('COROS not connected');
  }

  // Check if token needs refresh (1-day buffer for 30-day tokens)
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if ((expiresAt.getTime() - oneDayMs) < now.getTime()) {
    await refreshAccessToken(userId, integration.refresh_token);

    // Re-fetch the updated token
    const { data: updated } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .single();

    return { token: updated.access_token, openId: integration.provider_user_id };
  }

  return { token: integration.access_token, openId: integration.provider_user_id };
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
      .eq('provider', 'coros')
      .maybeSingle();

    if (error) {
      console.error('Error fetching integration:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!integration) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is still valid (1-day buffer)
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const isExpired = (expiresAt.getTime() - oneDayMs) < now.getTime();

    return res.status(200).json({
      connected: true,
      isExpired,
      username: integration.provider_user_data?.nick || integration.provider_user_id,
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
    // Get the current access token for deauthorization
    const { data: integration } = await supabase
      .from('bike_computer_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .maybeSingle();

    // Call COROS deauthorize endpoint
    if (integration?.access_token) {
      try {
        await fetch(`${COROS_API_BASE}/oauth2/deauthorize?token=${integration.access_token}`, {
          method: 'POST'
        });
      } catch (deauthErr) {
        console.warn('COROS deauthorize call failed (non-blocking):', deauthErr.message);
      }
    }

    // Delete integration record
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'coros');

    if (error) {
      throw new Error('Failed to disconnect COROS');
    }

    // Clean up COROS activities
    await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'coros');

    console.log('✅ COROS integration disconnected');

    return res.status(200).json({
      success: true,
      message: 'COROS connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}

async function refreshTokenAction(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .single();

    if (error || !integration) {
      return res.status(404).json({ error: 'COROS not connected' });
    }

    const result = await refreshAccessToken(userId, integration.refresh_token);

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({ error: error.message });
  }
}
