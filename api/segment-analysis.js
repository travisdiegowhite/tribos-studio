/**
 * Segment Analysis API Route
 *
 * POST /api/segment-analysis
 *   Actions:
 *     - analyze_activity: Analyze a single activity for training segments
 *     - analyze_all: Analyze all unprocessed activities for a user
 *     - get_segments: Retrieve user's segment library
 *     - get_segment_detail: Get detailed segment info including rides and profile
 *     - update_segment_name: Update a segment's custom name
 *     - get_matches: Get workout-segment matches for a workout type
 */

import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders } from './utils/cors.js';
import { analyzeActivitySegments, analyzeUnprocessedActivities } from './utils/segmentAnalysisPipeline.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Verify the user's JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = user.id;
  const { action, ...params } = req.body || {};

  try {
    switch (action) {
      case 'analyze_activity':
        return await handleAnalyzeActivity(res, userId, params);

      case 'analyze_all':
        return await handleAnalyzeAll(res, userId, params);

      case 'get_segments':
        return await handleGetSegments(res, supabase, userId, params);

      case 'get_segment_detail':
        return await handleGetSegmentDetail(res, supabase, userId, params);

      case 'update_segment_name':
        return await handleUpdateSegmentName(res, supabase, userId, params);

      case 'get_matches':
        return await handleGetMatches(res, supabase, userId, params);

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error('[SegmentAnalysis] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleAnalyzeActivity(res, userId, params) {
  const { activityId } = params;
  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  const result = await analyzeActivitySegments(activityId, userId);
  return res.status(200).json(result);
}

async function handleAnalyzeAll(res, userId, params) {
  const { limit = 20 } = params;
  const result = await analyzeUnprocessedActivities(userId, Math.min(limit, 50));
  return res.status(200).json(result);
}

async function handleGetSegments(res, supabase, userId, params) {
  const {
    terrainType,
    minScore,
    sortBy = 'relevance',
    limit = 50,
    offset = 0,
  } = params;

  let query = supabase
    .from('training_segments')
    .select(`
      id,
      display_name,
      auto_name,
      custom_name,
      description,
      start_lat,
      start_lng,
      end_lat,
      end_lng,
      distance_meters,
      avg_gradient,
      max_gradient,
      gradient_variability,
      elevation_gain_meters,
      terrain_type,
      obstruction_score,
      stop_count,
      stops_per_km,
      sharp_turn_count,
      max_uninterrupted_seconds,
      topology,
      is_repeatable,
      ride_count,
      first_ridden_at,
      last_ridden_at,
      confidence_score,
      training_segment_profiles (
        mean_avg_power,
        std_dev_power,
        typical_power_zone,
        zone_distribution,
        consistency_score,
        mean_avg_hr,
        typical_hr_zone,
        mean_cadence,
        suitable_for_steady_state,
        suitable_for_short_intervals,
        suitable_for_sprints,
        suitable_for_recovery,
        rides_last_30_days,
        rides_last_90_days,
        avg_rides_per_month,
        frequency_tier,
        typical_days,
        relevance_score
      )
    `)
    .eq('user_id', userId);

  // Filters
  if (terrainType) {
    query = query.eq('terrain_type', terrainType);
  }
  if (minScore) {
    query = query.gte('confidence_score', minScore);
  }

  // Sorting
  switch (sortBy) {
    case 'relevance':
      query = query.order('last_ridden_at', { ascending: false });
      break;
    case 'ride_count':
      query = query.order('ride_count', { ascending: false });
      break;
    case 'distance':
      query = query.order('distance_meters', { ascending: false });
      break;
    case 'obstruction':
      query = query.order('obstruction_score', { ascending: false });
      break;
    case 'confidence':
      query = query.order('confidence_score', { ascending: false });
      break;
    default:
      query = query.order('last_ridden_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    segments: data || [],
    total: count,
    limit,
    offset,
  });
}

async function handleGetSegmentDetail(res, supabase, userId, params) {
  const { segmentId } = params;
  if (!segmentId) {
    return res.status(400).json({ error: 'segmentId required' });
  }

  // Fetch segment with profile
  const { data: segment, error: segError } = await supabase
    .from('training_segments')
    .select(`
      *,
      training_segment_profiles (*),
      training_segment_rides (
        id,
        activity_id,
        ridden_at,
        avg_power,
        normalized_power,
        max_power,
        power_zone,
        avg_hr,
        max_hr,
        hr_zone,
        duration_seconds,
        avg_speed,
        avg_cadence,
        stop_count
      )
    `)
    .eq('id', segmentId)
    .eq('user_id', userId)
    .single();

  if (segError) {
    return res.status(404).json({ error: 'Segment not found' });
  }

  // Sort rides by date (most recent first)
  if (segment.training_segment_rides) {
    segment.training_segment_rides.sort(
      (a, b) => new Date(b.ridden_at) - new Date(a.ridden_at)
    );
  }

  return res.status(200).json({ segment });
}

async function handleUpdateSegmentName(res, supabase, userId, params) {
  const { segmentId, customName } = params;
  if (!segmentId) {
    return res.status(400).json({ error: 'segmentId required' });
  }

  const { error } = await supabase
    .from('training_segments')
    .update({ custom_name: customName || null })
    .eq('id', segmentId)
    .eq('user_id', userId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}

async function handleGetMatches(res, supabase, userId, params) {
  const { workoutType, limit = 10 } = params;

  let query = supabase
    .from('workout_segment_matches')
    .select(`
      *,
      training_segments (
        id,
        display_name,
        description,
        distance_meters,
        avg_gradient,
        terrain_type,
        obstruction_score,
        topology,
        is_repeatable,
        ride_count,
        confidence_score,
        geojson
      )
    `)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('match_score', { ascending: false })
    .limit(limit);

  if (workoutType) {
    query = query.eq('workout_type', workoutType);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ matches: data || [] });
}
