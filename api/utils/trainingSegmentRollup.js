/**
 * Training segment rollup wrapper.
 *
 * Calls the Postgres functions installed by migration 092
 * (`recompute_training_segment_rollup` and `recompute_training_segment_profile`)
 * to refresh ride_count + frequency_tier from training_segment_rides as
 * the source of truth. Optionally rebuilds `auto_name` via Mapbox Map
 * Matching when called with `rebuildName: true` (typically only on
 * first traversal of a new segment).
 */

import { buildAutoNameFromGeometry } from './mapboxMapMatching.js';

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

  // Rebuild auto_name from the segment's stored geojson via Map Matching.
  // Fetch geometry and current name so we don't overwrite a custom_name
  // with a worse Map Matching result.
  const { data: row, error: fetchErr } = await supabase
    .from('training_segments')
    .select('geojson, auto_name')
    .eq('id', segmentId)
    .maybeSingle();

  if (fetchErr || !row) return;

  const coordinates = row.geojson?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;

  let newName = null;
  try {
    newName = await buildAutoNameFromGeometry(coordinates);
  } catch (err) {
    console.warn('[TrainingSegmentRollup] map matching failed:', err.message);
    return;
  }

  // Don't downgrade an existing reverse-geocoded auto_name to nothing.
  if (!newName) return;

  await supabase
    .from('training_segments')
    .update({ auto_name: newName })
    .eq('id', segmentId);
}
