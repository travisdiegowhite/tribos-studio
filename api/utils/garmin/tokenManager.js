/**
 * Garmin OAuth token management
 * Handles proactive token refresh with mutex locking
 */

const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

/**
 * Ensure the integration has a valid access token, refreshing if needed.
 *
 * @param {object} integration - Integration record from bike_computer_integrations
 * @param {object} supabase - Supabase client instance
 * @returns {Promise<string>} Valid access token
 * @throws {Error} If token refresh fails and user needs to reconnect
 */
export async function ensureValidAccessToken(integration, supabase) {
  // Check if token_expires_at is valid
  if (!integration.token_expires_at) {
    console.log('⚠️ No token expiration date found, assuming token needs refresh');
  } else {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    if (expiresAt > sixHoursFromNow) {
      console.log('✅ Token still valid, expires:', expiresAt.toISOString());
      return integration.access_token;
    }

    console.log('🔄 Token expired or expiring within 6 hours, refreshing...');
    console.log('   Token expires at:', expiresAt.toISOString());
    console.log('   Current time:', now.toISOString());
  }

  if (!process.env.GARMIN_CONSUMER_KEY || !process.env.GARMIN_CONSUMER_SECRET) {
    throw new Error('Missing Garmin API credentials (GARMIN_CONSUMER_KEY or GARMIN_CONSUMER_SECRET)');
  }

  if (!integration.refresh_token) {
    throw new Error('No refresh token available. User needs to reconnect Garmin account.');
  }

  // === MUTEX: Acquire lock via Postgres FOR UPDATE RPC ===
  const { data: lockResult, error: lockError } = await supabase.rpc('acquire_token_refresh_lock', {
    p_integration_id: integration.id,
    p_lock_duration_seconds: 30
  });

  if (lockError) {
    console.warn('⚠️ Lock RPC error, falling back to direct lock:', lockError.message);
    // Fallback: try direct update if RPC not yet deployed
    const { data: fallbackLock } = await supabase
      .from('bike_computer_integrations')
      .update({ refresh_lock_until: new Date(Date.now() + 30000).toISOString() })
      .eq('id', integration.id)
      .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${new Date().toISOString()}`)
      .select('id')
      .maybeSingle();

    if (!fallbackLock) {
      throw new Error('Token refresh lock held by another process. Will retry on next attempt.');
    }
    console.log('🔒 Acquired token refresh lock (fallback)');
  } else if (!lockResult?.acquired) {
    if (lockResult?.reason === 'locked') {
      // Another process is refreshing — wait and check if it succeeded
      console.log('🔒 Token refresh in progress by another process, waiting...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const { data: refreshedIntegration } = await supabase
        .from('bike_computer_integrations')
        .select('access_token, token_expires_at')
        .eq('id', integration.id)
        .single();

      if (refreshedIntegration?.token_expires_at) {
        const newExpiresAt = new Date(refreshedIntegration.token_expires_at);
        if (newExpiresAt > new Date(Date.now() + 60000)) {
          console.log('✅ Token was refreshed by another process');
          return refreshedIntegration.access_token;
        }
      }

      // Other process failed — do NOT proceed, let retry handle it
      throw new Error('Token refresh lock held by another process that may have failed. Will retry on next attempt.');
    }
    throw new Error(`Could not acquire token refresh lock: ${lockResult?.reason || 'unknown'}`);
  } else {
    console.log('🔒 Acquired token refresh lock');
  }

  // === Perform the actual token refresh ===
  console.log('🔄 Refreshing Garmin access token...');

  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GARMIN_CONSUMER_KEY,
      client_secret: process.env.GARMIN_CONSUMER_SECRET,
      refresh_token: integration.refresh_token
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Garmin token refresh failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });

    if (response.status === 400 || response.status === 401) {
      console.log('🚫 Marking refresh token as invalid for integration:', integration.id);
      await supabase
        .from('bike_computer_integrations')
        .update({
          refresh_lock_until: null,
          refresh_token_invalid: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);

      throw new Error(`Token refresh rejected (${response.status}). Refresh token may be invalid or revoked. User needs to reconnect Garmin.`);
    }

    await supabase
      .from('bike_computer_integrations')
      .update({ refresh_lock_until: null })
      .eq('id', integration.id);

    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const tokenData = await response.json();

  const expiresInSeconds = tokenData.expires_in || 86400;
  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const refreshTokenExpiresInSeconds = tokenData.refresh_token_expires_in || 7776000;
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresInSeconds * 1000).toISOString();

  console.log('✅ Token refreshed successfully');
  console.log('   New access token expiration:', newExpiresAt);
  console.log('   Refresh token expiration:', refreshTokenExpiresAt);

  const { error: updateError } = await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      refresh_lock_until: null,
      refresh_token_invalid: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', integration.id);

  if (updateError) {
    console.error('❌ CRITICAL: Failed to update tokens in database:', updateError);
    throw new Error(`Failed to persist refreshed tokens: ${updateError.message || updateError}`);
  }

  console.log('✅ Tokens persisted to database');
  return tokenData.access_token;
}
