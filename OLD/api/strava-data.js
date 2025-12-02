// Vercel API Route: Secure Strava Data Access
// Handles Strava API calls with server-side token management

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    return res.status(200).json({}).end();
  }

  try {
    const { userId, endpoint, options = {} } = req.method === 'GET' ? req.query : req.body;

    if (!userId) {
      return res.status(400).json({ error: 'UserId required' });
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Not connected to Strava or tokens expired' });
    }

    // Route to appropriate handler
    switch (endpoint) {
      case 'athlete':
        return await getAthlete(res, accessToken);

      case 'activities':
        return await getActivities(res, accessToken, options);

      case 'activity':
        if (!options.activityId) {
          return res.status(400).json({ error: 'Activity ID required' });
        }
        return await getActivity(res, accessToken, options.activityId);

      case 'streams':
        if (!options.activityId) {
          return res.status(400).json({ error: 'Activity ID required' });
        }
        return await getActivityStreams(res, accessToken, options.activityId, options.types);

      default:
        return res.status(400).json({ error: 'Invalid endpoint' });
    }

  } catch (error) {
    console.error('Strava data error:', error);

    return res.status(500).json({
      error: 'Failed to fetch Strava data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function getValidAccessToken(userId) {
  try {
    // Get stored tokens
    const { data: tokenRow, error } = await supabase
      .from('strava_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !tokenRow) {
      console.log('No stored tokens found for user:', userId);
      return null;
    }

    // Check if token needs refresh (with 1 hour buffer for reliability)
    const expiresAt = new Date(tokenRow.expires_at);
    const now = new Date();
    const shouldRefresh = (expiresAt.getTime() - 3600000) < now.getTime();

    if (!shouldRefresh) {
      return tokenRow.access_token;
    }

    // Token needs refresh, refreshing proactively
    console.log('Token expiring soon, refreshing for user:', userId);

    // Fix URL construction for production environment
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const refreshResponse = await fetch(`${baseUrl}/api/strava-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'refresh_token',
        userId: userId,
        refreshToken: tokenRow.refresh_token
      })
    });

    if (!refreshResponse.ok) {
      console.error('Failed to refresh token');
      return null;
    }

    // Get the refreshed token
    const { data: newTokenRow, error: newError } = await supabase
      .from('strava_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (newError || !newTokenRow) {
      console.error('Failed to get refreshed token');
      return null;
    }

    return newTokenRow.access_token;

  } catch (error) {
    console.error('Error getting valid access token:', error);
    return null;
  }
}

async function getAthlete(res, accessToken) {
  const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  const data = await response.json();
  return res.status(200).json({ success: true, data });
}

async function getActivities(res, accessToken, options) {
  const params = new URLSearchParams({
    per_page: options.perPage || 30,
    page: options.page || 1
  });

  if (options.after) {
    params.append('after', Math.floor(new Date(options.after).getTime() / 1000));
  }

  if (options.before) {
    params.append('before', Math.floor(new Date(options.before).getTime() / 1000));
  }

  const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  const data = await response.json();
  return res.status(200).json({ success: true, data });
}

async function getActivity(res, accessToken, activityId) {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  const data = await response.json();
  return res.status(200).json({ success: true, data });
}

async function getActivityStreams(res, accessToken, activityId, types = ['latlng', 'time', 'altitude', 'heartrate', 'watts']) {
  const response = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${types.join(',')}&key_by_type=true`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  const data = await response.json();
  return res.status(200).json({ success: true, data });
}