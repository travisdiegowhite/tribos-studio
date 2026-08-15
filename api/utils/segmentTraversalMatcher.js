/**
 * Segment Traversal Matcher
 *
 * Records which of a rider's segments a given activity actually rode, by
 * testing the activity's full track against each candidate segment's path
 * (see segmentCoverage.js). This is deliberately independent of the segment
 * *detector*: an activity counts as a traversal whether or not its own
 * boundary detection produced anything matchable.
 *
 * That independence is the point. Detection is expensive and fragile — it
 * needs elevation data, it is sensitive to track resolution, and it only
 * ever ran on 4% of the production activity set. Coverage is planimetric,
 * so it needs no elevation lookup and no network call at all, which is what
 * makes backfilling every ride with GPS tractable.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { decodePolyline } from './polylineDecode.js';
import {
  COVERAGE_DEFAULTS,
  bboxOf,
  buildTrackIndex,
  pathCoverage,
} from './segmentCoverage.js';

/** Bump to force re-analysis of already-covered activities. */
export const TRAVERSAL_ANALYSIS_VERSION = 1;

const CANDIDATE_BBOX_PAD_METERS = 100;

// ============================================================================
// TRACK EXTRACTION
// ============================================================================

/**
 * Best available `[lng, lat][]` track for an activity, and whether it came
 * with real per-point measurements.
 *
 * Note both sources are the same ~11m RDP-simplified geometry; streams just
 * additionally carry speed/power/HR.
 */
export function extractTrack(activity) {
  const streamCoords = activity?.activity_streams?.coords;
  if (Array.isArray(streamCoords) && streamCoords.length >= 2) {
    return { coords: streamCoords, tier: 'measured' };
  }

  if (activity?.map_summary_polyline) {
    const latLng = decodePolyline(activity.map_summary_polyline);
    if (latLng.length >= 2) {
      return { coords: latLng.map(([lat, lng]) => [lng, lat]), tier: 'geometry_only' };
    }
  }

  return { coords: [], tier: null };
}

// ============================================================================
// SUB-TRACK STATISTICS
// ============================================================================

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Real per-traversal metrics for the slice of a measured ride that covered a
 * segment.
 *
 * This is what turns coverage matching into something the comparison panel
 * can use: a ride whose detector output never matched still yields a genuine
 * duration, power and heart rate for the stretch it rode.
 *
 * Indices are into the *original* stream arrays (pathCoverage maps its
 * densified indices back via sourceIdx).
 *
 * @returns {{durationSeconds: number|null, avgSpeedKmh: number|null, avgPower: number|null,
 *            maxPower: number|null, avgHR: number|null, maxHR: number|null,
 *            avgCadence: number|null, distanceMeters: number|null}}
 */
export function extractSubTrackStats(streams, fromIdx, toIdx) {
  const empty = {
    durationSeconds: null,
    avgSpeedKmh: null,
    avgPower: null,
    maxPower: null,
    avgHR: null,
    maxHR: null,
    avgCadence: null,
    distanceMeters: null,
  };

  const coords = streams?.coords;
  if (!Array.isArray(coords) || fromIdx == null || toIdx == null) return empty;

  const lo = Math.max(0, Math.min(fromIdx, toIdx));
  const hi = Math.min(coords.length - 1, Math.max(fromIdx, toIdx));
  if (hi - lo < 1) return empty;

  const slice = (arr) => (Array.isArray(arr) ? arr.slice(lo, hi + 1) : []);
  const numeric = (arr, min) => slice(arr).filter(v => typeof v === 'number' && Number.isFinite(v) && v > min);

  const speeds = numeric(streams.speed, 0.1);
  const powers = numeric(streams.power, 0);
  const hrs = numeric(streams.heartRate, 30);
  const cadences = numeric(streams.cadence, 0);

  // Distance along the covered slice.
  let distanceMeters = 0;
  for (let i = lo + 1; i <= hi; i++) {
    const [lng0, lat0] = coords[i - 1];
    const [lng1, lat1] = coords[i];
    const midLatRad = ((lat0 + lat1) / 2) * (Math.PI / 180);
    const dx = (lng1 - lng0) * Math.cos(midLatRad) * 111320;
    const dy = (lat1 - lat0) * 111320;
    distanceMeters += Math.sqrt(dx * dx + dy * dy);
  }

  // Duration is integrated from the speed stream, the same way the detector
  // does it. Without speed there is no honest timing, and none is invented.
  let durationSeconds = null;
  if (speeds.length > 0 && Array.isArray(streams.speed)) {
    let seconds = 0;
    for (let i = lo + 1; i <= hi; i++) {
      const [lng0, lat0] = coords[i - 1];
      const [lng1, lat1] = coords[i];
      const midLatRad = ((lat0 + lat1) / 2) * (Math.PI / 180);
      const dx = (lng1 - lng0) * Math.cos(midLatRad) * 111320;
      const dy = (lat1 - lat0) * 111320;
      const step = Math.sqrt(dx * dx + dy * dy);
      const spd = streams.speed[i] ?? streams.speed[i - 1];
      if (typeof spd === 'number' && spd > 0.1) seconds += step / spd;
    }
    durationSeconds = seconds > 0 ? Math.round(seconds) : null;
  }

  const avgSpeed = mean(speeds);

  return {
    durationSeconds,
    avgSpeedKmh: avgSpeed == null ? null : Math.round(avgSpeed * 3.6 * 10) / 10,
    avgPower: powers.length ? Math.round(mean(powers)) : null,
    maxPower: powers.length ? Math.max(...powers) : null,
    avgHR: hrs.length ? Math.round(mean(hrs)) : null,
    maxHR: hrs.length ? Math.max(...hrs) : null,
    avgCadence: cadences.length ? Math.round(mean(cadences)) : null,
    distanceMeters: Math.round(distanceMeters),
  };
}

// ============================================================================
// PER-ACTIVITY COVERAGE
// ============================================================================

const ACTIVITY_COLUMNS =
  'id, user_id, start_date, distance, moving_time, max_heartrate, ' +
  'map_summary_polyline, activity_streams, duplicate_of';

/**
 * Record every segment this activity covered.
 *
 * @param {string} activityId
 * @param {string} userId
 * @param {object} [opts]
 * @param {object} [opts.supabase]   injected client (tests / scripts)
 * @param {object} [opts.activity]   pre-fetched activity row
 * @param {Array}  [opts.segments]   pre-fetched candidate segments
 * @param {boolean}[opts.dryRun]     compute but do not write
 * @param {object} [opts.coverage]   coverage tuning overrides
 */
export async function analyzeCoverageForActivity(activityId, userId, opts = {}) {
  const supabase = opts.supabase || getSupabaseAdmin();
  const cfg = { ...COVERAGE_DEFAULTS, ...(opts.coverage || {}) };

  const result = { success: false, traversals: 0, segmentIds: [], skipped: false, matches: [] };

  let activity = opts.activity;
  if (!activity) {
    const { data, error } = await supabase
      .from('activities')
      .select(ACTIVITY_COLUMNS)
      .eq('id', activityId)
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      result.error = error?.message || 'Activity not found';
      return result;
    }
    activity = data;
  }

  if (activity.duplicate_of) {
    return { ...result, success: true, skipped: true, reason: 'duplicate' };
  }

  const { coords, tier } = extractTrack(activity);
  if (coords.length < 2) {
    return { ...result, success: true, skipped: true, reason: 'no_track' };
  }

  const rideBbox = bboxOf(coords);
  if (!rideBbox) {
    return { ...result, success: true, skipped: true, reason: 'no_track' };
  }

  // Candidate segments: user's own, not retired, bbox overlapping the ride.
  let segments = opts.segments;
  if (!segments) {
    const padLat = CANDIDATE_BBOX_PAD_METERS / 111320;
    const cosLat = Math.max(0.01, Math.cos(((rideBbox.minLat + rideBbox.maxLat) / 2) * (Math.PI / 180)));
    const padLng = CANDIDATE_BBOX_PAD_METERS / (111320 * cosLat);

    const { data, error } = await supabase
      .from('training_segments')
      .select('id, geojson, distance_meters, data_quality_tier')
      .eq('user_id', userId)
      .is('retired_at', null)
      .lte('bbox_min_lat', rideBbox.maxLat + padLat)
      .gte('bbox_max_lat', rideBbox.minLat - padLat)
      .lte('bbox_min_lng', rideBbox.maxLng + padLng)
      .gte('bbox_max_lng', rideBbox.minLng - padLng);

    if (error) {
      result.error = error.message;
      return result;
    }
    segments = data || [];
  }

  if (segments.length === 0) {
    return { ...result, success: true, traversals: 0 };
  }

  // One index per activity, reused across every candidate — this is the
  // difference between a tractable backfill and an intractable one.
  const trackIndex = buildTrackIndex(coords, cfg);

  const matches = [];
  for (const segment of segments) {
    const segCoords = segment.geojson?.coordinates;
    if (!Array.isArray(segCoords) || segCoords.length < 2) continue;

    const cov = pathCoverage(segCoords, trackIndex, cfg);
    if (!cov.passes) continue;

    const stats = tier === 'measured'
      ? extractSubTrackStats(activity.activity_streams, cov.entrySourceIdx, cov.exitSourceIdx)
      : null;

    matches.push({ segment, coverage: cov, stats, tier });
  }

  result.matches = matches;
  result.segmentIds = matches.map(m => m.segment.id);

  if (opts.dryRun) {
    return { ...result, success: true, traversals: matches.length };
  }

  for (const match of matches) {
    const written = await upsertTraversal(supabase, {
      segmentId: match.segment.id,
      activityId: activity.id,
      userId,
      riddenAt: activity.start_date,
      coverage: match.coverage,
      stats: match.stats,
      tier: match.tier,
    });
    if (written) result.traversals++;
  }

  return { ...result, success: true };
}

/**
 * Write one coverage-derived traversal row.
 *
 * Never downgrades an existing detector row: those carry metrics derived
 * from the detector's own segment boundaries, which are at least as good as
 * a coverage slice. A blind upsert here would overwrite them with nulls.
 */
async function upsertTraversal(supabase, params) {
  const { segmentId, activityId, userId, riddenAt, coverage, stats, tier } = params;

  const { data: existing } = await supabase
    .from('training_segment_rides')
    .select('id, match_method, duration_seconds')
    .eq('segment_id', segmentId)
    .eq('activity_id', activityId)
    .maybeSingle();

  if (existing && existing.match_method === 'detector' && existing.duration_seconds != null) {
    const { error } = await supabase
      .from('training_segment_rides')
      .update({
        coverage_ratio: round3(coverage.coverage),
        direction: coverage.direction === 'unknown' ? null : coverage.direction,
      })
      .eq('id', existing.id);
    return !error;
  }

  const { error } = await supabase
    .from('training_segment_rides')
    .upsert({
      segment_id: segmentId,
      activity_id: activityId,
      user_id: userId,
      ridden_at: riddenAt || new Date().toISOString(),
      match_method: 'coverage',
      coverage_ratio: round3(coverage.coverage),
      direction: coverage.direction === 'unknown' ? null : coverage.direction,
      data_quality_tier: tier,
      duration_seconds: stats?.durationSeconds ?? null,
      avg_speed: stats?.avgSpeedKmh ?? null,
      avg_power: stats?.avgPower ?? null,
      max_power: stats?.maxPower ?? null,
      avg_hr: stats?.avgHR ?? null,
      max_hr: stats?.maxHR ?? null,
      avg_cadence: stats?.avgCadence ?? null,
    }, { onConflict: 'segment_id,activity_id' });

  if (error) {
    console.error('[TraversalMatcher] upsert failed:', error.message);
    return false;
  }
  return true;
}

function round3(n) {
  return typeof n === 'number' ? Math.round(n * 1000) / 1000 : null;
}

// ============================================================================
// BATCH DRIVER
// ============================================================================

/**
 * Compute coverage for a user's activities that have not been analysed at
 * the current version.
 *
 * Iterates activity-outer / segment-inner and holds one page at a time, so
 * memory stays bounded regardless of history size.
 */
export async function analyzeCoverageForUser(userId, opts = {}) {
  const supabase = opts.supabase || getSupabaseAdmin();
  const { limit = 200, force = false, since = null, dryRun = false, onProgress = null } = opts;

  const summary = {
    activitiesScanned: 0,
    activitiesMatched: 0,
    traversals: 0,
    errors: [],
    touchedSegmentIds: new Set(),
  };

  let query = supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (since) query = query.gte('start_date', since);
  if (!force) query = query.or(`segment_coverage_analyzed_at.is.null,segment_coverage_version.lt.${TRAVERSAL_ANALYSIS_VERSION}`);

  const { data: activities, error } = await query;
  if (error) {
    summary.errors.push(error.message);
    return summary;
  }
  if (!activities?.length) return summary;

  // Candidate segments are fetched once and filtered per activity in memory;
  // a user's library is small (hundreds), a re-query per activity is not.
  const { data: segments, error: segErr } = await supabase
    .from('training_segments')
    .select('id, geojson, distance_meters, data_quality_tier, bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng')
    .eq('user_id', userId)
    .is('retired_at', null);

  if (segErr) {
    summary.errors.push(segErr.message);
    return summary;
  }

  const allSegments = segments || [];

  for (const activity of activities) {
    summary.activitiesScanned++;

    const { coords } = extractTrack(activity);
    const rideBbox = coords.length >= 2 ? bboxOf(coords) : null;

    const candidates = rideBbox
      ? allSegments.filter(s => s.bbox_min_lat != null && boxesOverlap(rideBbox, s))
      : [];

    let res;
    try {
      res = await analyzeCoverageForActivity(activity.id, userId, {
        supabase,
        activity,
        segments: candidates,
        dryRun,
        coverage: opts.coverage,
      });
    } catch (err) {
      summary.errors.push(`${activity.id}: ${err.message}`);
      continue;
    }

    if (!res.success) {
      summary.errors.push(`${activity.id}: ${res.error || 'unknown'}`);
      if (!dryRun) await recordAttempt(supabase, activity.id, res.error);
      continue;
    }

    if (res.traversals > 0) summary.activitiesMatched++;
    summary.traversals += res.traversals;
    for (const id of res.segmentIds) summary.touchedSegmentIds.add(id);

    // Watermark only on success — the previous behaviour stamped it
    // regardless, which permanently stranded any activity that hit a
    // transient failure.
    if (!dryRun) {
      await supabase
        .from('activities')
        .update({
          segment_coverage_analyzed_at: new Date().toISOString(),
          segment_coverage_version: TRAVERSAL_ANALYSIS_VERSION,
          segment_analysis_error: null,
        })
        .eq('id', activity.id);
    }

    if (onProgress && summary.activitiesScanned % 25 === 0) onProgress(summary);
  }

  return summary;
}

function boxesOverlap(rideBbox, segment) {
  const pad = CANDIDATE_BBOX_PAD_METERS / 111320;
  return !(
    Number(segment.bbox_min_lat) - pad > rideBbox.maxLat ||
    Number(segment.bbox_max_lat) + pad < rideBbox.minLat ||
    Number(segment.bbox_min_lng) - pad > rideBbox.maxLng ||
    Number(segment.bbox_max_lng) + pad < rideBbox.minLng
  );
}

async function recordAttempt(supabase, activityId, message) {
  const { data } = await supabase
    .from('activities')
    .select('segment_analysis_attempts')
    .eq('id', activityId)
    .maybeSingle();

  await supabase
    .from('activities')
    .update({
      segment_analysis_attempts: (data?.segment_analysis_attempts || 0) + 1,
      segment_analysis_error: message ? String(message).slice(0, 500) : null,
    })
    .eq('id', activityId);
}

export default {
  TRAVERSAL_ANALYSIS_VERSION,
  extractTrack,
  extractSubTrackStats,
  analyzeCoverageForActivity,
  analyzeCoverageForUser,
};
