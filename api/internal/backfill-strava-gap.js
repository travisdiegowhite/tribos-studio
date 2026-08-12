/**
 * Internal endpoint — backfill the Strava ingest gap for all connected users.
 *
 * Strava deactivated the API application on 2026-06-30 (paid-API policy) and
 * it was reinstated 2026-08-11: every activity webhook in between failed at
 * the fetch step, so ~6 weeks of rides were never imported. Webhooks only
 * cover new activities, so this endpoint pulls the gap window from
 * GET /athlete/activities for each connected user.
 *
 * Travis-only (matches the auth pattern in api/internal/backfill-osm-names.js):
 * Bearer JWT + email allowlist. Idempotent — storeActivities updates existing
 * Strava rows and cross-provider-merges rides already imported via
 * Garmin/Wahoo, so repeated runs are safe.
 *
 * POST /api/internal/backfill-strava-gap
 * Body (optional): { batch?, offset?, after?, before? }
 *   - batch:  users to process this run (default 5, max 10)
 *   - offset: skip the first N users of the ordered target list — pass the
 *             next_offset from the previous response to resume
 *   - after / before: ISO timestamps bounding the gap window
 *             (defaults 2026-06-29T00:00:00Z .. 2026-08-12T00:00:00Z)
 *
 * Returns: { attempted, succeeded, errored, skipped_gated, fetched, stored,
 *            remaining, next_offset, rate_limited, error_samples }
 * Re-invoke with { offset: next_offset } until remaining is 0. If
 * rate_limited is true, wait ~15 minutes before resuming.
 */

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { setupCors } from '../utils/cors.js';
import {
  shouldSkipStravaIngest,
  getValidAccessToken,
  storeActivities,
  calculateAndStoreSpeedProfile,
} from '../strava-activities.js';
import { reportStravaApiFailure } from '../utils/stravaAppStatus.js';

const AUDIT_EMAIL = 'travisdiegowhite@gmail.com';
const DEFAULT_BATCH = 5;
const MAX_BATCH = 10;
const USER_DELAY_MS = 250;
const MAX_PAGES_PER_USER = 5; // 5 × 100 activities >> any user's 6-week gap
const TIME_BUDGET_MS = 45_000; // return early well inside the 60s maxDuration

const DEFAULT_AFTER = '2026-06-29T00:00:00Z'; // day before the app deactivation
const DEFAULT_BEFORE = '2026-08-12T00:00:00Z'; // webhooks verified flowing again

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
// Same list as syncActivities in api/strava-activities.js.
const SUPPORTED_TYPES = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'Run', 'VirtualRun', 'TrailRun'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull the user's gap-window activities from Strava and store them.
 * Returns { fetched, stored, rateLimited }.
 */
async function backfillUser(userId, afterEpoch, beforeEpoch) {
  const accessToken = await getValidAccessToken(userId);

  let fetched = 0;
  let stored = 0;

  for (let page = 1; page <= MAX_PAGES_PER_USER; page++) {
    const url = `${STRAVA_API_BASE}/athlete/activities?after=${afterEpoch}&before=${beforeEpoch}&page=${page}&per_page=100`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      reportStravaApiFailure({
        status: response.status,
        bodyText: errorText,
        endpoint: '/athlete/activities (gap backfill)',
        userId,
      });
      if (response.status === 429) {
        return { fetched, stored, rateLimited: true };
      }
      throw new Error(`Strava API error: ${response.status}`);
    }

    const activities = await response.json();
    fetched += activities.length;

    const supported = activities.filter((a) => SUPPORTED_TYPES.includes(a.type));
    if (supported.length > 0) {
      stored += await storeActivities(userId, supported, 'strava_gap_backfill');
    }

    if (activities.length < 100) break;
  }

  if (stored > 0) {
    await calculateAndStoreSpeedProfile(userId);
  }

  return { fetched, stored, rateLimited: false };
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Auth — require valid JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (user.email?.toLowerCase() !== AUDIT_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const startedAt = Date.now();
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const batch = Math.min(MAX_BATCH, Math.max(1, Number(body.batch) || DEFAULT_BATCH));
  const offset = Math.max(0, Number(body.offset) || 0);

  const after = new Date(body.after || DEFAULT_AFTER);
  const before = new Date(body.before || DEFAULT_BEFORE);
  if (Number.isNaN(after.getTime()) || Number.isNaN(before.getTime()) || after >= before) {
    return res.status(400).json({ error: 'Invalid after/before window' });
  }
  const afterEpoch = Math.floor(after.getTime() / 1000);
  const beforeEpoch = Math.floor(before.getTime() / 1000);

  // Full ordered target list; offset/batch slice it. count gives `remaining`.
  const { data: targets, error: fetchError, count: totalTargets } = await supabase
    .from('bike_computer_integrations')
    .select('user_id', { count: 'exact' })
    .eq('provider', 'strava')
    .eq('sync_enabled', true)
    .order('user_id', { ascending: true })
    .range(offset, offset + batch - 1);
  if (fetchError) {
    return res.status(500).json({ error: 'Fetch failed', detail: fetchError.message });
  }
  if (!targets || targets.length === 0) {
    return res.status(200).json({
      attempted: 0, succeeded: 0, errored: 0, skipped_gated: 0,
      fetched: 0, stored: 0, remaining: 0, next_offset: null,
      rate_limited: false, message: 'Nothing to backfill',
    });
  }

  let attempted = 0;
  let succeeded = 0;
  let errored = 0;
  let skippedGated = 0;
  let totalFetched = 0;
  let totalStored = 0;
  let rateLimited = false;
  const errorSamples = [];

  let processed = 0;
  for (const { user_id: userId } of targets) {
    // Stop early on rate limit or time pressure; unprocessed users stay
    // covered by next_offset.
    if (rateLimited || Date.now() - startedAt > TIME_BUDGET_MS) break;

    processed += 1;

    try {
      if (await shouldSkipStravaIngest(userId)) {
        // Garmin/Wahoo primary with Strava auto-import off — their gap rides
        // arrived via the other provider; importing here would override the
        // user's explicit preference.
        skippedGated += 1;
        continue;
      }

      attempted += 1;
      const result = await backfillUser(userId, afterEpoch, beforeEpoch);
      totalFetched += result.fetched;
      totalStored += result.stored;
      if (result.rateLimited) {
        rateLimited = true;
        // Partial user: don't count as succeeded; re-run picks them up
        // (idempotent), so rewind the cursor to include them.
        processed -= 1;
      } else {
        succeeded += 1;
      }
      console.log(`📦 [gap-backfill] user ${userId}: fetched ${result.fetched}, stored/merged ${result.stored}${result.rateLimited ? ' (rate limited)' : ''}`);
    } catch (err) {
      errored += 1;
      console.error(`❌ [gap-backfill] user ${userId}:`, err.message);
      if (errorSamples.length < 5) errorSamples.push({ userId, error: err.message });
    }

    await sleep(USER_DELAY_MS);
  }

  const nextOffset = offset + processed;
  const remaining = Math.max(0, (totalTargets ?? 0) - nextOffset);

  return res.status(200).json({
    attempted,
    succeeded,
    errored,
    skipped_gated: skippedGated,
    fetched: totalFetched,
    stored: totalStored,
    remaining,
    next_offset: remaining > 0 ? nextOffset : null,
    rate_limited: rateLimited,
    error_samples: errorSamples,
  });
}
