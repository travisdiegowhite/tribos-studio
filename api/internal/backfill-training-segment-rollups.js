/**
 * Internal endpoint — backfill training_segments rollups + (optionally)
 * rebuild auto_name via Map Matching.
 *
 * Travis-only auth. Idempotent. Iterates the caller's training_segments
 * in batches and calls recomputeTrainingSegment() on each.
 *
 * POST /api/internal/backfill-training-segment-rollups
 * Body (optional): { batch?: number, rebuildName?: boolean, offset?: number }
 *   - batch: rows to process this run (default 50, max 250)
 *   - rebuildName: also run Map Matching for auto_name (default false —
 *                  set true on a one-shot pass to fix generic names)
 *   - offset: cursor into the segment list (default 0)
 *
 * Returns: { attempted, succeeded, errored, remaining, next_offset }
 */

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { recomputeTrainingSegment } from '../utils/trainingSegmentRollup.js';
import { setupCors } from '../utils/cors.js';

const AUDIT_EMAIL = 'travisdiegowhite@gmail.com';
const DEFAULT_BATCH = 50;
const MAX_BATCH = 250;
const DELAY_NO_NAME_MS = 20;   // recompute is cheap — token bucket only
const DELAY_WITH_NAME_MS = 250; // Map Matching: 4/s, well under 600/min

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

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
  const rebuildName = body.rebuildName === true;
  const offset = Math.max(0, Number(body.offset) || 0);

  const { data: segments, error: fetchError, count } = await supabase
    .from('training_segments')
    .select('id', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .range(offset, offset + batch - 1);

  if (fetchError) {
    return res.status(500).json({ error: 'Fetch failed', detail: fetchError.message });
  }

  if (!segments || segments.length === 0) {
    return res.status(200).json({
      attempted: 0, succeeded: 0, errored: 0,
      remaining: 0, next_offset: offset,
      message: 'No segments at this offset',
    });
  }

  const delay = rebuildName ? DELAY_WITH_NAME_MS : DELAY_NO_NAME_MS;
  let succeeded = 0;
  let errored = 0;
  const errorSamples = [];

  for (const seg of segments) {
    try {
      await recomputeTrainingSegment(supabase, seg.id, { rebuildName });
      succeeded += 1;
    } catch (err) {
      errored += 1;
      if (errorSamples.length < 5) errorSamples.push(err.message);
    }
    await sleep(delay);
  }

  const nextOffset = offset + segments.length;
  const remaining = Math.max(0, (count ?? 0) - nextOffset);

  return res.status(200).json({
    attempted: segments.length,
    succeeded,
    errored,
    remaining,
    next_offset: nextOffset,
    total: count ?? null,
    error_samples: errorSamples,
  });
}
