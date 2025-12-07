// Vercel API Route: Garmin Connect Authentication
// Garmin uses OAuth 2.0 with PKCE

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import crypto from 'crypto';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Garmin Connect OAuth 2.0 endpoints (from official PKCE spec)
const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const GARMIN_API_BASE = 'https://apis.garmin.com';

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

// PKCE helper functions
function generateCodeVerifier() {
  // Generate a random 43-128 character string
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  // SHA256 hash of the verifier, base64url encoded
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

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
    'garmin_auth',
    30,
    60
  );

  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, userId, code, state, routeData } = req.body;

    // Validate required environment variables
    const hasGarminClientId = !!process.env.GARMIN_CONSUMER_KEY;
    const hasGarminClientSecret = !!process.env.GARMIN_CONSUMER_SECRET;
    const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_KEY;

    if (!hasGarminClientId || !hasGarminClientSecret) {
      console.log('Garmin config check:', { hasGarminClientId, hasGarminClientSecret });
      return res.status(200).json({
        error: 'Garmin integration not configured. Please add GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET to your environment.',
        configured: false,
        missing: {
          clientId: !hasGarminClientId,
          clientSecret: !hasGarminClientSecret
        }
      });
    }

    if (!hasSupabaseKey) {
      console.error('Missing SUPABASE_SERVICE_KEY for Garmin auth');
      return res.status(500).json({
        error: 'Server configuration error. Please contact support.',
        code: 'MISSING_SERVICE_KEY'
      });
    }

    switch (action) {
      case 'get_authorization_url':
        return await getAuthorizationUrl(req, res, userId);

      case 'exchange_token':
        return await exchangeToken(req, res, userId, code, state);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, userId);

      case 'disconnect':
        return await disconnect(req, res, userId);

      case 'refresh_token':
        return await refreshToken(req, res, userId);

      case 'sync_activities':
        return await syncActivities(req, res, userId);

      case 'push_route':
        return await pushRoute(req, res, userId, routeData);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Garmin auth error:', error);

    let errorMessage = 'Authentication failed';
    let errorCode = 'AUTH_ERROR';

    if (error.message?.includes('token')) {
      errorMessage = 'Failed to complete Garmin connection. Please try again.';
      errorCode = 'TOKEN_ERROR';
    } else if (error.message?.includes('expired')) {
      errorMessage = 'Authorization session expired. Please start again.';
      errorCode = 'SESSION_EXPIRED';
    } else if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
      errorMessage = 'Unable to reach Garmin servers. Please check your connection.';
      errorCode = 'NETWORK_ERROR';
    }

    return res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// OAuth 2.0 PKCE Step 1: Generate authorization URL
async function getAuthorizationUrl(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  const callbackUrl = process.env.GARMIN_CALLBACK_URL ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/oauth/garmin/callback`;

  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    console.log('=== GARMIN AUTH DEBUG (OAuth 2.0 PKCE) ===');
    console.log('Client ID:', process.env.GARMIN_CONSUMER_KEY?.slice(0, 8) + '...');
    console.log('Callback URL:', callbackUrl);
    console.log('State:', state);

    // Store PKCE verifier and state temporarily
    const { error: storeError } = await supabase
      .from('garmin_oauth_temp')
      .upsert({
        user_id: userId,
        request_token: state, // Using request_token column for state
        request_token_secret: codeVerifier, // Using request_token_secret column for code_verifier
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (storeError) {
      console.error('Error storing PKCE data:', storeError);
      throw new Error('Failed to initialize authorization');
    }

    // Build authorization URL (per Garmin OAuth2 PKCE spec - no scope parameter)
    const authParams = new URLSearchParams({
      client_id: process.env.GARMIN_CONSUMER_KEY,
      response_type: 'code',
      redirect_uri: callbackUrl,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authorizationUrl = `${GARMIN_AUTHORIZE_URL}?${authParams.toString()}`;

    console.log('Authorization URL generated successfully');

    return res.status(200).json({
      success: true,
      authorizationUrl
    });

  } catch (error) {
    console.error('Get authorization URL error:', error);
    throw error;
  }
}

// OAuth 2.0 PKCE Step 2: Exchange authorization code for tokens
async function exchangeToken(req, res, userId, code, state) {
  if (!userId || !code) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const callbackUrl = process.env.GARMIN_CALLBACK_URL ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/oauth/garmin/callback`;

  try {
    // Retrieve the stored PKCE verifier
    const { data: tempData, error: tempError } = await supabase
      .from('garmin_oauth_temp')
      .select('request_token, request_token_secret')
      .eq('user_id', userId)
      .single();

    if (tempError || !tempData) {
      throw new Error('Authorization session not found. Please start the authorization flow again.');
    }

    const storedState = tempData.request_token;
    const codeVerifier = tempData.request_token_secret;

    // Verify state matches (CSRF protection)
    if (state && state !== storedState) {
      throw new Error('State mismatch. Possible CSRF attack.');
    }

    console.log('Exchanging authorization code for tokens...');
    console.log('Token exchange debug:', {
      client_id: process.env.GARMIN_CONSUMER_KEY?.slice(0, 8) + '...',
      client_secret_present: !!process.env.GARMIN_CONSUMER_SECRET,
      client_secret_length: process.env.GARMIN_CONSUMER_SECRET?.length,
      code: code?.slice(0, 8) + '...',
      code_verifier_length: codeVerifier?.length,
      redirect_uri: callbackUrl
    });

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      code: code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier
    });

    const response = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin token exchange error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Failed to exchange code for tokens (${response.status}): ${errorText || response.statusText}`);
    }

    const tokenData = await response.json();

    console.log('Token exchange successful');

    // Calculate token expiration (Garmin tokens expire in 3 months)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000)); // Default 90 days

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'garmin',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        provider_user_data: {
          connected_at: new Date().toISOString(),
          scope: tokenData.scope
        },
        sync_enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to store Garmin connection');
    }

    // Clean up temp data
    await supabase
      .from('garmin_oauth_temp')
      .delete()
      .eq('user_id', userId);

    console.log('✅ Garmin integration stored successfully');

    return res.status(200).json({
      success: true,
      message: 'Garmin connected successfully'
    });

  } catch (error) {
    console.error('Exchange token error:', error);
    throw error;
  }
}

// Refresh access token
async function refreshToken(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Get stored refresh token
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (fetchError || !integration?.refresh_token) {
      return res.status(400).json({ error: 'No Garmin connection found' });
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      refresh_token: integration.refresh_token
    });

    const response = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin token refresh error:', errorText);
      throw new Error('Failed to refresh token');
    }

    const tokenData = await response.json();

    // Calculate new expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000));

    // Update stored tokens
    const { error: updateError } = await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'garmin');

    if (updateError) {
      throw new Error('Failed to update tokens');
    }

    console.log('✅ Garmin token refreshed successfully');

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Refresh token error:', error);
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
      .select('provider_user_id, provider_user_data, updated_at, sync_enabled, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    if (error) {
      console.error('Error fetching integration:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!integration) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is expired
    const isExpired = integration.token_expires_at && new Date(integration.token_expires_at) < new Date();

    return res.status(200).json({
      connected: true,
      syncEnabled: integration.sync_enabled,
      lastUpdated: integration.updated_at,
      tokenExpired: isExpired
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
      .eq('provider', 'garmin');

    if (error) {
      throw new Error('Failed to disconnect Garmin');
    }

    console.log('✅ Garmin integration disconnected');

    return res.status(200).json({
      success: true,
      message: 'Garmin connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}

async function syncActivities(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  // TODO: Implement Garmin activity sync using their API
  return res.status(200).json({
    success: true,
    message: 'Activity sync coming soon',
    synced: 0
  });
}

async function pushRoute(req, res, userId, routeData) {
  if (!userId || !routeData) {
    return res.status(400).json({ error: 'UserId and routeData required' });
  }

  // TODO: Implement route push to Garmin Connect
  return res.status(200).json({
    success: true,
    message: 'Route push coming soon'
  });
}
