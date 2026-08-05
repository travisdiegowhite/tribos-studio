// Vercel API Route: Activity Streams
//
// GET /api/activity-streams?activityId=<uuid>
//
// Serves the normalized time-series streams for one activity at the best
// fidelity available, for the flagship activity analysis chart. Resolution
// ladder (see api/utils/activityStreams.js for shapes and rationale):
//
//   1. Storage cache hit ({user_id}/{activity_id}.v1.json in the private
//      `activity-streams` bucket — see migration 107)
//   2. Raw FIT re-parse from fit_storage_path (per-second, real timestamps)
//   3. Faithful 1 Hz stored streams (indoor ingest path)
//   4. Strava streams API on demand (per-second; cached so Strava is hit
//      at most once per activity)
//   5. fit_coach_context.time_series (5–60 s, real time axis)
//   6. RDP-simplified activity_streams (distance axis only)
//   7. Nothing → tier 'summary' (client renders stats without the chart)
//
// Read-only with respect to the ingest pipelines: this endpoint never
// mutates activity rows, only reads Storage/DB and writes its own cache
// objects.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { parseFitFile } from './utils/fitParser.js';
import {
  STREAM_CACHE_BUCKET,
  streamCachePath,
  hasFaithfulStoredStreams,
  normalizeFromFitDataPoints,
  normalizeFromStoredStreams,
  normalizeFromStravaStreams,
  normalizeFromCoachContext,
  normalizeSimplifiedStreams,
  decimateToCap,
} from './utils/activityStreams.js';

const supabase = getSupabaseAdmin();

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }
  return user;
}

// ── Strava access (mirrors getValidAccessToken in api/strava-webhook.js:728;
//    module-local there, so the refresh logic is copied — keep in sync) ─────

async function getStravaToken(userId) {
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('provider', 'strava')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !integration) return null;

  if (new Date(integration.token_expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return integration.access_token;
  }
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    }),
  });
  if (!resp.ok) {
    console.error('Strava token refresh failed:', await resp.text());
    return null;
  }
  const tokenData = await resp.json();
  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);
  return tokenData.access_token;
}

const STRAVA_STREAM_KEYS = 'time,distance,latlng,altitude,velocity_smooth,watts,heartrate,cadence';

/** One attempt, no retry loops in serverless: any failure returns null and
 *  the ladder degrades to the next tier. */
async function fetchStravaStreams(userId, stravaActivityId) {
  const token = await getStravaToken(userId);
  if (!token) return null;
  const url = `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=${STRAVA_STREAM_KEYS}&key_by_type=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    console.warn(`Strava streams fetch failed (${resp.status}) for activity ${stravaActivityId}`);
    return null;
  }
  return await resp.json();
}

async function buildFromFitStorage(row) {
  const { data, error } = await supabase.storage.from('garmin-fit').download(row.fit_storage_path);
  if (error || !data) {
    console.warn(`FIT download failed for ${row.fit_storage_path}: ${error?.message}`);
    return null;
  }
  try {
    const buffer = Buffer.from(await data.arrayBuffer());
    const parsed = await parseFitFile(buffer);
    return normalizeFromFitDataPoints(parsed.allDataPoints);
  } catch (parseError) {
    console.warn(`FIT re-parse failed for ${row.fit_storage_path}: ${parseError.message}`);
    return null;
  }
}

/** Best-effort cache write — a failure must never fail the response. */
async function writeCache(path, payload) {
  try {
    const { error } = await supabase.storage
      .from(STREAM_CACHE_BUCKET)
      .upload(path, JSON.stringify(payload), {
        contentType: 'application/json',
        upsert: true,
      });
    if (error) console.warn(`Stream cache write failed for ${path}: ${error.message}`);
  } catch (e) {
    console.warn(`Stream cache write failed for ${path}: ${e.message}`);
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { activityId } = req.query;
  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  try {
    const authUser = await getUserFromAuthHeader(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: row, error: rowError } = await supabase
      .from('activities')
      .select(
        'id, user_id, provider, moving_time, elapsed_time, fit_storage_path, ' +
          'activity_streams, fit_coach_context, ' +
          'stravaIdA:raw_data->>id, stravaIdB:raw_data->strava_data->>id'
      )
      .eq('id', activityId)
      .single();

    if (rowError || !row) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    if (row.user_id !== authUser.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');

    // 1. Cache hit
    const cachePath = streamCachePath(row.user_id, row.id);
    const cached = await supabase.storage.from(STREAM_CACHE_BUCKET).download(cachePath);
    if (cached?.data) {
      try {
        return res.status(200).json(JSON.parse(await cached.data.text()));
      } catch {
        console.warn(`Corrupt stream cache object at ${cachePath} — rebuilding`);
      }
    }

    // 2–6. Resolution ladder — each tier is attempted in order when its
    // preconditions hold; a failed expensive tier (FIT parse, Strava API)
    // degrades to the next with a flag instead of erroring.
    const stravaId = row.stravaIdA || row.stravaIdB;
    let payload = null;
    let degraded = false;
    let cacheable = false;

    if (row.fit_storage_path) {
      payload = await buildFromFitStorage(row);
      if (payload) cacheable = true;
      else degraded = true;
    }
    if (!payload && hasFaithfulStoredStreams(row)) {
      payload = normalizeFromStoredStreams(row.activity_streams);
    }
    if (!payload && stravaId) {
      const streams = await fetchStravaStreams(row.user_id, stravaId);
      payload = streams ? normalizeFromStravaStreams(streams) : null;
      if (payload) cacheable = true;
      else degraded = true;
    }
    if (!payload) {
      payload = normalizeFromCoachContext(row.fit_coach_context);
    }
    if (!payload && row.activity_streams) {
      payload = normalizeSimplifiedStreams(row.activity_streams);
    }

    if (!payload) {
      return res.status(200).json({ version: 1, tier: 'summary', source: 'none' });
    }

    if (degraded && payload.tier !== 'per_second') payload.tier_degraded = true;
    payload = decimateToCap(payload);

    // Cache only the expensive tiers (FIT parse, Strava API) — the cheap
    // ones are faster to rebuild than to round-trip through Storage.
    if (cacheable) await writeCache(cachePath, payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Activity streams API error:', error);
    return res.status(500).json({
      error: 'Failed to load activity streams',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
