/**
 * Internal endpoint — backfill OSM road names onto user_road_segments.
 *
 * Travis-only (matches the auth pattern in api/internal/fitness-audit.js):
 * Bearer JWT + email allowlist. Idempotent — the WHERE clause filters out
 * rows that already have a road_name, so repeated runs are safe and pick
 * up where the last run left off.
 *
 * POST /api/internal/backfill-osm-names
 * Body (optional): { batch?: number, minRideCount?: number }
 *   - batch: rows to process this run (default 100, max 500)
 *   - minRideCount: only consider segments with ride_count >= N
 *                   (default 0 = all segments, ordered by ride_count DESC)
 *
 * Returns: { attempted, succeeded, no_match, errored, remaining }
 */

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { lookupRoadForSegment } from '../utils/mapboxRoadLookup.js';
import { setupCors } from '../utils/cors.js';

const AUDIT_EMAIL = 'travisdiegowhite@gmail.com';
const DEFAULT_BATCH = 100;
const MAX_BATCH = 500;
const REQUEST_DELAY_MS = 100; // 10 req/s — well under Mapbox's 600/min

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const batch = Math.min(MAX_BATCH, Math.max(1, Number(body.batch) || DEFAULT_BATCH));
  const minRideCount = Math.max(0, Number(body.minRideCount) || 0);

  // Fetch a batch of segments missing road_name, prioritising familiar ones.
  let query = supabase
    .from('user_road_segments')
    .select('id, start_lat, start_lng, end_lat, end_lng, bearing, segment_length_m, ride_count')
    .eq('user_id', user.id)
    .is('road_name', null)
    .order('ride_count', { ascending: false, nullsFirst: false })
    .limit(batch);

  if (minRideCount > 0) {
    query = query.gte('ride_count', minRideCount);
  }

  const { data: segments, error: fetchError } = await query;
  if (fetchError) {
    return res.status(500).json({ error: 'Fetch failed', detail: fetchError.message });
  }
  if (!segments || segments.length === 0) {
    return res.status(200).json({
      attempted: 0, succeeded: 0, no_match: 0, errored: 0, remaining: 0,
      message: 'Nothing to backfill',
    });
  }

  let succeeded = 0;
  let noMatch = 0;
  let errored = 0;
  const errorSamples = [];

  for (const seg of segments) {
    try {
      const result = await lookupRoadForSegment({
        start_lat: Number(seg.start_lat),
        start_lng: Number(seg.start_lng),
        end_lat: Number(seg.end_lat),
        end_lng: Number(seg.end_lng),
        bearing: Number(seg.bearing),
        segment_length_m: Number(seg.segment_length_m),
      });

      if (!result || !result.road_name) {
        noMatch += 1;
      } else {
        const { error: updateError } = await supabase
          .from('user_road_segments')
          .update({
            road_name: result.road_name,
            osm_way_id: result.osm_way_id,
            road_type: result.road_type,
            surface_type: result.surface_type,
          })
          .eq('id', seg.id);

        if (updateError) {
          errored += 1;
          if (errorSamples.length < 5) errorSamples.push(updateError.message);
        } else {
          succeeded += 1;
        }
      }
    } catch (err) {
      errored += 1;
      if (errorSamples.length < 5) errorSamples.push(err.message);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // Count remaining nulls (after this run).
  const { count: remaining } = await supabase
    .from('user_road_segments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('road_name', null);

  return res.status(200).json({
    attempted: segments.length,
    succeeded,
    no_match: noMatch,
    errored,
    remaining: remaining ?? null,
    error_samples: errorSamples,
  });
}
