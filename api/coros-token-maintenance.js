// Vercel API Route: COROS Token Maintenance
// Runs as a cron job to proactively refresh expiring access tokens
// COROS access tokens last 30 days; refresh tokens never expire

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';

const supabase = getSupabaseAdmin();

const COROS_API_BASE = process.env.COROS_API_BASE || 'https://open.coros.com';

// Refresh tokens expiring within 7 days
const REFRESH_THRESHOLD_DAYS = 7;

export default async function handler(req, res) {
  // Verify cron authorization (timing-safe)
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== COROS Token Maintenance Started ===');
  console.log('Time:', new Date().toISOString());

  const results = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    errors: []
  };

  try {
    if (!process.env.COROS_CLIENT_ID || !process.env.COROS_CLIENT_SECRET) {
      console.log('COROS not configured, skipping maintenance');
      return res.status(200).json({
        success: true,
        message: 'COROS not configured',
        ...results
      });
    }

    // Find COROS integrations with tokens expiring within threshold
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + REFRESH_THRESHOLD_DAYS);

    const { data: expiringIntegrations, error: queryError } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, refresh_token, token_expires_at, provider_user_id')
      .eq('provider', 'coros')
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', threshold.toISOString());

    if (queryError) {
      console.error('Failed to fetch integrations:', queryError);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!expiringIntegrations || expiringIntegrations.length === 0) {
      console.log('No COROS tokens need refresh');
      return res.status(200).json({
        success: true,
        message: 'No tokens need refresh',
        ...results
      });
    }

    results.checked = expiringIntegrations.length;
    console.log(`Found ${expiringIntegrations.length} COROS tokens to refresh`);

    for (const integration of expiringIntegrations) {
      const userId = integration.user_id;
      const expiresAt = new Date(integration.token_expires_at);
      const daysUntilExpiry = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));

      console.log(`\nProcessing user ${userId}:`);
      console.log(`  - Token expires: ${expiresAt.toISOString()} (${daysUntilExpiry} days)`);

      try {
        const refreshResult = await refreshCorosToken(userId, integration.refresh_token);

        if (refreshResult.success) {
          console.log('  - SUCCESS: Token refreshed');
          results.refreshed++;
        } else {
          console.log('  - FAILED:', refreshResult.error);
          results.failed++;
          results.errors.push({ userId, error: refreshResult.error });
        }
      } catch (err) {
        console.error('  - ERROR:', err.message);
        results.failed++;
        results.errors.push({ userId, error: err.message });
      }
    }

    console.log('\n=== COROS Token Maintenance Complete ===');
    console.log(`Checked: ${results.checked}, Refreshed: ${results.refreshed}, Failed: ${results.failed}`);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('COROS token maintenance error:', error);
    return res.status(500).json({
      error: 'Token maintenance failed',
      details: error.message
    });
  }
}

async function refreshCorosToken(userId, refreshToken) {
  const response = await fetch(`${COROS_API_BASE}/oauth2/refresh-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: process.env.COROS_CLIENT_ID,
      client_secret: process.env.COROS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `COROS returned ${response.status}: ${errorText}`
    };
  }

  const result = await response.json();

  if (result.result !== '0000') {
    return {
      success: false,
      error: `COROS refresh failed: ${result.message || 'Unknown error'}`
    };
  }

  // COROS refresh extends access token validity by 30 days from now
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('provider', 'coros');

  if (updateError) {
    return {
      success: false,
      error: `Database update failed: ${updateError.message}`
    };
  }

  return {
    success: true,
    newExpiresAt: expiresAt.toISOString()
  };
}
