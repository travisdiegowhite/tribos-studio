// Vercel API Route: Secure Wahoo Authentication
// Handles token exchange and storage server-side

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for server operations
);

const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';

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

  try {
    const { action, code, userId } = req.body;

    // Validate required environment variables
    if (!process.env.WAHOO_CLIENT_ID || !process.env.WAHOO_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Wahoo credentials not configured' });
    }

    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(req, res, code, userId);

      case 'disconnect':
        return await disconnectWahoo(req, res, userId);

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

  try {
    // Determine redirect URI based on environment
    const redirectUri = process.env.NODE_ENV === 'production'
      ? process.env.REACT_APP_WAHOO_REDIRECT_URI
      : 'http://localhost:3000/wahoo/callback';

    console.log('Exchanging Wahoo code for token:', {
      hasCode: !!code,
      userId,
      redirectUri,
      clientId: process.env.WAHOO_CLIENT_ID
    });

    // Exchange code with Wahoo
    const response = await fetch(`${WAHOO_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.WAHOO_CLIENT_ID,
        client_secret: process.env.WAHOO_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Wahoo token exchange failed:', error);
      throw new Error(`Wahoo token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    console.log('Wahoo token exchange successful:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in
    });

    // Calculate token expiration
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year

    // Fetch user info from Wahoo
    let userData = null;
    try {
      const userResponse = await fetch('https://api.wahooligan.com/v1/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });

      if (userResponse.ok) {
        userData = await userResponse.json();
        console.log('Wahoo user info fetched:', {
          id: userData.id,
          email: userData.email
        });
      }
    } catch (userError) {
      console.error('Failed to fetch Wahoo user info:', userError);
      // Continue anyway - user info is optional
    }

    // Store tokens and connection in database
    const { error: dbError } = await supabase
      .from('bike_computer_integrations')
      .upsert({
        user_id: userId,
        provider: 'wahoo',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        provider_user_id: userData?.id?.toString() || null,
        provider_user_data: userData || null,
        sync_enabled: true,
        last_sync_at: null,
        sync_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Database error storing Wahoo tokens:', dbError);
      throw new Error('Failed to store authentication data');
    }

    console.log('Wahoo integration stored successfully');

    // Return success without exposing tokens
    return res.status(200).json({
      success: true,
      user: userData ? {
        id: userData.id,
        email: userData.email,
        first: userData.first,
        last: userData.last
      } : null,
      id: userData?.id
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

async function disconnectWahoo(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Delete stored integration
    const { error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'wahoo');

    if (error) {
      console.error('Database error deleting Wahoo integration:', error);
      throw new Error('Failed to disconnect Wahoo');
    }

    console.log('Wahoo integration disconnected successfully');

    return res.status(200).json({
      success: true,
      message: 'Wahoo connection disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}
