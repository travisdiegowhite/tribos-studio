/**
 * Training segment rollup wrapper.
 *
 * Calls the Postgres functions installed by migration 092
 * (`recompute_training_segment_rollup` and `recompute_training_segment_profile`)
 * to refresh ride_count + frequency_tier from training_segment_rides as
 * the source of truth. Optionally rebuilds `auto_name` (road names via
 * Mapbox Map Matching, see segmentNaming.js) when called with
 * `rebuildName: true` (typically only on first traversal of a new segment).
 */

import { nameTrainingSegment } from './segmentNaming.js';

/**
 * @param {object} supabase  Supabase admin client (singleton).
 * @param {string} segmentId
 * @param {object} [opts]
 * @param {boolean} [opts.rebuildName=false]
 */
export async function recomputeTrainingSegment(supabase, segmentId, opts = {}) {
  const { rebuildName = false } = opts;

  // Rollup + profile: cheap (sub-ms each on a single segment).
  const { error: rollupErr } = await supabase.rpc(
    'recompute_training_segment_rollup',
    { p_segment_id: segmentId }
  );
  if (rollupErr) {
    console.warn('[TrainingSegmentRollup] rollup rpc failed:', rollupErr.message);
  }

  const { error: profileErr } = await supabase.rpc(
    'recompute_training_segment_profile',
    { p_segment_id: segmentId }
  );
  if (profileErr) {
    console.warn('[TrainingSegmentRollup] profile rpc failed:', profileErr.message);
  }

  if (!rebuildName) return;

  // Rebuild auto_name from the segment's stored geojson: road names via
  // Map Matching, the start's place as a fallback. Never touches
  // custom_name and never downgrades a name it cannot improve on.
  try {
    await nameTrainingSegment(supabase, segmentId);
  } catch (err) {
    console.warn('[TrainingSegmentRollup] naming failed:', err.message);
  }
}
