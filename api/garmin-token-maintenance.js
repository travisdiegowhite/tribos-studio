// Vercel API Route: Garmin Token Maintenance
// Runs as a cron job to proactively refresh expiring tokens
// This prevents the "silent token death" problem

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

const supabase = getSupabaseAdmin();

// How many days before expiry to refresh
// Garmin ACCESS tokens expire in ~24 hours, so we need to be aggressive
const ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS = 1;
// Garmin REFRESH tokens expire in ~90 days - refresh them proactively to prevent silent death
const REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS = 30;

export default async function handler(req, res) {
  // Verify this is a legitimate cron request or admin request
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
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

    const selectFields = 'id, user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, provider_user_id, refresh_token_invalid';

    // Query 1: Access tokens expiring soon
    const { data: accessTokenExpiring, error: accessError } = await supabase
      .from('bike_computer_integrations')
      .select(selectFields)
      .eq('provider', 'garmin')
      .not('refresh_token', 'is', null)
      .neq('refresh_token_invalid', true)
      .lt('token_expires_at', accessTokenThreshold.toISOString());

    // Query 2: Refresh tokens expiring soon OR unknown. The original query
    // required `refresh_token_expires_at IS NOT NULL`, which made it blind
    // to integrations created by the older OAuth flow that never populated
    // that column — exactly the 6 cyclist integrations that died silently
    // in January 2026 (refresh_token_expires_at NULL → never picked up
    // proactively → access token expired → refresh failed → marked invalid).
    const { data: refreshTokenExpiring, error: refreshError } = await supabase
      .from('bike_computer_integrations')
      .select(selectFields)
      .eq('provider', 'garmin')
      .not('refresh_token', 'is', null)
      .neq('refresh_token_invalid', true)
      .or(`refresh_token_expires_at.is.null,refresh_token_expires_at.lt.${refreshTokenThreshold.toISOString()}`);

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
        // Delegate to the shared mutex-aware helper. Previously this cron had
        // its own `refreshGarminToken` that bypassed `acquire_token_refresh_lock`,
        // so a webhook-driven refresh in `ensureValidAccessToken` and this cron
        // could run concurrently. With Garmin's refresh-token rotation, the
        // loser stored a stale refresh_token and the next call returned 400 —
        // a latent path to silent token death.
        await ensureValidAccessToken(integration, supabase);
        console.log('  - SUCCESS: Token refreshed');
        results.refreshed++;
      } catch (err) {
        console.error('  - ERROR:', err.message);
        results.failed++;
        results.errors.push({
          userId,
          error: err.message,
          requiresReconnect: /Refresh token may be invalid or revoked/.test(err.message)
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

