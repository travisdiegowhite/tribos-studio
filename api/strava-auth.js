// Vercel API Route: Secure Strava Authentication
// Handles token exchange and storage server-side

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for server operations
);

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    // Store tokens in bike_computer_integrations table
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'strava',
        provider_user_id: tokenData.athlete.id.toString(),
        provider_username: tokenData.athlete.username || `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        scopes: ['read', 'activity:read_all', 'profile:read_all'],
        sync_enabled: true,
        status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error storing tokens:', dbError);
      throw new Error('Failed to store authentication data');
    }

    console.log('✅ Strava integration stored successfully');

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
      .select('provider_username, provider_user_id, token_expires_at, status, updated_at')
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
      username: integration.provider_username,
      userId: integration.provider_user_id,
      status: integration.status,
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
    // TODO: Optionally call Strava deauthorize endpoint here

    // Delete stored integration
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (error) {
      throw new Error('Failed to disconnect Strava');
    }

    console.log('✅ Strava integration disconnected');

    return res.status(200).json({
      success: true,
      message: 'Strava connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}
