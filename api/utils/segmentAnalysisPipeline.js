/**
 * Segment Analysis Pipeline
 *
 * Server-side orchestrator that processes an activity's stream data to detect,
 * deduplicate, store, and profile training segments. Designed to run in Vercel
 * serverless functions with Supabase service key access.
 *
 * Pipeline stages:
 * 1. Fetch activity with stream data
 * 2. Detect segments from streams (elevation, speed, gradient)
 * 3. Deduplicate against existing segment library
 * 4. Store new segments / update existing ones with ride data
 * 5. Update aggregate profiles (power, consistency, frequency)
 *
 * Also supports a polyline fallback path for activities without full streams
 * (e.g. Strava activities): decodes the summary polyline, fetches elevation
 * from OpenTopoData, and runs terrain-only segment detection. These segments
 * are tagged with data_quality_tier = 'geometry_only'.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { buildStreamsFromPolyline, calculatePolylineDistance } from './polylineStreamBuilder.js';
import { recomputeTrainingSegment } from './trainingSegmentRollup.js';
import {
  analyzeCoverageForActivity,
  TRAVERSAL_ANALYSIS_VERSION,
} from './segmentTraversalMatcher.js';
import { bboxOf, mutualCoverage } from './segmentCoverage.js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;

const CONFIG = {
  // Minimum activity requirements for segment analysis
  MIN_DISTANCE_METERS: 2000,       // 2km minimum ride distance
  MIN_DURATION_SECONDS: 600,       // 10 min minimum ride duration
  MIN_STREAM_POINTS: 20,           // Need enough GPS points

  // Segment geometry bounds. Without an upper bound the boundary detector
  // emits the entire ride as a single "segment" whenever the track is too
  // coarse for gradient changes to register — which is most Strava rides.
  MIN_SEGMENT_METERS: 500,
  MAX_SEGMENT_METERS: 8000,
  SPLIT_TARGET_METERS: 5000,
  MAX_ACTIVITY_FRACTION: 0.5,      // a segment covering half the ride is a ride

  // Boundary detection
  GRADIENT_CHANGE_PCT: 3,          // % gradient delta that opens a boundary
  GRADIENT_SUSTAIN_METERS: 200,    // distance the delta must persist
  GRADIENT_DROPOUT_TOLERANCE: 2,   // points below threshold tolerated mid-run

  // Segment matching. Identity is mutual path coverage, not endpoint
  // equality — endpoints move between rides, the road does not.
  MATCH_BBOX_EXPANSION: 0.005,     // ~500m at mid-latitudes
  MATCH_MIN_MUTUAL_COVERAGE: 0.80,

  // Power zone boundaries (% of FTP)
  POWER_ZONES: {
    recovery: [0, 0.55],
    endurance: [0.55, 0.75],
    tempo: [0.75, 0.87],
    sweet_spot: [0.87, 0.95],
    threshold: [0.95, 1.05],
    vo2max: [1.05, 1.20],
    anaerobic: [1.20, Infinity],
  },

  // HR zone boundaries (% of max HR)
  HR_ZONES: {
    recovery: [0, 0.60],
    endurance: [0.60, 0.70],
    tempo: [0.70, 0.80],
    threshold: [0.80, 0.90],
    vo2max: [0.90, 0.95],
    anaerobic: [0.95, 1.0],
  },
};

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Analyze a single activity for training segments.
 * @param {string} activityId - Activity UUID
 * @param {string} userId - User UUID
 * @returns {Object} Analysis results
 */
export async function analyzeActivitySegments(activityId, userId) {
  const supabase = getSupabase();

  // Step 1: Fetch activity data
  const activity = await fetchActivity(supabase, activityId, userId);
  if (!activity) {
    return { success: false, error: 'Activity not found', segments: 0 };
  }

  // A ride imported from two providers must only contribute traversals once.
  // The batch entry points already filter on this; the webhook path runs
  // before dedup resolves, so it has to check explicitly.
  if (activity.duplicate_of) {
    return { success: true, skipped: true, reason: 'duplicate', segments: 0 };
  }

  // Validate minimum requirements
  if (!activity.activity_streams?.coords || activity.activity_streams.coords.length < CONFIG.MIN_STREAM_POINTS) {
    return { success: false, error: 'Insufficient stream data', segments: 0 };
  }

  const distance = activity.distance || 0;
  const duration = activity.moving_time || 0;
  if (distance < CONFIG.MIN_DISTANCE_METERS || duration < CONFIG.MIN_DURATION_SECONDS) {
    return { success: false, error: 'Activity too short', segments: 0 };
  }

  // Step 2: Detect segments from stream data
  const detected = detectSegmentsFromStreams(activity.activity_streams, {
    activityDistanceMeters: distance,
  });
  if (detected.segments.length === 0) {
    // Mark as analyzed even with no segments
    await markAnalyzed(supabase, activityId);
    return { success: true, segments: 0, message: 'No trainable segments detected' };
  }

  // Step 3: Fetch user's FTP for power zone classification
  const ftp = await fetchUserFTP(supabase, userId);

  // Step 4: For each detected segment, deduplicate and store
  const results = {
    newSegments: 0,
    updatedSegments: 0,
    totalSegments: detected.segments.length,
  };

  for (const segment of detected.segments) {
    const result = await processDetectedSegment(
      supabase,
      segment,
      activityId,
      userId,
      activity,
      ftp
    );

    if (result.isNew) results.newSegments++;
    else results.updatedSegments++;
  }

  // Step 5: Mark activity as analyzed
  await markAnalyzed(supabase, activityId);

  return {
    success: true,
    ...results,
  };
}

/**
 * Analyze one freshly imported activity for training segments, picking the
 * right path for its data tier: full streams when present (Garmin/Wahoo/FIT),
 * polyline fallback otherwise (Strava). Intended for the webhook post-import
 * side-effect chains — never throws, and skips work that has already run so
 * re-delivered webhooks stay cheap.
 *
 * @param {string} activityId - Activity UUID
 * @param {string} userId - User UUID
 * @returns {Object} Analysis results ({ success, skipped?, ... })
 */
export async function analyzeSegmentsForNewActivity(activityId, userId) {
  const supabase = getSupabase();

  try {
    const { data: activity, error } = await supabase
      .from('activities')
      .select('id, duplicate_of, training_segments_analyzed_at, polyline_segments_analyzed_at, map_summary_polyline, distance, moving_time, start_date, max_heartrate, activity_streams')
      .eq('id', activityId)
      .eq('user_id', userId)
      .single();

    if (error || !activity) {
      return { success: false, error: error?.message || 'Activity not found', segments: 0 };
    }

    // See analyzeActivitySegments — webhooks fire before dedup resolves.
    if (activity.duplicate_of) {
      return { success: true, skipped: true, reason: 'duplicate', segments: 0 };
    }

    // --- Detection: may discover new segments, may find nothing ---
    let detection = { success: true, skipped: true, reason: 'no_data' };

    if (activity.activity_streams?.coords?.length) {
      detection = activity.training_segments_analyzed_at
        ? { success: true, skipped: true, reason: 'already_analyzed' }
        : await analyzeActivitySegments(activityId, userId);
    } else if (activity.map_summary_polyline) {
      if (activity.polyline_segments_analyzed_at) {
        detection = { success: true, skipped: true, reason: 'already_analyzed' };
      } else {
        detection = await analyzeActivityFromPolyline(activity, userId, supabase);
        // Watermark only on success. Stamping regardless permanently
        // stranded any activity that hit a transient elevation-API failure,
        // which is a large part of why only 4% of rides were ever analysed.
        if (detection.success) {
          await supabase
            .from('activities')
            .update({
              polyline_segments_analyzed_at: new Date().toISOString(),
              segment_analysis_error: null,
            })
            .eq('id', activityId);
        } else {
          await recordAnalysisFailure(supabase, activityId, detection.error);
        }
      }
    }

    // --- Coverage: always runs, regardless of what detection did ---
    //
    // This is what lets a ride count against segments the rider already has.
    // Detection only ever fires when this particular ride's boundaries
    // happen to be matchable; coverage asks the question that actually
    // matters — did this ride go down that road?
    let coverage = null;
    try {
      coverage = await analyzeCoverageForActivity(activityId, userId, { supabase, activity });
      if (coverage.success && !coverage.skipped) {
        for (const segmentId of coverage.segmentIds) {
          await recomputeTrainingSegment(supabase, segmentId);
        }
        await supabase
          .from('activities')
          .update({
            segment_coverage_analyzed_at: new Date().toISOString(),
            segment_coverage_version: TRAVERSAL_ANALYSIS_VERSION,
          })
          .eq('id', activityId);
      }
    } catch (covErr) {
      console.warn(`[SegmentPipeline] coverage failed for ${activityId}:`, covErr.message);
    }

    if (detection.skipped && coverage?.traversals > 0) {
      return { success: true, segments: 0, traversals: coverage.traversals };
    }

    return { ...detection, traversals: coverage?.traversals ?? 0 };
  } catch (err) {
    console.error(`[SegmentPipeline] analyzeSegmentsForNewActivity failed for ${activityId}:`, err.message);
    return { success: false, error: err.message, segments: 0 };
  }
}

/**
 * Analyze all unprocessed activities for a user.
 * @param {string} userId - User UUID
 * @param {number} limit - Max activities to process
 */
export async function analyzeUnprocessedActivities(userId, limit = 20) {
  const supabase = getSupabase();

  // Find activities with stream data that haven't been analyzed
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .is('training_segments_analyzed_at', null)
    .not('activity_streams', 'is', null)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (error || !activities) {
    return { success: false, error: error?.message || 'Failed to fetch activities', processed: 0 };
  }

  let processed = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  for (const activity of activities) {
    try {
      const result = await analyzeActivitySegments(activity.id, userId);
      if (result.success) {
        processed++;
        totalNew += result.newSegments || 0;
        totalUpdated += result.updatedSegments || 0;
      }
    } catch (err) {
      console.error(`[SegmentPipeline] Error analyzing activity ${activity.id}:`, err.message);
    }
  }

  return {
    success: true,
    processed,
    totalActivities: activities.length,
    newSegments: totalNew,
    updatedSegments: totalUpdated,
  };
}

/**
 * Analyze activities that have a polyline but no full streams.
 * Builds synthetic streams from decoded polyline + elevation API,
 * then runs terrain-only segment detection.
 *
 * @param {string} userId - User UUID
 * @param {number} limit - Max activities to process
 */
export async function analyzePolylineActivities(userId, limit = 20) {
  const supabase = getSupabase();

  // Find activities with polyline but no streams and not yet polyline-analyzed
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, map_summary_polyline, distance, moving_time, start_date, average_speed, average_watts, average_heartrate, max_heartrate, name')
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .is('polyline_segments_analyzed_at', null)
    .is('activity_streams', null)
    .not('map_summary_polyline', 'is', null)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (error || !activities || activities.length === 0) {
    return {
      success: true,
      processed: 0,
      totalActivities: 0,
      newSegments: 0,
      updatedSegments: 0,
      skipped: 0,
      message: error?.message || 'No polyline activities to analyze',
    };
  }

  let processed = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let skipped = 0;

  for (const activity of activities) {
    try {
      const result = await analyzeActivityFromPolyline(activity, userId, supabase);
      if (result.success) {
        processed++;
        totalNew += result.newSegments || 0;
        totalUpdated += result.updatedSegments || 0;
      } else if (result.error === 'Skipped') {
        skipped++;
      }

      // Mark as polyline-analyzed regardless of outcome
      await supabase
        .from('activities')
        .update({ polyline_segments_analyzed_at: new Date().toISOString() })
        .eq('id', activity.id);
    } catch (err) {
      console.error(`[SegmentPipeline] Polyline analysis error for ${activity.id}:`, err.message);
      // Mark as analyzed to avoid retrying failures
      await supabase
        .from('activities')
        .update({ polyline_segments_analyzed_at: new Date().toISOString() })
        .eq('id', activity.id);
    }
  }

  return {
    success: true,
    processed,
    totalActivities: activities.length,
    newSegments: totalNew,
    updatedSegments: totalUpdated,
    skipped,
  };
}

/**
 * Analyze a single activity using its polyline for terrain-only segments.
 */
async function analyzeActivityFromPolyline(activity, userId, supabase) {
  const { id: activityId, map_summary_polyline, distance, moving_time } = activity;

  if (!map_summary_polyline) {
    return { success: false, error: 'No polyline', segments: 0 };
  }

  // Validate minimum requirements
  const activityDistance = distance || 0;
  const activityDuration = moving_time || 0;
  if (activityDistance < CONFIG.MIN_DISTANCE_METERS || activityDuration < CONFIG.MIN_DURATION_SECONDS) {
    return { success: false, error: 'Skipped', segments: 0 };
  }

  // Build synthetic streams from polyline
  const streams = await buildStreamsFromPolyline(map_summary_polyline);
  if (!streams) {
    return { success: false, error: 'Failed to build streams from polyline', segments: 0 };
  }

  if (streams.coords.length < CONFIG.MIN_STREAM_POINTS) {
    return { success: false, error: 'Skipped', segments: 0 };
  }

  // Detect segments (terrain-only — no speed/power/HR)
  const detected = detectSegmentsFromStreams(streams, { activityDistanceMeters: activityDistance });
  if (detected.segments.length === 0) {
    return { success: true, segments: 0, message: 'No trainable segments detected' };
  }

  // Process each detected segment with geometry_only tier
  const results = {
    newSegments: 0,
    updatedSegments: 0,
    totalSegments: detected.segments.length,
  };

  const ftp = await fetchUserFTP(supabase, userId);

  for (const segment of detected.segments) {
    const result = await processDetectedSegment(
      supabase,
      segment,
      activityId,
      userId,
      activity,
      ftp,
      'geometry_only' // data quality tier
    );

    if (result.isNew) results.newSegments++;
    else results.updatedSegments++;
  }

  return {
    success: true,
    ...results,
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchActivity(supabase, activityId, userId) {
  const { data, error } = await supabase
    .from('activities')
    .select('id, user_id, name, distance, moving_time, elapsed_time, total_elevation_gain, average_watts, average_heartrate, max_heartrate, average_speed, start_date, activity_streams, type, sport_type, duplicate_of')
    .eq('id', activityId)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error(`[SegmentPipeline] Error fetching activity:`, error.message);
    return null;
  }

  return data;
}

async function fetchUserFTP(supabase, userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('ftp')
    .eq('id', userId)
    .single();

  return data?.ftp || 0;
}

async function markAnalyzed(supabase, activityId) {
  await supabase
    .from('activities')
    .update({ training_segments_analyzed_at: new Date().toISOString() })
    .eq('id', activityId);
}

/**
 * Record a failed analysis attempt without stamping the watermark, so the
 * activity stays eligible for retry (bounded by the attempt counter).
 */
async function recordAnalysisFailure(supabase, activityId, message) {
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

// ============================================================================
// SEGMENT DETECTION (inline, since we can't import TS in serverless)
// ============================================================================

/**
 * Detect segments from activity stream data.
 * This is the server-side version of the detection algorithm.
 */
function detectSegmentsFromStreams(streams, options = {}) {
  const { activityDistanceMeters = 0 } = options;
  const { coords, elevation, speed, power, heartRate, cadence } = streams;
  if (!coords || coords.length < 10) {
    return { segments: [], stops: [] };
  }

  // A track built from a bare polyline carries no speed stream. Previously
  // a 5 m/s default was substituted, which fabricated an 18 km/h time axis
  // and wrote invented durations into training_segment_rides. There is no
  // honest timing to derive here, so there is none: durations stay null and
  // the traversal is kept for familiarity only.
  const hasTiming = Array.isArray(speed)
    && speed.some(v => typeof v === 'number' && v > 0);

  // Build enriched point array
  const points = [];
  let cumDist = 0;
  let cumTime = 0;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];

    if (i > 0) {
      const dist = haversineMeters(
        points[i - 1].lat, points[i - 1].lng,
        lat, lng
      );
      cumDist += dist;
      if (hasTiming) {
        const spd = speed[i] ?? speed[i - 1] ?? 0;
        cumTime += spd > 0.1 ? dist / spd : 0;
      }
    }

    points.push({
      lat, lng,
      elevation: elevation?.[i] ?? 0,
      speed: speed?.[i] ?? 0,
      power: power?.[i] ?? 0,
      heartRate: heartRate?.[i] ?? 0,
      cadence: cadence?.[i] ?? 0,
      distance: cumDist,
      timestamp: hasTiming ? cumTime : null,
    });
  }

  // Smooth elevation
  smoothElevation(points);

  // Detect stops
  const stops = detectStops(points, hasTiming);

  // Calculate gradients
  const gradients = calculateGradients(points);

  // Find boundaries
  const boundaries = findBoundaries(points, gradients, stops);

  // A segment longer than half the ride is not a segment, it is the ride.
  // Cap against both an absolute ceiling and the activity's own length.
  const effectiveMax = activityDistanceMeters > 0
    ? Math.max(
        CONFIG.MIN_SEGMENT_METERS,
        Math.min(CONFIG.MAX_SEGMENT_METERS, CONFIG.MAX_ACTIVITY_FRACTION * activityDistanceMeters)
      )
    : CONFIG.MAX_SEGMENT_METERS;

  // Build and characterize segments
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIdx = boundaries[i];
    const endIdx = boundaries[i + 1];
    const dist = points[endIdx].distance - points[startIdx].distance;

    if (dist < CONFIG.MIN_SEGMENT_METERS) continue;
    if (dist > effectiveMax) continue;

    const seg = characterizeSegment(points, startIdx, endIdx, stops, hasTiming);
    if (seg) segments.push(seg);
  }

  return { segments, stops };
}

function smoothElevation(points) {
  const window = 5;
  const half = Math.floor(window / 2);
  const smoothed = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += points[j].elevation;
      count++;
    }
    smoothed[i] = sum / count;
  }

  for (let i = 0; i < points.length; i++) {
    points[i].elevation = smoothed[i];
  }
}

function detectStops(points, hasTiming = true) {
  // Without a speed stream every point reads as "stopped" (speed defaults to
  // 0), the run never closes, and the result is silently always empty. Be
  // explicit rather than accidentally correct.
  if (!hasTiming) return [];

  const stops = [];
  let stopStart = -1;

  for (let i = 0; i < points.length; i++) {
    const isStopped = points[i].speed < 0.6; // ~2 km/h

    if (isStopped && stopStart === -1) {
      stopStart = i;
    } else if (!isStopped && stopStart !== -1) {
      const duration = points[i].timestamp - points[stopStart].timestamp;
      if (duration >= 3) {
        stops.push({
          pointIndex: stopStart,
          lat: points[stopStart].lat,
          lng: points[stopStart].lng,
          distance: points[stopStart].distance,
          durationSeconds: Math.round(duration),
          type: 'unknown',
        });
      }
      stopStart = -1;
    }
  }

  return stops;
}

function calculateGradients(points) {
  const gradients = new Array(points.length).fill(0);
  const window = 100; // meters

  for (let i = 0; i < points.length; i++) {
    let lookBack = i;
    let lookForward = i;

    while (lookBack > 0 && points[i].distance - points[lookBack].distance < window / 2) lookBack--;
    while (lookForward < points.length - 1 && points[lookForward].distance - points[i].distance < window / 2) lookForward++;

    const distDiff = points[lookForward].distance - points[lookBack].distance;
    const elevDiff = points[lookForward].elevation - points[lookBack].elevation;

    if (distDiff > 10) gradients[i] = (elevDiff / distDiff) * 100;
  }

  return gradients;
}

function findBoundaries(points, gradients, stops) {
  const boundaries = [0]; // always start

  // Seed from the data rather than 0 — starting mid-climb otherwise reads as
  // an instant 3% delta and plants a spurious boundary at the first point.
  let prevAvgGrad = gradients[1] ?? 0;
  // Index where the current above-threshold run began. The previous code
  // derived this as `i - ceil(sustainedDist / distStep)`, mixing a distance
  // accumulated over many steps with only the most recent step's length; the
  // result routinely landed behind the previous boundary, was rejected by the
  // spacing guard, and the run state was reset anyway — so the boundary was
  // silently lost. Tracking the run start directly is both correct and simpler.
  let runStartIdx = -1;
  let runDist = 0;
  let missStreak = 0;

  for (let i = 1; i < points.length; i++) {
    const distStep = points[i].distance - points[i - 1].distance;
    const gradDiff = Math.abs(gradients[i] - prevAvgGrad);

    if (gradDiff >= CONFIG.GRADIENT_CHANGE_PCT) {
      if (runStartIdx === -1) runStartIdx = i - 1;
      runDist += distStep;
      missStreak = 0;

      if (runDist >= CONFIG.GRADIENT_SUSTAIN_METERS) {
        const last = boundaries[boundaries.length - 1];
        // Space boundaries by distance, not by index — index spacing is
        // meaningless when point density varies by an order of magnitude
        // between providers.
        if (points[runStartIdx].distance - points[last].distance >= CONFIG.MIN_SEGMENT_METERS) {
          boundaries.push(runStartIdx);
        }
        prevAvgGrad = gradients[i];
        runStartIdx = -1;
        runDist = 0;
      }
    } else if (runStartIdx !== -1 && ++missStreak <= CONFIG.GRADIENT_DROPOUT_TOLERANCE) {
      // A one- or two-point dip below threshold is noise, not the end of a run.
      runDist += distStep;
    } else {
      prevAvgGrad = prevAvgGrad * 0.8 + gradients[i] * 0.2;
      runStartIdx = -1;
      runDist = 0;
      missStreak = 0;
    }
  }

  // Extended stops as boundaries
  for (const stop of stops) {
    if (stop.durationSeconds >= 30) {
      const idx = stop.pointIndex;
      // Don't add if too close to existing boundary
      const tooClose = boundaries.some(b => Math.abs(points[idx]?.distance - points[b]?.distance) < 100);
      if (!tooClose) boundaries.push(idx);
    }
  }

  boundaries.push(points.length - 1); // always end
  boundaries.sort((a, b) => a - b);

  return enforceMaxSegmentLength(points, [...new Set(boundaries)]);
}

/**
 * Split any span longer than MAX_SEGMENT_METERS into roughly equal pieces.
 *
 * This is the backstop that matters: when a track is too coarse for gradient
 * changes to register, the loop above yields just [0, last] and the whole ride
 * becomes one "segment". Rather than emit a 48 km "climb", cut it into
 * road-sized pieces that can at least be matched against other rides.
 */
function enforceMaxSegmentLength(points, boundaries) {
  const out = [boundaries[0]];

  for (let i = 1; i < boundaries.length; i++) {
    const startIdx = boundaries[i - 1];
    const endIdx = boundaries[i];
    const span = points[endIdx].distance - points[startIdx].distance;

    if (span > CONFIG.MAX_SEGMENT_METERS) {
      const pieces = Math.ceil(span / CONFIG.SPLIT_TARGET_METERS);
      for (let p = 1; p < pieces; p++) {
        const targetDist = points[startIdx].distance + (span * p) / pieces;
        const idx = indexAtDistance(points, startIdx, endIdx, targetDist);
        if (idx > out[out.length - 1]) out.push(idx);
      }
    }

    if (endIdx > out[out.length - 1]) out.push(endIdx);
  }

  return out;
}

/** Binary search for the point index closest to a cumulative distance. */
function indexAtDistance(points, lo, hi, targetDistance) {
  let low = lo;
  let high = hi;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].distance < targetDistance) low = mid + 1;
    else high = mid;
  }
  return low;
}

function characterizeSegment(points, startIdx, endIdx, allStops, hasTiming = true) {
  const segPoints = points.slice(startIdx, endIdx + 1);
  if (segPoints.length < 3) return null;

  const distMeters = segPoints[segPoints.length - 1].distance - segPoints[0].distance;
  const durSeconds = hasTiming
    ? segPoints[segPoints.length - 1].timestamp - segPoints[0].timestamp
    : null;

  // Elevation analysis
  let elevGain = 0;
  let elevLoss = 0;
  const gradSamples = [];

  for (let i = 1; i < segPoints.length; i++) {
    const elevDiff = segPoints[i].elevation - segPoints[i - 1].elevation;
    const distDiff = segPoints[i].distance - segPoints[i - 1].distance;

    if (Math.abs(elevDiff) >= 1) {
      if (elevDiff > 0) elevGain += elevDiff;
      else elevLoss += Math.abs(elevDiff);
    }
    if (distDiff > 5) {
      gradSamples.push((elevDiff / distDiff) * 100);
    }
  }

  const avgGrad = gradSamples.length > 0
    ? gradSamples.reduce((a, b) => a + b, 0) / gradSamples.length : 0;
  const maxGrad = gradSamples.length > 0 ? Math.max(...gradSamples) : 0;
  const minGrad = gradSamples.length > 0 ? Math.min(...gradSamples) : 0;
  const gradVar = stdDev(gradSamples);

  // Terrain classification
  const terrainType = classifyTerrain(avgGrad, gradVar, elevGain, distMeters);

  // Stops within segment
  const segStops = allStops.filter(
    s => s.distance >= segPoints[0].distance && s.distance <= segPoints[segPoints.length - 1].distance
  );

  // Sharp turns
  let sharpTurns = 0;
  for (let i = 1; i < segPoints.length - 1; i++) {
    const b1 = bearing(segPoints[i - 1].lat, segPoints[i - 1].lng, segPoints[i].lat, segPoints[i].lng);
    const b2 = bearing(segPoints[i].lat, segPoints[i].lng, segPoints[i + 1].lat, segPoints[i + 1].lng);
    let diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    if (diff >= 45) sharpTurns++;
  }

  // Power stats
  const powerSamples = segPoints.filter(p => p.power > 0).map(p => p.power);
  const avgPower = powerSamples.length > 0
    ? Math.round(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) : 0;
  const maxPower = powerSamples.length > 0 ? Math.max(...powerSamples) : 0;

  // HR stats
  const hrSamples = segPoints.filter(p => p.heartRate > 30).map(p => p.heartRate);
  const avgHR = hrSamples.length > 0
    ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : 0;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : 0;

  // Cadence
  const cadSamples = segPoints.filter(p => p.cadence > 0).map(p => p.cadence);
  const avgCadence = cadSamples.length > 0
    ? Math.round(cadSamples.reduce((a, b) => a + b, 0) / cadSamples.length) : 0;

  // Speed
  const speedSamples = segPoints.filter(p => p.speed > 0.5).map(p => p.speed);
  const avgSpeed = speedSamples.length > 0
    ? (speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length) * 3.6 : 0;

  const distKm = distMeters / 1000;

  return {
    startIdx,
    endIdx,
    startLat: segPoints[0].lat,
    startLng: segPoints[0].lng,
    endLat: segPoints[segPoints.length - 1].lat,
    endLng: segPoints[segPoints.length - 1].lng,
    coordinates: segPoints.map(p => [p.lng, p.lat]),
    distanceMeters: Math.round(distMeters),
    avgGradient: round2(avgGrad),
    maxGradient: round2(maxGrad),
    minGradient: round2(minGrad),
    gradientVariability: round2(gradVar),
    elevationGain: round1(elevGain),
    elevationLoss: round1(elevLoss),
    terrainType,
    durationSeconds: durSeconds == null ? null : Math.round(durSeconds),
    avgSpeedKmh: speedSamples.length > 0 ? round1(avgSpeed) : null,
    avgPower,
    maxPower,
    normalizedPower: avgPower, // simplified for server-side
    avgHR,
    maxHR,
    avgCadence,
    stops: segStops,
    stopCount: segStops.length,
    stopsPerKm: distKm > 0 ? round2(segStops.length / distKm) : 0,
    sharpTurnCount: sharpTurns,
    qualityScore: calculateQuality(distMeters, durSeconds, gradVar, segStops.length, sharpTurns, distKm),
  };
}

// ============================================================================
// SEGMENT PROCESSING (DEDUP + STORE)
// ============================================================================

async function processDetectedSegment(supabase, segment, activityId, userId, activity, ftp, dataQualityTier = 'measured') {
  // Try to find matching existing segment
  const existingMatch = await findMatchingExistingSegment(supabase, userId, segment);

  if (existingMatch) {
    // Update existing segment with this ride's data
    await addRideToSegment(supabase, existingMatch.id, activityId, userId, segment, activity, ftp, dataQualityTier);
    await updateSegmentProfile(supabase, existingMatch.id, ftp);
    // Recompute rollup (ride_count, first/last_ridden_at) and profile
    // (rides_last_30/90, avg_rides_per_month, frequency_tier) from
    // training_segment_rides as the source of truth. Replaces the
    // pre-migration-092 `updateSegmentMetadata` increment, which
    // silently failed because the RPC didn't exist and the JS-side
    // fallback used a non-existent supabase.raw() method.
    await recomputeTrainingSegment(supabase, existingMatch.id);

    // If existing segment is geometry_only and new data is measured, upgrade the tier
    if (existingMatch.data_quality_tier === 'geometry_only' && dataQualityTier === 'measured') {
      await supabase
        .from('training_segments')
        .update({ data_quality_tier: 'measured' })
        .eq('id', existingMatch.id);
    }

    return { isNew: false, segmentId: existingMatch.id };
  }

  // Create new segment
  const newSegmentId = await createNewSegment(supabase, userId, segment, dataQualityTier);
  await addRideToSegment(supabase, newSegmentId, activityId, userId, segment, activity, ftp, dataQualityTier);
  await createSegmentProfile(supabase, newSegmentId);
  // Rebuild auto_name via Map Matching on first creation — the reverse
  // geocode in createNewSegment is a fallback that runs even when Map
  // Matching is unavailable, but Map Matching produces road-name
  // strings ("Spine Rd → 36th") that the route coach can reference.
  await recomputeTrainingSegment(supabase, newSegmentId, { rebuildName: true });
  return { isNew: true, segmentId: newSegmentId };
}

/**
 * Find the existing segment that describes the same stretch of road.
 *
 * Identity is mutual path coverage. The previous test required both
 * endpoints within 200m plus a distance ratio plus 60% overlap — a
 * conjunction that boundary drift breaks routinely. On the live library
 * only 3 segment pairs cleared the 200m gate, 38 cleared 500m and 127
 * cleared 1km, which is a statement about the threshold rather than about
 * the roads. Mutual coverage subsumes the distance ratio: two paths that
 * each cover 80% of the other cannot differ much in length.
 */
async function findMatchingExistingSegment(supabase, userId, segment) {
  const box = bboxOf(segment.coordinates);
  if (!box) return null;

  const expansion = CONFIG.MATCH_BBOX_EXPANSION;

  // Prefilter on the candidate's whole geometry, not just its start point —
  // a long segment whose start sat outside the box used to be invisible even
  // when the new segment ran along all of it.
  const { data: candidates } = await supabase
    .from('training_segments')
    .select('id, distance_meters, geojson, data_quality_tier')
    .eq('user_id', userId)
    .is('retired_at', null)
    .lte('bbox_min_lat', box.maxLat + expansion)
    .gte('bbox_max_lat', box.minLat - expansion)
    .lte('bbox_min_lng', box.maxLng + expansion)
    .gte('bbox_max_lng', box.minLng - expansion);

  if (!candidates || candidates.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const existingCoords = candidate.geojson?.coordinates;
    if (!Array.isArray(existingCoords) || existingCoords.length < 2) continue;

    const { score } = mutualCoverage(segment.coordinates, existingCoords);

    if (score >= CONFIG.MATCH_MIN_MUTUAL_COVERAGE && score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function createNewSegment(supabase, userId, segment, dataQualityTier = 'measured') {
  // Classify topology
  const topology = classifyTopologyFromSegment(segment);

  // Calculate obstruction score
  const obstruction = calculateObstruction(segment);

  // Generate name with location
  const locationName = await reverseGeocode(segment.startLat, segment.startLng);
  const baseName = generateAutoName(segment);
  const autoName = locationName ? `${locationName} ${baseName}` : baseName;
  const description = generateDescription(segment);
  const segmentBox = bboxOf(segment.coordinates);

  const { data, error } = await supabase
    .from('training_segments')
    .insert({
      user_id: userId,
      start_lat: segment.startLat,
      start_lng: segment.startLng,
      end_lat: segment.endLat,
      end_lng: segment.endLng,
      geojson: {
        type: 'LineString',
        coordinates: segment.coordinates,
      },
      // Denormalised for candidate prefiltering — see migration 110.
      bbox_min_lat: segmentBox?.minLat ?? null,
      bbox_max_lat: segmentBox?.maxLat ?? null,
      bbox_min_lng: segmentBox?.minLng ?? null,
      bbox_max_lng: segmentBox?.maxLng ?? null,
      distance_meters: segment.distanceMeters,
      auto_name: autoName,
      description,
      avg_gradient: segment.avgGradient,
      max_gradient: segment.maxGradient,
      min_gradient: segment.minGradient,
      gradient_variability: segment.gradientVariability,
      elevation_gain_meters: segment.elevationGain,
      elevation_loss_meters: segment.elevationLoss,
      terrain_type: segment.terrainType,
      obstruction_score: obstruction.overall,
      stop_count: segment.stopCount,
      stops_per_km: segment.stopsPerKm,
      traffic_signal_count: 0, // determined later via cross-ride analysis
      sharp_turn_count: segment.sharpTurnCount,
      max_uninterrupted_seconds: obstruction.maxUninterrupted,
      topology: topology.topology,
      is_repeatable: topology.isRepeatable,
      // ride_count / first_ridden_at / last_ridden_at are owned by
      // recompute_training_segment_rollup, which runs immediately after the
      // first traversal row is written. Seeding them here (with NOW(), not
      // the activity date) only created values that had to be corrected.
      ride_count: 0,
      confidence_score: dataQualityTier === 'geometry_only' ? 15 : 20,
      data_quality_tier: dataQualityTier,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SegmentPipeline] Error creating segment:', error.message);
    throw error;
  }

  return data.id;
}

async function addRideToSegment(supabase, segmentId, activityId, userId, segment, activity, ftp, dataQualityTier = 'measured') {
  // Determine power zone
  let powerZone = null;
  if (segment.avgPower > 0 && ftp > 0) {
    powerZone = classifyPowerZone(segment.avgPower, ftp);
  }

  // Determine HR zone
  let hrZone = null;
  if (segment.avgHR > 0 && activity.max_heartrate > 0) {
    hrZone = classifyHRZone(segment.avgHR, activity.max_heartrate);
  }

  const { error } = await supabase
    .from('training_segment_rides')
    .upsert({
      segment_id: segmentId,
      activity_id: activityId,
      user_id: userId,
      ridden_at: activity.start_date || new Date().toISOString(),
      match_method: 'detector',
      data_quality_tier: dataQualityTier,
      avg_power: segment.avgPower || null,
      normalized_power: segment.normalizedPower || null,
      max_power: segment.maxPower || null,
      power_zone: powerZone,
      avg_hr: segment.avgHR || null,
      max_hr: segment.maxHR || null,
      hr_zone: hrZone,
      // Null rather than fabricated when the source had no speed stream.
      duration_seconds: segment.durationSeconds ?? null,
      avg_speed: segment.avgSpeedKmh ?? null,
      avg_cadence: segment.avgCadence || null,
      stop_count: segment.stopCount,
      stop_duration_seconds: segment.stops?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0,
    }, {
      onConflict: 'segment_id,activity_id',
    });

  if (error) {
    console.error('[SegmentPipeline] Error adding ride to segment:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

async function createSegmentProfile(supabase, segmentId) {
  const { error } = await supabase
    .from('training_segment_profiles')
    .insert({
      segment_id: segmentId,
      updated_at: new Date().toISOString(),
    });

  if (error && !error.message.includes('duplicate')) {
    console.error('[SegmentPipeline] Error creating profile:', error.message);
  }
}

async function updateSegmentProfile(supabase, segmentId, ftp) {
  // Fetch all rides for this segment
  const { data: rides } = await supabase
    .from('training_segment_rides')
    .select('avg_power, normalized_power, power_zone, avg_hr, hr_zone, avg_cadence, ridden_at, duration_seconds')
    .eq('segment_id', segmentId)
    .order('ridden_at', { ascending: false });

  if (!rides || rides.length === 0) return;

  // Calculate aggregate power stats
  const powerRides = rides.filter(r => r.avg_power && r.avg_power > 0);
  const powerValues = powerRides.map(r => r.avg_power);

  const meanPower = powerValues.length > 0
    ? powerValues.reduce((a, b) => a + b, 0) / powerValues.length : null;
  const sdPower = powerValues.length >= 2 ? stdDev(powerValues) : null;

  // Consistency score
  const consistencyScore = meanPower && sdPower !== null
    ? Math.max(0, Math.min(100, Math.round(100 - (sdPower / meanPower) * 200)))
    : 0;

  // Zone distribution
  const zoneDistribution = {};
  const totalZoneRides = powerRides.filter(r => r.power_zone).length;
  if (totalZoneRides > 0) {
    for (const ride of powerRides) {
      if (ride.power_zone) {
        zoneDistribution[ride.power_zone] = (zoneDistribution[ride.power_zone] || 0) + 1;
      }
    }
    for (const zone of Object.keys(zoneDistribution)) {
      zoneDistribution[zone] = round2(zoneDistribution[zone] / totalZoneRides);
    }
  }

  // Most common power zone
  const typicalZone = Object.entries(zoneDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // HR stats
  const hrRides = rides.filter(r => r.avg_hr && r.avg_hr > 30);
  const meanHR = hrRides.length > 0
    ? Math.round(hrRides.reduce((sum, r) => sum + r.avg_hr, 0) / hrRides.length) : null;
  const typicalHRZone = hrRides.filter(r => r.hr_zone).length > 0
    ? hrRides.map(r => r.hr_zone).sort((a, b) =>
        hrRides.filter(r => r.hr_zone === b).length -
        hrRides.filter(r => r.hr_zone === a).length
      )[0]
    : null;

  // Cadence
  const cadRides = rides.filter(r => r.avg_cadence && r.avg_cadence > 0);
  const meanCadence = cadRides.length > 0
    ? Math.round(cadRides.reduce((sum, r) => sum + r.avg_cadence, 0) / cadRides.length) : null;

  // Frequency analysis
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const ridesLast30 = rides.filter(r => new Date(r.ridden_at) >= thirtyDaysAgo).length;
  const ridesLast90 = rides.filter(r => new Date(r.ridden_at) >= ninetyDaysAgo).length;

  // Calculate rides per month (over last 90 days or total span)
  const firstRide = new Date(rides[rides.length - 1].ridden_at);
  const monthsSpan = Math.max(1, (now - firstRide) / (30 * 24 * 60 * 60 * 1000));
  const ridesPerMonth = round1(rides.length / monthsSpan);

  // Frequency tier
  let frequencyTier = 'rare';
  if (ridesPerMonth >= 4) frequencyTier = 'primary';
  else if (ridesPerMonth >= 2) frequencyTier = 'regular';
  else if (ridesPerMonth >= 1) frequencyTier = 'occasional';

  // Relevance score
  const baseScore = Math.min(50, rides.length * 5);
  const recencyScore = rides.length > 0 ? (ridesLast30 / rides.length) * 30 : 0;
  const freqScore = Math.min(20, ridesPerMonth * 10);
  const relevanceScore = Math.min(100, Math.round(baseScore + recencyScore + freqScore));

  // Typical days of week
  const dayCounts = {};
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const ride of rides) {
    const day = dayNames[new Date(ride.ridden_at).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const typicalDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day);

  // Training suitability flags
  const { data: segmentData } = await supabase
    .from('training_segments')
    .select('obstruction_score, max_uninterrupted_seconds, terrain_type, data_quality_tier')
    .eq('id', segmentId)
    .single();

  const obs = segmentData?.obstruction_score || 0;
  const maxUnint = segmentData?.max_uninterrupted_seconds || 0;
  const terrain = segmentData?.terrain_type || 'flat';

  // Update profile
  await supabase
    .from('training_segment_profiles')
    .upsert({
      segment_id: segmentId,
      mean_avg_power: meanPower ? round1(meanPower) : null,
      std_dev_power: sdPower !== null ? round1(sdPower) : null,
      min_avg_power: powerValues.length > 0 ? round1(Math.min(...powerValues)) : null,
      max_avg_power: powerValues.length > 0 ? round1(Math.max(...powerValues)) : null,
      mean_normalized_power: meanPower ? round1(meanPower * 1.02) : null, // approximate
      typical_power_zone: typicalZone,
      zone_distribution: zoneDistribution,
      consistency_score: consistencyScore,
      mean_avg_hr: meanHR,
      typical_hr_zone: typicalHRZone,
      mean_cadence: meanCadence,
      suitable_for_steady_state: obs >= 75 && maxUnint >= 300,
      suitable_for_short_intervals: obs >= 60 && maxUnint >= 60,
      suitable_for_sprints: obs >= 50 && maxUnint >= 15,
      suitable_for_recovery: terrain === 'flat' || terrain === 'descent',
      rides_last_30_days: ridesLast30,
      rides_last_90_days: ridesLast90,
      avg_rides_per_month: ridesPerMonth,
      frequency_tier: frequencyTier,
      typical_days: typicalDays,
      relevance_score: relevanceScore,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'segment_id',
    });

  // Update confidence score on main segment
  const lastRidden = rides[0]?.ridden_at ? new Date(rides[0].ridden_at) : null;
  const daysSince = lastRidden ? (now - lastRidden) / (86400000) : 999;
  const qualityTier = segmentData?.data_quality_tier || 'measured';

  // Base confidence from *comparable* traversals, not all of them. A
  // familiarity-only row says the rider was here, not how they were going,
  // so a segment with fourteen untimed passes and no measured effort should
  // not read as 95% confident.
  const comparableCount = rides.filter(r => r.duration_seconds != null).length;
  let confidence = comparableCount >= 15 ? 95 : comparableCount >= 8 ? 85 : comparableCount >= 5 ? 70
    : comparableCount >= 3 ? 50 : comparableCount >= 2 ? 35 : 20;

  // Data quality modifier: measured rides boost confidence, geometry-only stays at base
  const hasMeasuredRides = powerRides.length > 0;
  if (hasMeasuredRides) {
    confidence += 15; // measured data available
  } else if (qualityTier === 'geometry_only') {
    // geometry_only with no measured rides — cap confidence lower
    confidence = Math.min(confidence, 60);
  }

  // Recency modifier
  if (daysSince < 14) confidence += 5;
  else if (daysSince >= 30 && daysSince < 90) confidence -= 10;
  else if (daysSince >= 90) confidence -= 20;
  confidence = Math.max(0, Math.min(100, confidence));

  // ride_count is deliberately NOT written here. recompute_training_segment_rollup
  // (migration 092) is its single writer, derived from training_segment_rides.
  // Two writers in one request is how the counts drifted in the first place.
  await supabase
    .from('training_segments')
    .update({
      confidence_score: confidence,
    })
    .eq('id', segmentId);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function classifyTerrain(avgGrad, gradVar, elevGain, distMeters) {
  const absGrad = Math.abs(avgGrad);
  const elevPerKm = distMeters > 0 ? (elevGain / (distMeters / 1000)) : 0;

  if (gradVar > 3 && absGrad < 4) return 'rolling';
  if (avgGrad >= 4 || elevPerKm > 30) return 'climb';
  if (avgGrad <= -4) return 'descent';
  if (absGrad < 2 && gradVar < 2) return 'flat';
  return 'rolling';
}

function classifyTopologyFromSegment(segment) {
  const startEndDist = haversineMeters(
    segment.startLat, segment.startLng,
    segment.endLat, segment.endLng
  );

  if (startEndDist < 200) return { topology: 'loop', isRepeatable: true };
  if (startEndDist < 500 && segment.coordinates.length > 4) {
    const midIdx = Math.floor(segment.coordinates.length / 2);
    const mid = segment.coordinates[midIdx];
    const midToStart = haversineMeters(mid[1], mid[0], segment.startLat, segment.startLng);
    if (midToStart > startEndDist * 1.5) {
      return { topology: 'out_and_back', isRepeatable: true };
    }
  }
  return { topology: 'point_to_point', isRepeatable: false };
}

function calculateObstruction(segment) {
  const distKm = segment.distanceMeters / 1000;
  const stopFreq = Math.max(0, Math.min(100, Math.round(100 - (segment.stopsPerKm * 30))));
  const turnsPerKm = distKm > 0 ? segment.sharpTurnCount / distKm : 0;
  const turnScore = Math.max(0, Math.min(100, Math.round(100 - turnsPerKm * 20)));
  const surfScore = Math.max(0, Math.min(100, Math.round(100 - segment.gradientVariability * 5)));
  const overall = Math.round(stopFreq * 0.4 + turnScore * 0.25 + surfScore * 0.35);

  // Estimate max uninterrupted time. Column is INTEGER NOT NULL-ish in
  // practice, so an untimed segment reports 0 rather than null/NaN.
  let maxUninterrupted = segment.durationSeconds ?? 0;
  if (segment.stopCount > 0 && segment.durationSeconds > 0) {
    const avgSpeed = segment.distanceMeters / segment.durationSeconds;
    if (avgSpeed > 0) {
      // Rough: divide distance equally between stops
      const gapDist = segment.distanceMeters / (segment.stopCount + 1);
      maxUninterrupted = Math.round(gapDist / avgSpeed);
    }
  }

  return { overall, maxUninterrupted };
}

/**
 * Reverse geocode coordinates to get a locality/neighborhood name.
 * Returns the most specific place name available (neighborhood > locality > place).
 */
async function reverseGeocode(lat, lng) {
  if (!MAPBOX_ACCESS_TOKEN || !lat || !lng) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=neighborhood,locality,place&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    // Use the short text (e.g. "Hawk Hill", "Marina District")
    return feature.text || null;
  } catch {
    return null;
  }
}

function generateAutoName(segment) {
  const suffix = segment.terrainType === 'climb' ? 'Climb'
    : segment.terrainType === 'descent' ? 'Descent'
    : segment.terrainType === 'rolling' ? 'Rolling'
    : 'Flat';
  const distKm = (segment.distanceMeters / 1000).toFixed(1);

  // Untimed (polyline-derived) segments have no duration to name themselves
  // by, so they fall back to the distance form rather than "NaN min Climb".
  if (segment.terrainType === 'climb' && segment.durationSeconds != null) {
    const durMin = Math.round(segment.durationSeconds / 60);
    return `${durMin} min ${suffix} ${segment.avgGradient.toFixed(1)}%`;
  }
  if (segment.terrainType === 'climb') {
    return `${suffix} ${distKm}km ${segment.avgGradient.toFixed(1)}%`;
  }
  return `${suffix} ${distKm}km`;
}

function generateDescription(segment) {
  const parts = [];
  const duration = segment.durationSeconds == null
    ? null
    : segment.durationSeconds < 60
      ? `${Math.round(segment.durationSeconds)}s`
      : `${Math.round(segment.durationSeconds / 60)} min`;

  const terrainDesc = segment.terrainType === 'climb'
    ? (segment.avgGradient >= 8 ? 'steep climb' : segment.avgGradient >= 5 ? 'sustained climb' : 'gradual climb')
    : segment.terrainType;

  parts.push(duration ? `${duration} ${terrainDesc}` : `${(segment.distanceMeters / 1000).toFixed(1)}km ${terrainDesc}`);
  if (segment.terrainType === 'climb' || segment.terrainType === 'rolling') {
    parts.push(`${segment.avgGradient.toFixed(1)}% avg`);
  }
  parts.push(segment.stopCount === 0 ? 'no stops' : `${segment.stopCount} stop${segment.stopCount > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function classifyPowerZone(avgPower, ftp) {
  if (ftp <= 0 || avgPower <= 0) return null;
  const ratio = avgPower / ftp;
  for (const [zone, [min, max]] of Object.entries(CONFIG.POWER_ZONES)) {
    if (ratio >= min && ratio < max) return zone;
  }
  return 'anaerobic';
}

function classifyHRZone(avgHR, maxHR) {
  if (maxHR <= 0 || avgHR <= 0) return null;
  const ratio = avgHR / maxHR;
  for (const [zone, [min, max]] of Object.entries(CONFIG.HR_ZONES)) {
    if (ratio >= min && ratio < max) return zone;
  }
  return 'anaerobic';
}

function calculateQuality(distM, durS, gradVar, stops, turns, distKm) {
  let score = 100;
  if (distM < 1000) score -= 15;
  else if (distM < 2000) score -= 5;
  // Untimed segments are neither rewarded nor punished on duration.
  if (durS != null) {
    if (durS < 180) score -= 15;
    else if (durS < 300) score -= 5;
  }
  if (gradVar > 5) score -= 20;
  else if (gradVar > 3) score -= 10;
  const sPerKm = distKm > 0 ? stops / distKm : 0;
  if (sPerKm > 2) score -= 25;
  else if (sPerKm > 1) score -= 15;
  else if (sPerKm > 0.5) score -= 5;
  const tPerKm = distKm > 0 ? turns / distKm : 0;
  if (tPerKm > 3) score -= 15;
  else if (tPerKm > 1) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================================
// MATH HELPERS
// ============================================================================

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
