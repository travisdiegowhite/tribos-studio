// Vercel API Route: Garmin Token Maintenance
// Runs as a cron job to proactively refresh expiring tokens
// This prevents the "silent token death" problem

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

// How many days before expiry to refresh (7 days gives us buffer)
const REFRESH_THRESHOLD_DAYS = 7;

export default async function handler(req, res) {
  // Verify this is a legitimate cron request or admin request
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Allow: Vercel cron (no auth needed from same origin), or Bearer token match
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isValidSecret) {
    console.log('Unauthorized token maintenance request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Token Maintenance Started ===');
  console.log('Time:', new Date().toISOString());

  const results = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Find all Garmin integrations with tokens expiring within threshold
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + REFRESH_THRESHOLD_DAYS);

    const { data: expiringIntegrations, error: fetchError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, refresh_token, token_expires_at, provider_user_id')
      .eq('provider', 'garmin')
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', thresholdDate.toISOString());

    if (fetchError) {
      console.error('Failed to fetch integrations:', fetchError);
      return res.status(500).json({ error: 'Database query failed', details: fetchError.message });
    }

    if (!expiringIntegrations || expiringIntegrations.length === 0) {
      console.log('No tokens expiring within', REFRESH_THRESHOLD_DAYS, 'days');
      return res.status(200).json({
        success: true,
        message: 'No tokens need refresh',
        ...results
      });
    }

    console.log(`Found ${expiringIntegrations.length} tokens to check`);
    results.checked = expiringIntegrations.length;

    // Process each expiring token
    for (const integration of expiringIntegrations) {
      const userId = integration.user_id;
      const expiresAt = new Date(integration.token_expires_at);
      const daysUntilExpiry = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));

      console.log(`\nProcessing user ${userId}:`);
      console.log(`  - Token expires: ${expiresAt.toISOString()} (${daysUntilExpiry} days)`);
      console.log(`  - Has Garmin User ID: ${!!integration.provider_user_id}`);

      // Skip if already expired (needs manual reconnect)
      if (expiresAt < new Date()) {
        console.log('  - SKIPPED: Token already expired, needs reconnect');
        results.skipped++;
        results.errors.push({
          userId,
          error: 'Token already expired - user needs to reconnect',
          expiresAt: expiresAt.toISOString()
        });
        continue;
      }

      try {
        // Attempt token refresh
        const refreshResult = await refreshGarminToken(userId, integration.refresh_token);

        if (refreshResult.success) {
          console.log('  - SUCCESS: Token refreshed');
          results.refreshed++;
        } else {
          console.log('  - FAILED:', refreshResult.error);
          results.failed++;
          results.errors.push({
            userId,
            error: refreshResult.error,
            requiresReconnect: refreshResult.requiresReconnect
          });
        }
      } catch (err) {
        console.error('  - ERROR:', err.message);
        results.failed++;
        results.errors.push({
          userId,
          error: err.message
        });
      }
    }

    console.log('\n=== Garmin Token Maintenance Complete ===');
    console.log(`Checked: ${results.checked}`);
    console.log(`Refreshed: ${results.refreshed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped: ${results.skipped}`);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Token maintenance error:', error);
    return res.status(500).json({
      error: 'Token maintenance failed',
      details: error.message
    });
  }
}

async function refreshGarminToken(userId, refreshToken) {
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GARMIN_CONSUMER_KEY,
    client_secret: process.env.GARMIN_CONSUMER_SECRET,
    refresh_token: refreshToken
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
    console.error('Token refresh failed:', response.status, errorText);

    // Check if refresh token was revoked
    const isRevoked = errorText.includes('invalid_grant') ||
                      errorText.includes('revoked') ||
                      response.status === 400;

    return {
      success: false,
      error: `Garmin returned ${response.status}: ${errorText}`,
      requiresReconnect: isRevoked
    };
  }

  const tokenData = await response.json();

  // Calculate new expiration (default 90 days)
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 7776000));

  // Update database with new tokens
  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken, // Garmin may return new refresh token
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
      sync_error: null // Clear any previous errors
    })
    .eq('user_id', userId)
    .eq('provider', 'garmin');

  if (updateError) {
    return {
      success: false,
      error: `Database update failed: ${updateError.message}`
    };
  }

  return { success: true, newExpiresAt: expiresAt.toISOString() };
}
