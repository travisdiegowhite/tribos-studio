// Vercel API Route: Account Deletion
// Handles complete user account deletion including OAuth token revocation
// and cascading data cleanup via Supabase auth.admin.deleteUser()

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

// Initialize Supabase with service role (server-side only)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

// Helper to get user from Authorization header
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

// Attempt to revoke Strava OAuth tokens
async function revokeStravaTokens(userId) {
  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .maybeSingle();

    if (error || !integration) {
      console.log('No Strava integration found for user:', userId);
      return { revoked: false, reason: 'no_integration' };
    }

    if (integration.access_token) {
      try {
        // Refresh token if expired before deauthorizing
        let accessToken = integration.access_token;
        const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
        const now = new Date();

        if (expiresAt && expiresAt.getTime() < now.getTime() && integration.refresh_token) {
          console.log('Refreshing expired Strava token before deauthorization...');
          const refreshResponse = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: process.env.STRAVA_CLIENT_ID,
              client_secret: process.env.STRAVA_CLIENT_SECRET,
              refresh_token: integration.refresh_token,
              grant_type: 'refresh_token'
            })
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            accessToken = refreshData.access_token;
          }
        }

        // Call Strava deauthorize endpoint
        console.log('Calling Strava deauthorize endpoint...');
        const deauthResponse = await fetch(`${STRAVA_OAUTH_BASE}/deauthorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `access_token=${accessToken}`
        });

        if (deauthResponse.ok) {
          console.log('Strava access token successfully revoked');
          return { revoked: true };
        } else {
          const errorText = await deauthResponse.text();
          console.error('Strava deauthorize response:', deauthResponse.status, errorText);
          return { revoked: false, reason: 'deauth_failed', status: deauthResponse.status };
        }
      } catch (deauthError) {
        console.error('Error calling Strava deauthorize:', deauthError.message);
        return { revoked: false, reason: 'deauth_error', error: deauthError.message };
      }
    }

    return { revoked: false, reason: 'no_access_token' };
  } catch (err) {
    console.error('Error in revokeStravaTokens:', err.message);
    return { revoked: false, reason: 'error', error: err.message };
  }
}

// Attempt to revoke Garmin OAuth tokens
async function revokeGarminTokens(userId) {
  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    if (error || !integration) {
      console.log('No Garmin integration found for user:', userId);
      return { revoked: false, reason: 'no_integration' };
    }

    // Garmin OAuth 2.0 does not expose a public token revocation endpoint.
    // We delete the local integration record, which effectively disconnects the user.
    // The tokens will expire naturally on Garmin's side.
    console.log('Garmin integration found - will be deleted with account cascade');
    return { revoked: true, method: 'local_delete' };
  } catch (err) {
    console.error('Error in revokeGarminTokens:', err.message);
    return { revoked: false, reason: 'error', error: err.message };
  }
}

// Attempt to revoke Wahoo OAuth tokens
async function revokeWahooTokens(userId) {
  try {
    const { data: integration, error } = await supabase
      .from('bike_computer_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'wahoo')
      .maybeSingle();

    if (error || !integration) {
      console.log('No Wahoo integration found for user:', userId);
      return { revoked: false, reason: 'no_integration' };
    }

    // Wahoo does not expose a public token revocation endpoint.
    // The integration record will be deleted with the account cascade.
    console.log('Wahoo integration found - will be deleted with account cascade');
    return { revoked: true, method: 'local_delete' };
  } catch (err) {
    console.error('Error in revokeWahooTokens:', err.message);
    return { revoked: false, reason: 'error', error: err.message };
  }
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user via Bearer token
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized. Please provide a valid Bearer token.',
        code: 'UNAUTHORIZED'
      });
    }

    const userId = user.id;
    console.log('Account deletion requested for user:', userId);

    // Step 1: Revoke third-party OAuth tokens (best effort)
    // These are attempted before account deletion because we need the
    // integration records to look up tokens, and those records will be
    // cascade-deleted when the user is removed.
    const [stravaResult, garminResult, wahooResult] = await Promise.allSettled([
      revokeStravaTokens(userId),
      revokeGarminTokens(userId),
      revokeWahooTokens(userId)
    ]);

    const tokenRevocation = {
      strava: stravaResult.status === 'fulfilled' ? stravaResult.value : { revoked: false, reason: 'promise_rejected' },
      garmin: garminResult.status === 'fulfilled' ? garminResult.value : { revoked: false, reason: 'promise_rejected' },
      wahoo: wahooResult.status === 'fulfilled' ? wahooResult.value : { revoked: false, reason: 'promise_rejected' }
    };

    console.log('Token revocation results:', JSON.stringify(tokenRevocation));

    // Step 2: Delete the user via Supabase auth admin
    // This cascades deletes on all tables with ON DELETE CASCADE
    // (activities, routes, training_plans, planned_workouts, gear_items,
    //  gear_components, conversation_threads, coach_conversations,
    //  bike_computer_integrations, user_profiles, etc.)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Failed to delete user:', deleteError);
      return res.status(500).json({
        error: 'Failed to delete account. Please try again or contact support.',
        code: 'DELETE_FAILED',
        details: process.env.NODE_ENV === 'development' ? deleteError.message : undefined
      });
    }

    console.log('Account successfully deleted for user:', userId);

    return res.status(200).json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
      tokenRevocation
    });

  } catch (error) {
    console.error('Account deletion error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during account deletion. Please try again or contact support.',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
