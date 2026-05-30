/**
 * Garmin Token Maintenance Cron — garmin2 namespace
 * =========================================================================
 *
 * Phase 3 of the Garmin ping/pull rebuild. This is a near-verbatim lift of
 * api/garmin-token-maintenance.js. The logic is sound (already routes through
 * the mutex-aware ensureValidAccessToken which uses the
 * acquire_token_refresh_lock RPC) — the rebuild does not need to change it.
 *
 * What's different from the old endpoint:
 *   - Lives under the garmin2-* namespace alongside the rest of the rebuild
 *     so Phase 7 (cleanup) can delete the entire legacy garmin-* set in one
 *     atomic step without touching the new pipeline.
 *   - The cron entry in vercel.json will switch to point at this path at
 *     Phase 6 cutover.
 *   - Filters integrations the same way the new puller and OAuth flow do
 *     (provider='garmin', refresh_token_invalid != true, refresh_token
 *     not null). Does NOT filter on `status` — that phantom column was the
 *     source of the Phase 7 inert-code bug (see hotfix commit a8f3a43).
 *
 * Schedule (when registered at cutover): every 6 hours, matching the old
 * cron. Garmin access tokens expire in ~24h, refresh tokens in ~90 days.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

const supabase = getSupabaseAdmin();

const ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS = 1;
const REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS = 30;

const SELECT_FIELDS = [
  'id',
  'user_id',
  'access_token',
  'refresh_token',
  'token_expires_at',
  'refresh_token_expires_at',
  'provider_user_id',
  'refresh_token_invalid',
].join(', ');

export default async function handler(req, res) {
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const results = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const accessThreshold = new Date(Date.now() + ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS * 86_400_000);
    const refreshThreshold = new Date(Date.now() + REFRESH_TOKEN_REFRESH_THRESHOLD_DAYS * 86_400_000);

    // Two queries combined: access tokens expiring soon OR refresh tokens
    // expiring soon / unknown. The `OR` on null was the fix for the January
    // 2026 incident where 6 integrations with NULL refresh_token_expires_at
    // were never picked up for proactive refresh.
    const [{ data: accessExpiring, error: aErr }, { data: refreshExpiring, error: rErr }] = await Promise.all([
      supabase
        .from('bike_computer_integrations')
        .select(SELECT_FIELDS)
        .eq('provider', 'garmin')
        .not('refresh_token', 'is', null)
        .neq('refresh_token_invalid', true)
        .lt('token_expires_at', accessThreshold.toISOString()),
      supabase
        .from('bike_computer_integrations')
        .select(SELECT_FIELDS)
        .eq('provider', 'garmin')
        .not('refresh_token', 'is', null)
        .neq('refresh_token_invalid', true)
        .or(`refresh_token_expires_at.is.null,refresh_token_expires_at.lt.${refreshThreshold.toISOString()}`),
    ]);

    if (aErr || rErr) {
      const err = aErr || rErr;
      console.error('garmin2-token-maintenance: query failed:', err);
      return res.status(500).json({ error: 'Database query failed', details: err.message });
    }

    // Dedupe by integration id.
    const all = [...(accessExpiring || []), ...(refreshExpiring || [])];
    const unique = Array.from(new Map(all.map((i) => [i.id, i])).values());
    results.checked = unique.length;

    if (unique.length === 0) {
      return res.status(200).json({ success: true, message: 'No tokens need refresh', ...results, elapsed_ms: Date.now() - startedAt });
    }

    for (const integration of unique) {
      try {
        // ensureValidAccessToken acquires the Postgres-side mutex via
        // acquire_token_refresh_lock RPC so this cron can't race the
        // puller / resync endpoint mid-refresh.
        await ensureValidAccessToken(integration, supabase);
        results.refreshed++;
      } catch (err) {
        results.failed++;
        results.errors.push({
          userId: integration.user_id,
          error: err.message,
          requiresReconnect: /Refresh token may be invalid or revoked/.test(err.message),
        });
      }
    }

    return res.status(200).json({ success: true, ...results, elapsed_ms: Date.now() - startedAt });
  } catch (err) {
    console.error('garmin2-token-maintenance crashed:', err);
    return res.status(500).json({ error: 'Token maintenance failed', details: err.message });
  }
}
