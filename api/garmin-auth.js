// Vercel API Route: Garmin Connect Authentication
// Garmin uses OAuth 1.0a

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import crypto from 'crypto';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Garmin Connect API endpoints
const GARMIN_REQUEST_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/request_token';
const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauthConfirm';
const GARMIN_ACCESS_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/access_token';
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

// OAuth 1.0a helper functions
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function generateTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function generateSignature(method, url, params, consumerSecret, tokenSecret = '') {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');

  // Create signature base string
  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;

  // Create signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  return signature;
}

function buildAuthorizationHeader(params) {
  const headerParams = Object.keys(params)
    .filter(key => key.startsWith('oauth_'))
    .sort()
    .map(key => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(', ');

  return `OAuth ${headerParams}`;
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
    const { action, userId, oauthToken, oauthVerifier, routeData } = req.body;

    // Validate required environment variables
    if (!process.env.GARMIN_CONSUMER_KEY || !process.env.GARMIN_CONSUMER_SECRET) {
      return res.status(200).json({
        error: 'Garmin integration not configured',
        configured: false
      });
    }

    switch (action) {
      case 'get_request_token':
        return await getRequestToken(req, res, userId);

      case 'exchange_token':
        return await exchangeToken(req, res, userId, oauthToken, oauthVerifier);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, userId);

      case 'disconnect':
        return await disconnect(req, res, userId);

      case 'sync_activities':
        return await syncActivities(req, res, userId);

      case 'push_route':
        return await pushRoute(req, res, userId, routeData);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Garmin auth error:', error);

    return res.status(500).json({
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// OAuth 1.0a Step 1: Get request token
async function getRequestToken(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  const callbackUrl = process.env.GARMIN_CALLBACK_URL ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/oauth/garmin/callback`;

  try {
    const oauthParams = {
      oauth_consumer_key: process.env.GARMIN_CONSUMER_KEY,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: generateTimestamp(),
      oauth_nonce: generateNonce(),
      oauth_version: '1.0',
      oauth_callback: callbackUrl
    };

    // Generate signature
    oauthParams.oauth_signature = generateSignature(
      'POST',
      GARMIN_REQUEST_TOKEN_URL,
      oauthParams,
      process.env.GARMIN_CONSUMER_SECRET
    );

    // Make request
    const response = await fetch(GARMIN_REQUEST_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': buildAuthorizationHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin request token error:', errorText);
      throw new Error('Failed to get request token from Garmin');
    }

    const responseText = await response.text();
    const responseParams = new URLSearchParams(responseText);

    const requestToken = responseParams.get('oauth_token');
    const requestTokenSecret = responseParams.get('oauth_token_secret');

    // Store request token temporarily (in memory or database)
    // For production, store in database with userId reference
    await supabase
      .from('garmin_oauth_temp')
      .upsert({
        user_id: userId,
        request_token: requestToken,
        request_token_secret: requestTokenSecret,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    // Build authorization URL
    const authorizationUrl = `${GARMIN_AUTHORIZE_URL}?oauth_token=${requestToken}`;

    return res.status(200).json({
      success: true,
      authorizationUrl
    });

  } catch (error) {
    console.error('Get request token error:', error);
    throw error;
  }
}

// OAuth 1.0a Step 3: Exchange for access token
async function exchangeToken(req, res, userId, oauthToken, oauthVerifier) {
  if (!userId || !oauthToken || !oauthVerifier) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Retrieve the request token secret
    const { data: tempData, error: tempError } = await supabase
      .from('garmin_oauth_temp')
      .select('request_token_secret')
      .eq('user_id', userId)
      .eq('request_token', oauthToken)
      .single();

    if (tempError || !tempData) {
      throw new Error('Request token not found. Please start the authorization flow again.');
    }

    const requestTokenSecret = tempData.request_token_secret;

    const oauthParams = {
      oauth_consumer_key: process.env.GARMIN_CONSUMER_KEY,
      oauth_token: oauthToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: generateTimestamp(),
      oauth_nonce: generateNonce(),
      oauth_version: '1.0',
      oauth_verifier: oauthVerifier
    };

    // Generate signature with request token secret
    oauthParams.oauth_signature = generateSignature(
      'POST',
      GARMIN_ACCESS_TOKEN_URL,
      oauthParams,
      process.env.GARMIN_CONSUMER_SECRET,
      requestTokenSecret
    );

    const response = await fetch(GARMIN_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': buildAuthorizationHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Garmin access token error:', errorText);
      throw new Error('Failed to get access token from Garmin');
    }

    const responseText = await response.text();
    const responseParams = new URLSearchParams(responseText);

    const accessToken = responseParams.get('oauth_token');
    const accessTokenSecret = responseParams.get('oauth_token_secret');

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'garmin',
        access_token: accessToken,
        refresh_token: accessTokenSecret, // OAuth 1.0a uses token secret instead of refresh token
        provider_user_data: {
          connected_at: new Date().toISOString()
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

    // Clean up temp token
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

async function getConnectionStatus(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('provider_user_id, provider_user_data, updated_at, sync_enabled')
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

    return res.status(200).json({
      connected: true,
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
  // This requires making authenticated requests to Garmin's API

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
  // This allows users to sync routes to their Garmin devices

  return res.status(200).json({
    success: true,
    message: 'Route push coming soon'
  });
}
