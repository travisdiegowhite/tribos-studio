// Vercel API Route: Secure Garmin Authentication
// Handles OAuth 2.0 PKCE authentication flow and token storage
// Documentation: https://developer.garmin.com/gc-developer-program/overview/

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Garmin OAuth 2.0 PKCE endpoints
const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

// Temporary storage for code verifiers (in production, use Redis or database)
const codeVerifierStore = new Map();

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Generate a cryptographically random code verifier (43-128 characters)
 */
function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}

/**
 * Generate code challenge from verifier (SHA-256 hash)
 */
function generateCodeChallenge(verifier) {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}

/**
 * Base64 URL encoding (without padding)
 */
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
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

  try {
    const { action, userId, code, state } = req.body;

    // Validate required environment variables
    if (!process.env.GARMIN_CONSUMER_KEY || !process.env.GARMIN_CONSUMER_SECRET) {
      return res.status(500).json({ error: 'Garmin credentials not configured' });
    }

    switch (action) {
      case 'get_authorization_url':
        return await getAuthorizationUrl(req, res, userId);

      case 'exchange_code':
        return await exchangeCodeForToken(req, res, userId, code, state);

      case 'refresh_token':
        return await refreshAccessToken(req, res, userId);

      case 'disconnect':
        return await disconnectGarmin(req, res, userId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Garmin auth error:', error);

    // Only expose detailed error info in development
    const errorResponse = {
      error: 'Authentication failed'
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.message = error.message;
      errorResponse.details = error.stack;
    }

    return res.status(500).json(errorResponse);
  }
}

/**
 * Step 1: Generate authorization URL with PKCE challenge
 */
async function getAuthorizationUrl(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = base64URLEncode(crypto.randomBytes(16));

    // Determine callback URL based on environment
    const redirectUri = process.env.NODE_ENV === 'production'
      ? process.env.REACT_APP_GARMIN_REDIRECT_URI || 'https://www.tribos.studio/garmin/callback'
      : 'http://localhost:3000/garmin/callback';

    console.log('🔍 Generating Garmin OAuth 2.0 PKCE URL:', {
      userId,
      redirectUri,
      clientId: process.env.GARMIN_CONSUMER_KEY
    });

    // Store code verifier temporarily (associated with state)
    codeVerifierStore.set(state, {
      verifier: codeVerifier,
      userId: userId,
      timestamp: Date.now()
    });

    // Clean up old verifiers (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, data] of codeVerifierStore.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        codeVerifierStore.delete(key);
      }
    }

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      state: state
    });

    const authorizationUrl = `${GARMIN_AUTHORIZE_URL}?${params.toString()}`;

    console.log('✅ Generated authorization URL with PKCE challenge');

    return res.status(200).json({
      success: true,
      authorizationUrl: authorizationUrl,
      state: state
    });

  } catch (error) {
    console.error('Authorization URL generation error:', error);
    throw error;
  }
}

/**
 * Step 2: Exchange authorization code for access token
 */
async function exchangeCodeForToken(req, res, userId, code, state) {
  if (!userId || !code || !state) {
    return res.status(400).json({ error: 'UserId, code, and state required' });
  }

  try {
    // Retrieve stored code verifier
    const storedData = codeVerifierStore.get(state);
    if (!storedData) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }

    // Verify this state belongs to the requesting user
    if (storedData.userId !== userId) {
      return res.status(403).json({ error: 'State does not belong to this user' });
    }

    const codeVerifier = storedData.verifier;

    console.log('🔄 Exchanging authorization code for access token:', {
      userId,
      hasCode: !!code,
      hasVerifier: !!codeVerifier
    });

    // Determine redirect URI (must match the one used in authorization)
    const redirectUri = process.env.NODE_ENV === 'production'
      ? process.env.REACT_APP_GARMIN_REDIRECT_URI || 'https://www.tribos.studio/garmin/callback'
      : 'http://localhost:3000/garmin/callback';

    // Request access token from Garmin
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      code: code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri
    });

    const response = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin token exchange failed:', errorText);
      throw new Error(`Garmin token exchange failed: ${errorText}`);
    }

    const tokenData = await response.json();

    if (!tokenData.access_token || !tokenData.refresh_token) {
      console.error('Invalid token response from Garmin:', tokenData);
      throw new Error('Invalid token response from Garmin');
    }

    console.log('✅ Garmin access token received:', {
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope
    });

    // Clean up code verifier
    codeVerifierStore.delete(state);

    // Fetch Garmin user ID using the access token
    let garminUserId = null;
    try {
      console.log('🔍 Fetching Garmin user ID...');
      const userIdResponse = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });

      if (userIdResponse.ok) {
        const userData = await userIdResponse.json();
        garminUserId = userData.userId;
        console.log('✅ Garmin user ID retrieved:', garminUserId);
      } else {
        console.warn('⚠️ Failed to fetch Garmin user ID:', await userIdResponse.text());
      }
    } catch (userIdError) {
      console.warn('⚠️ Error fetching Garmin user ID:', userIdError.message);
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'garmin',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        provider_user_id: garminUserId, // Garmin's internal user ID
        provider_user_data: {
          scope: tokenData.scope,
          token_type: tokenData.token_type
        },
        sync_enabled: true,
        last_sync_at: null,
        sync_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error storing Garmin tokens:', dbError);
      throw new Error('Failed to store authentication data');
    }

    console.log('✅ Garmin integration stored successfully');

    return res.status(200).json({
      success: true,
      message: 'Garmin connected successfully',
      expiresIn: tokenData.expires_in
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Get current integration
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching Garmin integration:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch Garmin integration' });
    }

    if (!integration?.refresh_token) {
      return res.status(404).json({ error: 'Garmin integration not found' });
    }

    console.log('🔄 Refreshing Garmin access token for user:', userId);

    // Request new access token
    const params = new URLSearchParams({
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
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin token refresh failed:', errorText);
      throw new Error(`Garmin token refresh failed: ${errorText}`);
    }

    const tokenData = await response.json();

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'garmin');

    if (updateError) {
      console.error('Database error updating tokens:', updateError);
      throw new Error('Failed to update tokens');
    }

    console.log('✅ Garmin access token refreshed successfully');

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      expiresIn: tokenData.expires_in
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

/**
 * Disconnect Garmin account
 */
async function disconnectGarmin(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // TODO: Call Garmin's delete user registration endpoint
    // DELETE https://apis.garmin.com/wellness-api/rest/user/registration
    // (requires access token in Authorization header)

    // Delete stored integration
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'garmin');

    if (error) {
      console.error('Database error deleting Garmin integration:', error);
      throw new Error('Failed to disconnect Garmin');
    }

    console.log('✅ Garmin integration disconnected successfully');

    return res.status(200).json({
      success: true,
      message: 'Garmin connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}
