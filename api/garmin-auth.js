// Vercel API Route: Garmin Connect Authentication
// Garmin uses OAuth 2.0 with PKCE

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';
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

// Helper to get user ID from Authorization header (more secure than trusting request body)
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

// Base64 URL encoding (without padding) - matches Garmin spec exactly
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// PKCE helper functions
function generateCodeVerifier() {
  // Generate a random 43-128 character string
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  // SHA256 hash of the verifier, base64url encoded
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}

function generateState() {
  return base64URLEncode(crypto.randomBytes(16));
}

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

    // For user-specific actions, prefer auth token over request body userId
    // This is more secure and ensures consistency with other endpoints
    let authenticatedUserId = userId; // Fall back to request body for backwards compatibility
    const authUser = await getUserFromAuthHeader(req);
    if (authUser) {
      authenticatedUserId = authUser.id;
      if (userId && userId !== authUser.id) {
        console.warn('User ID mismatch - request body:', userId, 'auth token:', authUser.id);
      }
    }

    switch (action) {
      case 'get_authorization_url':
        return await getAuthorizationUrl(req, res, authenticatedUserId);

      case 'exchange_token':
        return await exchangeToken(req, res, authenticatedUserId, code, state);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, authenticatedUserId);

      case 'disconnect':
        return await disconnect(req, res, authenticatedUserId);

      case 'refresh_token':
        return await refreshToken(req, res, authenticatedUserId);

      case 'repair_connection':
        return await repairConnection(req, res, authenticatedUserId);

      case 'sync_activities':
        return await syncActivities(req, res, authenticatedUserId);

      case 'push_route':
        return await pushRoute(req, res, authenticatedUserId, routeData);

      case 'get_health_data':
        return await getHealthData(req, res, authenticatedUserId);

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
  console.log('exchangeToken called with userId:', userId);

  if (!userId || !code) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const callbackUrl = process.env.GARMIN_CALLBACK_URL ||
    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/oauth/garmin/callback`;

  try {
    // Retrieve the stored PKCE verifier
    const { data: tempData, error: tempError } = await supabase
      .from('garmin_oauth_temp')
      .select('request_token, request_token_secret, user_id')
      .eq('user_id', userId)
      .single();

    console.log('PKCE lookup for userId:', userId, 'result:', {
      found: !!tempData,
      error: tempError?.message,
      storedUserId: tempData?.user_id
    });

    if (tempError || !tempData) {
      throw new Error('Authorization session not found. Please start the authorization flow again.');
    }

    const storedState = tempData.request_token;
    const codeVerifier = tempData.request_token_secret;

    // Verify state matches (CSRF protection)
    if (state && state !== storedState) {
      throw new Error('State mismatch. Possible CSRF attack.');
    }

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

    // Fetch Garmin user ID - REQUIRED for webhook matching
    // This is critical - without the User ID, webhooks cannot be matched to the user
    let garminUserId = null;
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching Garmin user ID (attempt ${attempt}/${maxRetries})...`);
        const userIdResponse = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        });

        if (userIdResponse.ok) {
          const userData = await userIdResponse.json();
          garminUserId = userData.userId;
          console.log('Garmin user ID retrieved successfully:', garminUserId);
          break; // Success - exit retry loop
        } else {
          const errorText = await userIdResponse.text();
          lastError = `HTTP ${userIdResponse.status}: ${errorText}`;
          console.warn(`Attempt ${attempt} failed to fetch Garmin user ID:`, lastError);
        }
      } catch (userIdError) {
        lastError = userIdError.message;
        console.warn(`Attempt ${attempt} error fetching Garmin user ID:`, lastError);
      }

      // Wait before retrying (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    // CRITICAL: Fail the connection if we couldn't get the Garmin User ID
    // Without this ID, webhooks cannot be matched to the user's account
    if (!garminUserId) {
      console.error('CRITICAL: Failed to fetch Garmin User ID after all retries. Last error:', lastError);
      throw new Error(
        'Failed to retrieve your Garmin User ID. This is required for activity sync. ' +
        'Please try connecting again. If the problem persists, Garmin services may be temporarily unavailable.'
      );
    }

    // Calculate token expiration (Garmin tokens expire in 3 months)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000)); // Default 90 days

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'garmin',
        provider_user_id: garminUserId, // Critical for webhook matching
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        provider_user_data: {
          connected_at: new Date().toISOString(),
          scope: tokenData.scope,
          garmin_user_id: garminUserId
        },
        sync_enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error storing integration:', dbError);
      throw new Error('Failed to store Garmin connection');
    }

    console.log('✅ Integration stored successfully for user:', userId, 'with Garmin User ID:', garminUserId);

    // Clean up temp data
    await supabase
      .from('garmin_oauth_temp')
      .delete()
      .eq('user_id', userId);

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

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    throw error;
  }
}

// Repair a broken connection by refreshing token and re-fetching Garmin User ID
// Use this when the connection shows "Missing User ID" or "Token Expired"
async function repairConnection(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Get stored integration data
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token, provider_user_id, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (fetchError || !integration) {
      return res.status(400).json({
        error: 'No Garmin connection found. Please connect your account first.',
        requiresReconnect: true
      });
    }

    if (!integration.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token available. Please reconnect your Garmin account.',
        requiresReconnect: true
      });
    }

    // Step 1: Refresh the token
    console.log('Repair: Refreshing token...');
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      refresh_token: integration.refresh_token
    });

    const tokenResponse = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Repair: Token refresh failed:', errorText);
      return res.status(400).json({
        error: 'Failed to refresh token. Your Garmin authorization may have been revoked. Please reconnect.',
        requiresReconnect: true,
        details: tokenResponse.status
      });
    }

    const tokenData = await tokenResponse.json();
    const newAccessToken = tokenData.access_token;
    console.log('Repair: Token refreshed successfully');

    // Step 2: Fetch Garmin User ID with the new token
    console.log('Repair: Fetching Garmin User ID...');
    let garminUserId = null;
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const userIdResponse = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
          headers: {
            'Authorization': `Bearer ${newAccessToken}`
          }
        });

        if (userIdResponse.ok) {
          const userData = await userIdResponse.json();
          garminUserId = userData.userId;
          console.log('Repair: Garmin User ID retrieved:', garminUserId);
          break;
        } else {
          lastError = await userIdResponse.text();
          console.warn(`Repair: Attempt ${attempt} failed:`, lastError);
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`Repair: Attempt ${attempt} error:`, lastError);
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    if (!garminUserId) {
      return res.status(500).json({
        error: 'Token refreshed but failed to retrieve Garmin User ID. Please try again or reconnect.',
        tokenRefreshed: true,
        userIdFetched: false,
        requiresReconnect: true
      });
    }

    // Step 3: Update the database with new token and User ID
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000));

    const { error: updateError } = await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: newAccessToken,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        provider_user_id: garminUserId,
        provider_user_data: {
          repaired_at: new Date().toISOString(),
          garmin_user_id: garminUserId
        },
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', 'garmin');

    if (updateError) {
      console.error('Repair: Database update failed:', updateError);
      throw new Error('Failed to save repaired connection');
    }

    console.log('Repair: Connection successfully repaired for user', userId);

    return res.status(200).json({
      success: true,
      message: 'Connection repaired successfully! Your Garmin account is now fully connected.',
      tokenRefreshed: true,
      userIdFetched: true,
      garminUserId: garminUserId
    });

  } catch (error) {
    console.error('Repair connection error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to repair connection',
      requiresReconnect: true
    });
  }
}

async function getConnectionStatus(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  console.log('getConnectionStatus - checking for userId:', userId);

  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('provider_user_id, provider_user_data, updated_at, sync_enabled, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    console.log('getConnectionStatus - query result:', {
      found: !!integration,
      provider_user_id: integration?.provider_user_id,
      error: error?.message
    });

    if (error) {
      console.error('Error fetching integration:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!integration) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is expired
    const now = new Date();
    const tokenExpiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
    const isExpired = tokenExpiresAt ? tokenExpiresAt < now : true;

    // Check if User ID is missing (critical for webhooks)
    const hasUserID = !!integration.provider_user_id;

    // Determine connection health status
    let healthStatus = 'healthy';
    let healthMessage = 'Connected and working';
    let requiresReconnect = false;

    if (!hasUserID) {
      healthStatus = 'missing_user_id';
      healthMessage = 'Missing Garmin User ID - activity sync will not work. Please reconnect.';
      requiresReconnect = true;
    } else if (isExpired) {
      healthStatus = 'token_expired';
      healthMessage = 'Token expired - try refreshing or reconnecting.';
    }

    return res.status(200).json({
      connected: true,
      syncEnabled: integration.sync_enabled,
      lastUpdated: integration.updated_at,
      tokenExpired: isExpired,
      // New detailed status fields
      garminUserId: integration.provider_user_id,
      hasGarminUserId: hasUserID,
      healthStatus,
      healthMessage,
      requiresReconnect,
      // Debug
      debug: { queriedUserId: userId }
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

  if (!routeData.coordinates || routeData.coordinates.length === 0) {
    return res.status(400).json({ error: 'Route must have coordinates' });
  }

  try {
    // Get user's Garmin integration
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (fetchError || !integration) {
      return res.status(400).json({
        error: 'Garmin not connected. Please connect your Garmin account first.',
        requiresConnection: true
      });
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    const tokenExpired = integration.token_expires_at && new Date(integration.token_expires_at) < new Date();

    if (tokenExpired && integration.refresh_token) {
      console.log('Token expired, refreshing before course upload...');
      const newToken = await refreshGarminToken(userId, integration.refresh_token);
      if (newToken) {
        accessToken = newToken;
      } else {
        return res.status(401).json({
          error: 'Garmin authorization expired. Please reconnect your account.',
          requiresReconnect: true
        });
      }
    }

    // Prepare course data for Garmin Course API
    const courseData = buildCoursePayload(routeData);

    // Upload course to Garmin Connect
    // Garmin Course API endpoint (JSON format)
    const courseUploadUrl = 'https://apis.garmin.com/course-api/course';

    console.log('Uploading course to Garmin:', routeData.name, `(${courseData.geoPoints.length} points)`);

    const uploadResponse = await fetch(courseUploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(courseData)
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Garmin course upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        body: errorText,
        sentPayload: {
          courseName: courseData.courseName,
          distance: courseData.distance,
          elevationGain: courseData.elevationGain,
          activityType: courseData.activityType,
          pointCount: courseData.geoPoints?.length
        }
      });

      // Check for specific error types
      if (uploadResponse.status === 401 || uploadResponse.status === 403) {
        return res.status(401).json({
          error: 'Garmin authorization failed. Please reconnect your account.',
          requiresReconnect: true,
          details: errorText
        });
      }

      if (uploadResponse.status === 400) {
        return res.status(400).json({
          error: 'Invalid course data. Please check the route and try again.',
          details: errorText
        });
      }

      // Return the actual Garmin error for debugging
      return res.status(uploadResponse.status).json({
        error: 'Failed to upload course to Garmin',
        garminStatus: uploadResponse.status,
        details: errorText
      });
    }

    const result = await uploadResponse.json();
    console.log('Course uploaded successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Route sent to Garmin Connect! Sync your device to download it.',
      courseId: result.courseId || result.id,
      courseName: routeData.name
    });

  } catch (error) {
    console.error('Push route error:', error);
    return res.status(500).json({
      error: 'Failed to send route to Garmin',
      details: error.message
    });
  }
}

// Build course payload for Garmin Course API (JSON format)
function buildCoursePayload(routeData) {
  // Calculate total distance in meters
  let distanceMeters = (routeData.distanceKm || 0) * 1000;
  if (distanceMeters === 0 && routeData.coordinates.length > 1) {
    distanceMeters = calculateRouteDistance(routeData.coordinates);
  }

  // Convert coordinates to geoPoints format
  const geoPoints = routeData.coordinates.map(coord => {
    const [lng, lat, ele] = coord.length === 3 ? coord : [coord[0], coord[1], 0];
    return {
      latitude: lat,
      longitude: lng,
      elevation: ele || 0
    };
  });

  // Map surface type to Garmin activity type
  const activityType = mapSurfaceToActivityType(routeData.surfaceType);

  return {
    courseName: (routeData.name || 'Tribos Route').substring(0, 32), // Garmin limit
    description: (routeData.description || 'Created with Tribos Studio').substring(0, 255),
    distance: Math.round(distanceMeters),
    elevationGain: Math.round(routeData.elevationGainM || 0),
    elevationLoss: Math.round(routeData.elevationLossM || 0),
    activityType: activityType,
    coordinateSystem: 'WGS84',
    geoPoints: geoPoints
  };
}

// Map surface type to Garmin activity type
function mapSurfaceToActivityType(surfaceType) {
  const mapping = {
    'paved': 'ROAD_CYCLING',
    'gravel': 'GRAVEL_CYCLING',
    'mixed': 'GRAVEL_CYCLING',
    'trail': 'MOUNTAIN_BIKING',
    'mountain': 'MOUNTAIN_BIKING'
  };
  return mapping[surfaceType?.toLowerCase()] || 'ROAD_CYCLING';
}

// Helper: Haversine distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Helper: Calculate total route distance
function calculateRouteDistance(coordinates) {
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    totalDistance += haversineDistance(lat1, lng1, lat2, lng2);
  }
  return totalDistance;
}

// Helper function to refresh Garmin token
async function refreshGarminToken(userId, refreshToken) {
  console.log('Attempting to refresh Garmin token...');

  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GARMIN_CONSUMER_KEY,
    client_secret: process.env.GARMIN_CONSUMER_SECRET,
    refresh_token: refreshToken
  });

  const tokenResponse = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token refresh failed:', tokenResponse.status, errorText);
    return null;
  }

  const tokenData = await tokenResponse.json();
  console.log('Token refresh successful, new token received');

  // Update stored tokens
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000));

  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('provider', 'garmin');

  if (updateError) {
    console.error('Failed to save refreshed token to database:', updateError);
  } else {
    console.log('Refreshed token saved to database');
  }

  return tokenData.access_token;
}

// Fetch health data from Garmin (dailies, sleep, body composition)
async function getHealthData(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Get user's Garmin integration
    const { data: integration, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (fetchError || !integration) {
      return res.status(200).json({
        success: false,
        connected: false,
        error: 'Garmin not connected'
      });
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    let refreshToken = integration.refresh_token;
    const tokenExpired = integration.token_expires_at && new Date(integration.token_expires_at) < new Date();
    let tokenRefreshAttempted = false;
    let authError = null;

    if (tokenExpired && refreshToken) {
      console.log('Token expired, refreshing...');
      const newToken = await refreshGarminToken(userId, refreshToken);
      if (newToken) {
        accessToken = newToken;
        tokenRefreshAttempted = true;
      } else {
        authError = 'Token refresh failed';
      }
    }

    // Calculate date range for today's data (UTC timestamps in seconds)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    const uploadStartTimeInSeconds = Math.floor(startOfDay.getTime() / 1000);
    const uploadEndTimeInSeconds = Math.floor(endOfDay.getTime() / 1000);

    const healthData = {
      resting_heart_rate: null,
      hrv_score: null,
      sleep_hours: null,
      sleep_quality: null,
      stress_level: null,
      weight_kg: null,
      source: 'garmin'
    };

    // Helper to check if error indicates invalid token
    const isTokenInvalid = (responseText) => {
      return responseText.includes('InvalidPullTokenException') ||
             responseText.includes('invalid_token') ||
             responseText.includes('token expired') ||
             responseText.includes('unauthorized');
    };

    // Helper to make authenticated request with retry on token error
    const fetchWithTokenRetry = async (url, description) => {
      let response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        return { success: true, data: await response.json() };
      }

      const responseText = await response.text();
      console.log(`${description} API response:`, response.status, responseText);

      // Check if it's a token error and we haven't tried refreshing yet
      if (response.status === 400 && isTokenInvalid(responseText) && !tokenRefreshAttempted && refreshToken) {
        console.log(`${description}: Token invalid, attempting refresh...`);
        const newToken = await refreshGarminToken(userId, refreshToken);

        if (newToken) {
          accessToken = newToken;
          tokenRefreshAttempted = true;

          // Retry with new token
          response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (response.ok) {
            console.log(`${description}: Retry successful after token refresh`);
            return { success: true, data: await response.json() };
          }
        } else {
          // Token refresh failed - user needs to reconnect
          authError = 'Your Garmin authorization has expired or been revoked. Please reconnect your account.';
        }
      }

      // Check if it's still a token error after refresh attempt
      if (response.status === 400 && isTokenInvalid(responseText)) {
        authError = authError || 'Your Garmin authorization has expired or been revoked. Please reconnect your account.';
      }

      return { success: false, status: response.status, error: responseText };
    };

    // Fetch Daily Summaries (contains resting HR, stress, steps)
    try {
      const dailiesUrl = `${GARMIN_API_BASE}/wellness-api/rest/dailies?uploadStartTimeInSeconds=${uploadStartTimeInSeconds}&uploadEndTimeInSeconds=${uploadEndTimeInSeconds}`;
      console.log('Fetching Garmin dailies:', dailiesUrl);

      const result = await fetchWithTokenRetry(dailiesUrl, 'Dailies');

      if (result.success && result.data && result.data.length > 0) {
        const today = result.data[result.data.length - 1]; // Most recent
        healthData.resting_heart_rate = today.restingHeartRateInBeatsPerMinute || today.restingHeartRate || null;

        // Garmin stress is 0-100, we'll convert to approximate HRV-like score
        if (today.averageStressLevel != null) {
          healthData.stress_level = Math.round(today.averageStressLevel / 20); // Convert to 1-5 scale
        }
      }
    } catch (dailiesError) {
      console.error('Error fetching dailies:', dailiesError);
    }

    // If we already know auth failed, return early with clear error
    if (authError && !tokenRefreshAttempted) {
      return res.status(200).json({
        success: false,
        connected: true,
        authError: true,
        requiresReconnect: true,
        error: authError,
        message: 'Please disconnect and reconnect your Garmin account to restore access.'
      });
    }

    // Fetch Sleep data
    try {
      const sleepUrl = `${GARMIN_API_BASE}/wellness-api/rest/sleeps?uploadStartTimeInSeconds=${uploadStartTimeInSeconds}&uploadEndTimeInSeconds=${uploadEndTimeInSeconds}`;
      console.log('Fetching Garmin sleep:', sleepUrl);

      const result = await fetchWithTokenRetry(sleepUrl, 'Sleep');

      if (result.success && result.data && result.data.length > 0) {
        const lastSleep = result.data[result.data.length - 1];
        // Convert seconds to hours
        const totalSleepSeconds = lastSleep.durationInSeconds || lastSleep.sleepDurationInSeconds;
        if (totalSleepSeconds) {
          healthData.sleep_hours = Math.round((totalSleepSeconds / 3600) * 10) / 10;
        }

        // Garmin sleep scores (if available)
        if (lastSleep.overallSleepScore != null) {
          // Convert 0-100 score to 1-5 scale
          healthData.sleep_quality = Math.max(1, Math.min(5, Math.round(lastSleep.overallSleepScore / 20)));
        }

        // HRV during sleep (more accurate than daily stress)
        if (lastSleep.avgSleepStress != null) {
          // Lower sleep stress correlates with higher HRV
          healthData.hrv_score = Math.round(100 - lastSleep.avgSleepStress);
        }
      }
    } catch (sleepError) {
      console.error('Error fetching sleep:', sleepError);
    }

    // Fetch Body Composition (weight) - Garmin allows max 86400 seconds (1 day)
    try {
      const bodyCompUrl = `${GARMIN_API_BASE}/wellness-api/rest/bodyComps?uploadStartTimeInSeconds=${uploadStartTimeInSeconds}&uploadEndTimeInSeconds=${uploadEndTimeInSeconds}`;
      console.log('Fetching Garmin body comp:', bodyCompUrl);

      const result = await fetchWithTokenRetry(bodyCompUrl, 'Body comp');

      if (result.success && result.data && result.data.length > 0) {
        const latest = result.data[result.data.length - 1];
        // Weight is in grams in Garmin API
        if (latest.weightInGrams) {
          healthData.weight_kg = Math.round((latest.weightInGrams / 1000) * 10) / 10;
        }
      }
    } catch (bodyError) {
      console.error('Error fetching body comp:', bodyError);
    }

    // Check if we got any data
    const hasData = Object.values(healthData).some(v => v !== null && v !== 'garmin');

    // If we have an auth error and no data, return the auth error
    if (authError && !hasData) {
      return res.status(200).json({
        success: false,
        connected: true,
        hasData: false,
        authError: true,
        requiresReconnect: true,
        error: authError,
        message: 'Please disconnect and reconnect your Garmin account to restore access.',
        healthData,
        fetchedAt: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      connected: true,
      hasData,
      healthData,
      tokenRefreshed: tokenRefreshAttempted,
      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get health data error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch health data',
      details: error.message
    });
  }
}
