// Vercel API Route: Secure Strava Authentication
// Handles token exchange and storage server-side

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for server operations
);

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

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
    const { action, code, userId, refreshToken } = req.body;

    // Validate required environment variables
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Strava credentials not configured' });
    }

    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(req, res, code, userId);

      case 'refresh_token':
        return await refreshAccessToken(req, res, refreshToken, userId);

      case 'get_tokens':
        return await getStoredTokens(req, res, userId);

      case 'revoke_tokens':
        return await revokeTokens(req, res, userId);

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
      throw new Error(`Strava token exchange failed: ${error}`);
    }

    const tokenData = await response.json();

    // Store tokens securely in database
    const { error: dbError } = await supabase
      .from('strava_tokens')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(tokenData.expires_at * 1000),
        athlete_id: tokenData.athlete.id,
        athlete_data: tokenData.athlete,
        updated_at: new Date()
      }, {
        onConflict: 'user_id'
      });

    if (dbError) {
      console.error('Database error storing tokens:', dbError);
      throw new Error('Failed to store authentication data');
    }

    // Return success without exposing tokens
    return res.status(200).json({
      success: true,
      athlete: {
        id: tokenData.athlete.id,
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

async function refreshAccessToken(req, res, refreshToken, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Get stored refresh token if not provided
    let currentRefreshToken = refreshToken;

    if (!currentRefreshToken) {
      const { data: tokenRow, error } = await supabase
        .from('strava_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching stored tokens:', error);
        return res.status(500).json({ error: 'Failed to fetch stored tokens' });
      }

      if (!tokenRow) {
        return res.status(404).json({ error: 'No stored tokens found' });
      }

      currentRefreshToken = tokenRow.refresh_token;
    }

    // Refresh with Strava
    const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: currentRefreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Strava token');
    }

    const tokenData = await response.json();

    // Update stored tokens
    const { error: dbError } = await supabase
      .from('strava_tokens')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(tokenData.expires_at * 1000),
        updated_at: new Date()
      })
      .eq('user_id', userId);

    if (dbError) {
      throw new Error('Failed to update stored tokens');
    }

    return res.status(200).json({
      success: true,
      expiresAt: tokenData.expires_at
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

async function getStoredTokens(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const { data: tokenRow, error } = await supabase
      .from('strava_tokens')
      .select('expires_at, athlete_data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching token status:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!tokenRow) {
      return res.status(200).json({ connected: false });
    }

    // Check if token is still valid (with 5 minute buffer)
    const expiresAt = new Date(tokenRow.expires_at);
    const now = new Date();
    const isExpired = (expiresAt.getTime() - 300000) < now.getTime();

    return res.status(200).json({
      connected: true,
      isExpired,
      athlete: tokenRow.athlete_data,
      lastUpdated: tokenRow.updated_at
    });

  } catch (error) {
    console.error('Get tokens error:', error);
    throw error;
  }
}

async function revokeTokens(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Delete stored tokens
    const { error } = await supabase
      .from('strava_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new Error('Failed to revoke tokens');
    }

    return res.status(200).json({
      success: true,
      message: 'Strava connection revoked'
    });

  } catch (error) {
    console.error('Revoke tokens error:', error);
    throw error;
  }
}