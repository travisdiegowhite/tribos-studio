// Vercel API Route: Garmin Orphan-Activity Retry
//
// Some Garmin webhook deliveries are incomplete: the first PUSH (CONNECT_ACTIVITY)
// arrives with summary data only, but the follow-up PING (ACTIVITY_FILE_DATA)
// that carries the FIT callbackURL never arrives. The activity is inserted but
// `activity_streams`, `map_summary_polyline`, `ride_analytics`, and power metrics
// stay NULL. The existing webhook-process cron only re-requests backfill when a
// webhook event touches an orphan row — orphans whose second webhook never came
// have no inbound event to trigger that path, so they sit forever.
//
// This cron sweeps the orphan set directly. For each Garmin activity that has
// been NULL on streams for >6h and is still inside Garmin's 30-day backfill
// window, it re-requests backfill for the activity's time window. When Garmin
// delivers, the existing garmin-webhook-process handler picks it up and
// enriches the row.
//
// Bounded by attempts (3) and per-attempt cooldown (12h). After 3 attempts an
// orphan is marked `garmin_fit_unavailable` and stops being retried.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';
import { requestActivityDetailsBackfill } from './utils/garmin/garminApiClient.js';

const supabase = getSupabaseAdmin();

const MAX_ATTEMPTS = 3;
const ATTEMPT_COOLDOWN_HOURS = 12;
const MIN_AGE_HOURS = 6;
const BACKFILL_WINDOW_DAYS = 30;
const MAX_ACTIVITIES_PER_RUN = 50;

export default async function handler(req, res) {
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Orphan Retry Started ===');
  console.log('Time:', new Date().toISOString());

  const results = {
    candidates: 0,
    requested: 0,
    marked_unavailable: 0,
    skipped_cooldown: 0,
    skipped_no_token: 0,
    failed: 0,
    errors: [],
  };

  try {
    const minAgeIso = new Date(Date.now() - MIN_AGE_HOURS * 3600 * 1000).toISOString();
    const windowStartIso = new Date(Date.now() - BACKFILL_WINDOW_DAYS * 86400 * 1000).toISOString();
    const cooldownCutoffMs = Date.now() - ATTEMPT_COOLDOWN_HOURS * 3600 * 1000;

    const { data: orphans, error: queryError } = await supabase
      .from('activities')
      .select('id, user_id, provider_activity_id, start_date, raw_data')
      .eq('provider', 'garmin')
      .is('activity_streams', null)
      .gte('start_date', windowStartIso)
      .lte('created_at', minAgeIso)
      .order('start_date', { ascending: false })
      .limit(MAX_ACTIVITIES_PER_RUN * 2);

    if (queryError) {
      console.error('Failed to query orphan activities:', queryError);
      return res.status(500).json({ error: 'Query failed', details: queryError.message });
    }

    const eligible = (orphans || []).filter((a) => {
      const rd = a.raw_data || {};
      if (rd.source === 'garmin_bulk_export') return false;
      const retry = rd.garmin_orphan_retry || {};
      if (retry.marked_unavailable) return false;
      const lastAttempt = retry.last_attempt_at ? Date.parse(retry.last_attempt_at) : 0;
      if (lastAttempt && lastAttempt > cooldownCutoffMs) {
        results.skipped_cooldown++;
        return false;
      }
      return true;
    }).slice(0, MAX_ACTIVITIES_PER_RUN);

    results.candidates = eligible.length;
    console.log(`Found ${eligible.length} eligible orphan(s) to retry`);

    if (eligible.length === 0) {
      return res.status(200).json({ success: true, ...results });
    }

    const byUser = new Map();
    for (const a of eligible) {
      if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
      byUser.get(a.user_id).push(a);
    }

    for (const [userId, userOrphans] of byUser) {
      const { data: integrations, error: intError } = await supabase
        .from('bike_computer_integrations')
        .select('id, user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, provider_user_id, refresh_token_invalid')
        .eq('provider', 'garmin')
        .eq('user_id', userId)
        .not('refresh_token', 'is', null)
        .neq('refresh_token_invalid', true)
        .order('token_expires_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const integration = integrations?.[0];
      if (intError || !integration) {
        results.skipped_no_token += userOrphans.length;
        continue;
      }

      let accessToken;
      try {
        accessToken = await ensureValidAccessToken(integration, supabase);
      } catch (err) {
        console.warn(`Token refresh failed for user ${userId}:`, err.message);
        results.skipped_no_token += userOrphans.length;
        continue;
      }

      if (!accessToken) {
        results.skipped_no_token += userOrphans.length;
        continue;
      }

      for (const orphan of userOrphans) {
        const startEpoch = Math.floor(new Date(orphan.start_date).getTime() / 1000);
        let backfillOk = false;
        try {
          backfillOk = await requestActivityDetailsBackfill(accessToken, startEpoch);
        } catch (err) {
          console.warn(`Backfill request threw for activity ${orphan.id}:`, err.message);
          results.failed++;
          results.errors.push({ activityId: orphan.id, error: err.message });
        }

        const prevRetry = (orphan.raw_data || {}).garmin_orphan_retry || {};
        const attempts = (prevRetry.attempts || 0) + 1;
        const nowIso = new Date().toISOString();
        const markedUnavailable = attempts >= MAX_ATTEMPTS;

        const nextRetry = {
          attempts,
          last_attempt_at: nowIso,
          last_request_ok: backfillOk,
          marked_unavailable: markedUnavailable,
        };

        const nextRawData = {
          ...(orphan.raw_data || {}),
          garmin_orphan_retry: nextRetry,
          ...(markedUnavailable ? { garmin_fit_unavailable: true } : {}),
        };

        const { error: updateError } = await supabase
          .from('activities')
          .update({ raw_data: nextRawData, updated_at: nowIso })
          .eq('id', orphan.id);

        if (updateError) {
          console.error(`Failed to record retry attempt on activity ${orphan.id}:`, updateError.message);
          results.failed++;
          results.errors.push({ activityId: orphan.id, error: updateError.message });
          continue;
        }

        if (backfillOk) results.requested++;
        if (markedUnavailable) results.marked_unavailable++;
      }
    }

    console.log('=== Garmin Orphan Retry Complete ===', results);
    return res.status(200).json({ success: true, ...results });

  } catch (error) {
    console.error('Orphan retry error:', error);
    return res.status(500).json({ error: 'Orphan retry failed', details: error.message });
  }
}
