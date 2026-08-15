/**
 * Segment Library Merge
 *
 * Repairs a segment library that fragmented under the old endpoint-based
 * identity test: the same road, cut at slightly different boundaries on each
 * ride, became several near-duplicate segments each stuck at ride_count = 1.
 *
 * Two operations:
 *   - retire segments whose geometry is a ride rather than a road (the
 *     boundary detector emitted no interior boundaries on a coarse track)
 *   - cluster the survivors by mutual path coverage and merge each cluster
 *     into one representative
 *
 * Both soft-retire via `retired_at` rather than deleting. Hard deletion of
 * a segment and its traversal history is irreversible, and the point of this
 * pass is to make counts trustworthy, not to destroy evidence.
 */

import { mutualCoverage, COVERAGE_DEFAULTS } from './segmentCoverage.js';

export const MERGE_DEFAULTS = {
  minMutualCoverage: 0.8,
  /** Segments longer than this are a ride, not a road. */
  maxSegmentMeters: 8000,
  /** Covering more than this share of every linked ride means it *is* the ride. */
  maxActivityFraction: 0.5,
};

// ============================================================================
// RETIREMENT
// ============================================================================

/**
 * Decide whether a segment should be retired outright.
 *
 * @param {object} segment
 * @param {number[]} linkedActivityDistances - distances of the activities
 *   whose traversals reference this segment
 * @returns {{retire: boolean, reason?: string}}
 */
export function classifyForRetirement(segment, linkedActivityDistances = [], opts = {}) {
  const cfg = { ...MERGE_DEFAULTS, ...opts };
  const distance = Number(segment.distance_meters) || 0;

  if (distance > cfg.maxSegmentMeters) {
    return { retire: true, reason: 'oversized' };
  }

  const usable = linkedActivityDistances.filter(d => Number(d) > 0);
  if (usable.length > 0) {
    const alwaysMostOfTheRide = usable.every(d => distance / Number(d) > cfg.maxActivityFraction);
    if (alwaysMostOfTheRide) {
      return { retire: true, reason: 'whole_ride' };
    }
  }

  return { retire: false };
}

// ============================================================================
// CLUSTERING
// ============================================================================

function bboxesOverlap(a, b, padDeg = 0.01) {
  if (a.bbox_min_lat == null || b.bbox_min_lat == null) return true; // unknown → test properly
  return !(
    Number(a.bbox_min_lat) - padDeg > Number(b.bbox_max_lat) ||
    Number(a.bbox_max_lat) + padDeg < Number(b.bbox_min_lat) ||
    Number(a.bbox_min_lng) - padDeg > Number(b.bbox_max_lng) ||
    Number(a.bbox_max_lng) + padDeg < Number(b.bbox_min_lng)
  );
}

/**
 * Group segments that describe the same road.
 *
 * Union-find over pairwise mutual coverage. Note this clusters far more
 * aggressively than the endpoint test it replaces — that is the intent, but
 * it is also why the rebuild script defaults to a dry run.
 *
 * @returns {Array<object[]>} clusters of 2+ segments; singletons are omitted
 */
export function findDuplicateClusters(segments, opts = {}) {
  const cfg = { ...COVERAGE_DEFAULTS, ...MERGE_DEFAULTS, ...opts };

  const parent = new Map(segments.map(s => [s.id, s.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression.
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (find(a.id) === find(b.id)) continue;
      if (!bboxesOverlap(a, b)) continue;

      const coordsA = a.geojson?.coordinates;
      const coordsB = b.geojson?.coordinates;
      if (!Array.isArray(coordsA) || !Array.isArray(coordsB)) continue;

      const { score } = mutualCoverage(coordsA, coordsB, cfg);
      if (score >= cfg.minMutualCoverage) union(a.id, b.id);
    }
  }

  const byRoot = new Map();
  for (const s of segments) {
    const root = find(s.id);
    const list = byRoot.get(root) || [];
    list.push(s);
    byRoot.set(root, list);
  }

  return [...byRoot.values()].filter(c => c.length > 1);
}

/**
 * Pick the survivor for a cluster.
 *
 * Prefers real measurements, then denser geometry (a higher-resolution trace
 * of the same road), then the better-established row.
 */
export function chooseRepresentative(cluster) {
  const density = (s) => {
    const pts = s.geojson?.coordinates?.length || 0;
    const dist = Number(s.distance_meters) || 1;
    return pts / dist;
  };

  return [...cluster].sort((a, b) => {
    const tierA = a.data_quality_tier === 'measured' ? 1 : 0;
    const tierB = b.data_quality_tier === 'measured' ? 1 : 0;
    if (tierA !== tierB) return tierB - tierA;

    const dA = density(a);
    const dB = density(b);
    if (Math.abs(dA - dB) > 1e-9) return dB - dA;

    const rcA = Number(a.ride_count) || 0;
    const rcB = Number(b.ride_count) || 0;
    if (rcA !== rcB) return rcB - rcA;

    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  })[0];
}

/**
 * A custom name is the rider's own work and must survive the merge even when
 * a different row's geometry wins.
 */
export function pickCustomName(cluster) {
  const named = cluster.find(s => s.custom_name);
  return named?.custom_name || null;
}

// ============================================================================
// MERGE EXECUTION
// ============================================================================

/**
 * Re-point one cluster's traversals onto its representative and retire the
 * losers.
 *
 * The fiddly part is UNIQUE(segment_id, activity_id): when both the loser and
 * the representative have a row for the same activity, one must be dropped.
 * The better row wins — a detector row over a coverage row, then a timed row
 * over an untimed one, then higher coverage.
 */
export async function mergeCluster(supabase, repId, loserIds, opts = {}) {
  const { dryRun = false } = opts;
  const outcome = { repId, loserIds, repointed: 0, discarded: 0, errors: [] };

  if (loserIds.length === 0) return outcome;

  const { data: repRows, error: repErr } = await supabase
    .from('training_segment_rides')
    .select('id, activity_id, match_method, duration_seconds, coverage_ratio')
    .eq('segment_id', repId);
  if (repErr) {
    outcome.errors.push(repErr.message);
    return outcome;
  }

  const { data: loserRows, error: loseErr } = await supabase
    .from('training_segment_rides')
    .select('id, segment_id, activity_id, match_method, duration_seconds, coverage_ratio')
    .in('segment_id', loserIds);
  if (loseErr) {
    outcome.errors.push(loseErr.message);
    return outcome;
  }

  const repByActivity = new Map((repRows || []).map(r => [r.activity_id, r]));

  for (const row of loserRows || []) {
    const incumbent = repByActivity.get(row.activity_id);

    if (!incumbent) {
      outcome.repointed++;
      repByActivity.set(row.activity_id, { ...row, segment_id: repId });
      if (!dryRun) {
        const { error } = await supabase
          .from('training_segment_rides')
          .update({ segment_id: repId })
          .eq('id', row.id);
        if (error) outcome.errors.push(`repoint ${row.id}: ${error.message}`);
      }
      continue;
    }

    // Both cover the same activity — keep whichever row is more informative.
    const challengerWins = betterRow(row, incumbent);
    outcome.discarded++;

    if (dryRun) continue;

    if (challengerWins) {
      const { error: delErr } = await supabase
        .from('training_segment_rides').delete().eq('id', incumbent.id);
      if (delErr) outcome.errors.push(`delete ${incumbent.id}: ${delErr.message}`);
      const { error: upErr } = await supabase
        .from('training_segment_rides').update({ segment_id: repId }).eq('id', row.id);
      if (upErr) outcome.errors.push(`repoint ${row.id}: ${upErr.message}`);
      repByActivity.set(row.activity_id, { ...row, segment_id: repId });
    } else {
      const { error } = await supabase
        .from('training_segment_rides').delete().eq('id', row.id);
      if (error) outcome.errors.push(`delete ${row.id}: ${error.message}`);
    }
  }

  if (dryRun) return outcome;

  // Loop segments referencing a loser must follow the survivor.
  const { error: loopErr } = await supabase
    .from('training_segments')
    .update({ parent_loop_id: repId })
    .in('parent_loop_id', loserIds);
  if (loopErr) outcome.errors.push(`parent_loop_id: ${loopErr.message}`);

  // Workout match rows are a short-lived cache; drop rather than re-point.
  const { error: wsmErr } = await supabase
    .from('workout_segment_matches')
    .delete()
    .in('segment_id', loserIds);
  if (wsmErr) outcome.errors.push(`workout_segment_matches: ${wsmErr.message}`);

  const { error: retireErr } = await supabase
    .from('training_segments')
    .update({
      merged_into_id: repId,
      retired_at: new Date().toISOString(),
      retired_reason: 'merged',
    })
    .in('id', loserIds);
  if (retireErr) outcome.errors.push(`retire: ${retireErr.message}`);

  return outcome;
}

function betterRow(a, b) {
  const score = (r) => {
    let s = 0;
    if (r.match_method === 'detector') s += 4;
    if (r.duration_seconds != null) s += 2;
    s += Math.min(1, Number(r.coverage_ratio) || 0);
    return s;
  };
  return score(a) > score(b);
}

/** Soft-retire a set of segments with a reason. */
export async function retireSegments(supabase, ids, reason, opts = {}) {
  if (!ids.length || opts.dryRun) return { retired: opts.dryRun ? ids.length : 0, errors: [] };

  const { error } = await supabase
    .from('training_segments')
    .update({ retired_at: new Date().toISOString(), retired_reason: reason })
    .in('id', ids);

  return { retired: error ? 0 : ids.length, errors: error ? [error.message] : [] };
}

export default {
  MERGE_DEFAULTS,
  classifyForRetirement,
  findDuplicateClusters,
  chooseRepresentative,
  pickCustomName,
  mergeCluster,
  retireSegments,
};
