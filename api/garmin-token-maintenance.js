// Vercel API Route: Garmin Token Maintenance
// Runs as a cron job to proactively refresh expiring tokens
// This prevents the "silent token death" problem

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

// How many days before expiry to refresh
// Garmin ACCESS tokens expire in ~24 hours, so we need to be aggressive
const ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS = 1;
// Garmin REFRESH tokens expire in ~90 days - refresh them proactively to prevent silent death
const REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS = 30;

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
    // Find all Garmin integrations that need token refresh:
    // 1. Access token expired or expiring within 1 day
    // 2. Refresh token expiring within 30 days (to prevent silent death for inactive users)
    // We include expired tokens because refresh tokens may still work
    const accessTokenThreshold = new Date();
    accessTokenThreshold.setDate(accessTokenThreshold.getDate() + ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS);

    const refreshTokenThreshold = new Date();
    refreshTokenThreshold.setDate(refreshTokenThreshold.getDate() + REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS);

    // Query 1: Access tokens expiring soon
    const { data: accessTokenExpiring, error: accessError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, refresh_token, token_expires_at, refresh_token_expires_at, provider_user_id, refresh_token_invalid')
      .eq('provider', 'garmin')
      .not('refresh_token', 'is', null)
      .neq('refresh_token_invalid', true)
      .lt('token_expires_at', accessTokenThreshold.toISOString());

    // Query 2: Refresh tokens expiring soon (even if access token is still valid)
    // This catches inactive users before their refresh token expires
    const { data: refreshTokenExpiring, error: refreshError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, refresh_token, token_expires_at, refresh_token_expires_at, provider_user_id, refresh_token_invalid')
      .eq('provider', 'garmin')
      .not('refresh_token', 'is', null)
      .not('refresh_token_expires_at', 'is', null)
      .neq('refresh_token_invalid', true)
      .lt('refresh_token_expires_at', refreshTokenThreshold.toISOString());

    if (accessError || refreshError) {
      console.error('Failed to fetch integrations:', accessError || refreshError);
      return res.status(500).json({ error: 'Database query failed', details: (accessError || refreshError).message });
    }

    // Combine and deduplicate by integration ID
    const allIntegrations = [...(accessTokenExpiring || []), ...(refreshTokenExpiring || [])];
    const uniqueIntegrations = Array.from(
      new Map(allIntegrations.map(i => [i.id, i])).values()
    );

    if (uniqueIntegrations.length === 0) {
      console.log('No tokens need refresh');
      return res.status(200).json({
        success: true,
        message: 'No tokens need refresh',
        ...results
      });
    }

    console.log(`Found ${uniqueIntegrations.length} tokens to check:`);
    console.log(`  - ${accessTokenExpiring?.length || 0} with access token expiring`);
    console.log(`  - ${refreshTokenExpiring?.length || 0} with refresh token expiring`);
    results.checked = uniqueIntegrations.length;

    // Use the combined list
    const expiringIntegrations = uniqueIntegrations;

    // Process each expiring token
    for (const integration of expiringIntegrations) {
      const userId = integration.user_id;
      const accessExpiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
      const refreshExpiresAt = integration.refresh_token_expires_at ? new Date(integration.refresh_token_expires_at) : null;
      const now = new Date();

      const accessDaysUntilExpiry = accessExpiresAt ? Math.ceil((accessExpiresAt - now) / (1000 * 60 * 60 * 24)) : null;
      const refreshDaysUntilExpiry = refreshExpiresAt ? Math.ceil((refreshExpiresAt - now) / (1000 * 60 * 60 * 24)) : null;

      console.log(`\nProcessing user ${userId}:`);
      console.log(`  - Access token expires: ${accessExpiresAt?.toISOString() || 'unknown'} (${accessDaysUntilExpiry ?? 'unknown'} days)`);
      console.log(`  - Refresh token expires: ${refreshExpiresAt?.toISOString() || 'unknown'} (${refreshDaysUntilExpiry ?? 'unknown'} days)`);
      console.log(`  - Has Garmin User ID: ${!!integration.provider_user_id}`);

      // Determine reason for refresh
      const accessExpired = accessExpiresAt && accessExpiresAt < now;
      const refreshExpiringSoon = refreshDaysUntilExpiry !== null && refreshDaysUntilExpiry <= REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS;

      if (accessExpired) {
        console.log('  - Reason: Access token expired, attempting refresh...');
      } else if (refreshExpiringSoon) {
        console.log(`  - Reason: Refresh token expiring in ${refreshDaysUntilExpiry} days, proactive refresh...`);
      } else {
        console.log('  - Reason: Access token expiring soon...');
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

  // Calculate new access token expiration (Garmin tokens last ~24 hours)
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 86400));

  // Calculate refresh token expiration (~90 days)
  const refreshTokenExpiresAt = new Date();
  refreshTokenExpiresAt.setSeconds(
    refreshTokenExpiresAt.getSeconds() + (tokenData.refresh_token_expires_in || 7776000)
  );

  // Update database with new tokens
  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken, // Garmin may return new refresh token
      token_expires_at: expiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('provider', 'garmin');

  if (updateError) {
    return {
      success: false,
      error: `Database update failed: ${updateError.message}`
    };
  }

  return {
    success: true,
    newExpiresAt: expiresAt.toISOString(),
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString()
  };
}
