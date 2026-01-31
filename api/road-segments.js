/**
 * Vercel API Route: Road Segments
 * Handles road segment extraction from activities and preference-based route scoring
 */

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import {
  extractAndStoreActivitySegments,
  extractSegmentsForUser,
  scoreRoutePreferences,
  extractSegmentsFromPolyline,
  extractSegmentsFromPoints,
  decodePolyline,
} from './utils/roadSegmentExtractor.js';

// Initialize Supabase (server-side with service key for full access)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Extract and validate user from Authorization header
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth token validation failed:', error?.message);
    return null;
  }

  return user;
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Validate authentication
  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { action } = req.method === 'GET' ? req.query : req.body;

    switch (action) {
      case 'extract_activity':
        return await extractActivitySegments(req, res, authUser);

      case 'extract_all':
        return await extractAllActivitySegments(req, res, authUser);

      case 'score_route':
        return await scoreRoute(req, res, authUser);

      case 'score_routes':
        return await scoreMultipleRoutes(req, res, authUser);

      case 'get_stats':
        return await getSegmentStats(req, res, authUser);

      case 'get_preferences':
        return await getPreferences(req, res, authUser);

      case 'update_preferences':
        return await updatePreferences(req, res, authUser);

      case 'get_familiar_segments':
        return await getFamiliarSegments(req, res, authUser);

      case 'visualize_segments':
        return await visualizeSegments(req, res, authUser);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: [
            'extract_activity',
            'extract_all',
            'score_route',
            'score_routes',
            'get_stats',
            'get_preferences',
            'update_preferences',
            'get_familiar_segments',
            'visualize_segments'
          ]
        });
    }

  } catch (error) {
    console.error('Road Segments API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Extract segments from a single activity
 */
async function extractActivitySegments(req, res, authUser) {
  const { activityId } = req.body;

  if (!activityId) {
    return res.status(400).json({ error: 'activityId required' });
  }

  console.log(`🛣️ Extracting segments for activity ${activityId}`);

  const result = await extractAndStoreActivitySegments(activityId, authUser.id);

  return res.json({
    success: result.errors.length === 0,
    ...result
  });
}

/**
 * Extract segments from all unprocessed activities
 */
async function extractAllActivitySegments(req, res, authUser) {
  const {
    limit = 5,  // Small default to avoid timeout
    force = false,
    months = null
  } = req.body || {};

  console.log(`🛣️ Extracting segments for user ${authUser.id} (limit: ${limit}, force: ${force})`);

  // Calculate date filter if specified
  let afterDate = null;
  if (months && months > 0) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    afterDate = cutoffDate.toISOString();
  }

  const result = await extractSegmentsForUser(authUser.id, {
    limit: Math.min(parseInt(limit) || 5, 10),  // Cap at 10 to avoid timeout
    includeProcessed: force,
    afterDate
  });

  return res.json({
    success: result.errors.length === 0 || result.processed > 0,
    activitiesProcessed: result.processed,
    segmentsStored: result.segments,
    remaining: result.remaining,
    errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    message: result.remaining > 0
      ? `Processed ${result.processed} activities (${result.segments} segments). ${result.remaining} more remaining.`
      : `Processed ${result.processed} activities (${result.segments} segments). All done!`
  });
}

/**
 * Score a single route based on user's road preferences
 * Accepts either polyline OR coordinates array [[lng, lat], ...]
 */
async function scoreRoute(req, res, authUser) {
  const { polyline, coordinates, routeId } = req.body;

  // If coordinates provided directly, use them
  if (coordinates && Array.isArray(coordinates) && coordinates.length > 0) {
    const score = await scoreRouteFromCoordinates(coordinates, authUser.id);
    return res.json({
      success: true,
      score
    });
  }

  let routePolyline = polyline;

  // If routeId provided, fetch the route's polyline
  if (routeId && !polyline) {
    const { data: route, error } = await supabase
      .from('routes')
      .select('geometry')
      .eq('id', routeId)
      .eq('user_id', authUser.id)
      .single();

    if (error || !route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Convert GeoJSON to coordinates if available
    if (route.geometry?.coordinates) {
      const score = await scoreRouteFromCoordinates(route.geometry.coordinates, authUser.id);
      return res.json({
        success: true,
        score
      });
    }
  }

  if (!routePolyline) {
    return res.status(400).json({ error: 'polyline, coordinates, or routeId required' });
  }

  const score = await scoreRoutePreferences(routePolyline, authUser.id);

  return res.json({
    success: true,
    score
  });
}

/**
 * Score a route from coordinates array [[lng, lat], ...]
 */
async function scoreRouteFromCoordinates(coordinates, userId) {
  // Convert coordinates to the format expected by extractSegmentsFromPolyline
  // The coordinates are [lng, lat] but extractSegmentsFromPolyline expects {lat, lng}
  const points = coordinates.map(([lng, lat]) => ({ lat, lng }));

  // Extract segments directly from points
  const routeSegments = extractSegmentsFromPoints(points);

  if (routeSegments.length === 0) {
    return {
      overallScore: 1.0,
      familiarSegments: 0,
      unknownSegments: 0,
      totalSegments: 0,
      familiarKm: 0,
      unknownKm: 0,
      confidence: 'unknown',
    };
  }

  const segmentHashes = routeSegments.map(s => s.segmentHash);

  // Fetch user's preferences for these segments
  const { data: preferences, error } = await supabase.rpc('get_segment_preferences', {
    p_user_id: userId,
    p_segment_hashes: segmentHashes,
  });

  if (error) {
    console.error('Failed to fetch preferences:', error);
    return {
      overallScore: 1.0,
      familiarSegments: 0,
      unknownSegments: routeSegments.length,
      totalSegments: routeSegments.length,
      confidence: 'unknown',
      error: error.message,
    };
  }

  const prefMap = new Map(preferences?.map(p => [p.segment_hash, p]) || []);

  // Calculate scores
  let totalScore = 0;
  let familiarKm = 0;
  let unknownKm = 0;
  let familiarCount = 0;

  for (const segment of routeSegments) {
    const pref = prefMap.get(segment.segmentHash);
    const segmentKm = segment.lengthM / 1000;

    if (pref && pref.ride_count > 0) {
      totalScore += pref.preference_score * segmentKm;
      familiarKm += segmentKm;
      familiarCount++;
    } else {
      totalScore += 0.5 * segmentKm; // Neutral score for unknown segments
      unknownKm += segmentKm;
    }
  }

  const totalKm = familiarKm + unknownKm;
  const avgScore = totalKm > 0 ? totalScore / totalKm : 0.5;

  return {
    overallScore: parseFloat(avgScore.toFixed(3)),
    familiarSegments: familiarCount,
    unknownSegments: routeSegments.length - familiarCount,
    totalSegments: routeSegments.length,
    familiarKm: parseFloat(familiarKm.toFixed(2)),
    unknownKm: parseFloat(unknownKm.toFixed(2)),
    familiarityPercent: parseFloat(((familiarKm / totalKm) * 100).toFixed(1)),
    confidence: familiarCount > 5 ? 'high' : familiarCount > 0 ? 'medium' : 'unknown',
  };
}

/**
 * Score multiple routes and rank them by preference
 */
async function scoreMultipleRoutes(req, res, authUser) {
  const { routes } = req.body;

  if (!routes || !Array.isArray(routes) || routes.length === 0) {
    return res.status(400).json({ error: 'routes array required' });
  }

  const scoredRoutes = [];

  for (const route of routes) {
    if (!route.polyline) continue;

    const score = await scoreRoutePreferences(route.polyline, authUser.id);
    scoredRoutes.push({
      id: route.id,
      name: route.name,
      ...score
    });
  }

  // Sort by preference score (highest first)
  scoredRoutes.sort((a, b) => b.overallScore - a.overallScore);

  return res.json({
    success: true,
    routes: scoredRoutes,
    bestRoute: scoredRoutes[0] || null
  });
}

/**
 * Get user's segment statistics
 */
async function getSegmentStats(req, res, authUser) {
  let stats = {
    total_segments: 0,
    total_rides: 0,
    unique_km: 0,
    most_ridden_count: 0,
    segments_by_ride_count: {},
    recent_new_segments: 0
  };
  let unprocessedCount = 0;
  let hasSegmentsColumn = true;

  // Try to get segment stats from RPC
  const { data, error } = await supabase.rpc('get_user_segment_stats', {
    p_user_id: authUser.id
  });

  if (error) {
    console.error('Error fetching segment stats:', error);
    // Check if it's a "function does not exist" error
    if (error.message?.includes('function') || error.code === '42883') {
      return res.status(500).json({
        error: 'Database function does not exist. Please run the migration.',
        needsMigration: true
      });
    }
  } else if (data?.[0]) {
    stats = data[0];
  }

  // Try to count unprocessed activities
  // First check if segments_extracted_at column exists by trying the query
  const { count, error: countError } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', authUser.id)
    .not('map_summary_polyline', 'is', null)
    .is('segments_extracted_at', null);

  if (countError) {
    console.error('Error counting unprocessed activities:', countError);
    // If column doesn't exist, count all activities with GPS data
    if (countError.message?.includes('segments_extracted_at') || countError.code === '42703') {
      hasSegmentsColumn = false;
      const { count: allCount } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authUser.id)
        .not('map_summary_polyline', 'is', null);
      unprocessedCount = allCount || 0;
    }
  } else {
    unprocessedCount = count || 0;
  }

  return res.json({
    success: true,
    stats,
    unprocessedActivities: unprocessedCount,
    needsColumnMigration: !hasSegmentsColumn
  });
}

/**
 * Get user's road preference settings
 */
async function getPreferences(req, res, authUser) {
  const { data, error } = await supabase
    .from('user_road_preferences')
    .select('*')
    .eq('user_id', authUser.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }

  // Return defaults if no preferences set
  const preferences = data || {
    familiarity_strength: 50,
    explore_mode: false,
    min_rides_for_familiar: 2,
    recency_weight: 30,
    familiarity_decay_days: 180
  };

  return res.json({
    success: true,
    preferences
  });
}

/**
 * Update user's road preference settings
 */
async function updatePreferences(req, res, authUser) {
  const {
    familiarity_strength,
    explore_mode,
    min_rides_for_familiar,
    recency_weight,
    familiarity_decay_days
  } = req.body;

  const updates = {};
  if (familiarity_strength !== undefined) updates.familiarity_strength = familiarity_strength;
  if (explore_mode !== undefined) updates.explore_mode = explore_mode;
  if (min_rides_for_familiar !== undefined) updates.min_rides_for_familiar = min_rides_for_familiar;
  if (recency_weight !== undefined) updates.recency_weight = recency_weight;
  if (familiarity_decay_days !== undefined) updates.familiarity_decay_days = familiarity_decay_days;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No preference updates provided' });
  }

  const { data, error } = await supabase
    .from('user_road_preferences')
    .upsert({
      user_id: authUser.id,
      ...updates,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Error updating preferences:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }

  return res.json({
    success: true,
    preferences: data
  });
}

/**
 * Get familiar segments in a bounding box (for map visualization)
 */
async function getFamiliarSegments(req, res, authUser) {
  const {
    minLat,
    maxLat,
    minLng,
    maxLng,
    minRideCount = 1
  } = req.method === 'GET' ? req.query : req.body;

  if (!minLat || !maxLat || !minLng || !maxLng) {
    return res.status(400).json({ error: 'Bounding box required (minLat, maxLat, minLng, maxLng)' });
  }

  const { data, error } = await supabase.rpc('get_user_segments_in_bbox', {
    p_user_id: authUser.id,
    p_min_lat: parseFloat(minLat),
    p_max_lat: parseFloat(maxLat),
    p_min_lng: parseFloat(minLng),
    p_max_lng: parseFloat(maxLng),
    p_min_ride_count: parseInt(minRideCount) || 1
  });

  if (error) {
    console.error('Error fetching segments in bbox:', error);
    return res.status(500).json({ error: 'Failed to fetch segments' });
  }

  return res.json({
    success: true,
    segments: data || [],
    count: data?.length || 0
  });
}

/**
 * Get segments formatted for map visualization (GeoJSON)
 */
async function visualizeSegments(req, res, authUser) {
  const {
    minLat,
    maxLat,
    minLng,
    maxLng,
    minRideCount = 1,
    limit = 1000
  } = req.method === 'GET' ? req.query : req.body;

  if (!minLat || !maxLat || !minLng || !maxLng) {
    return res.status(400).json({ error: 'Bounding box required' });
  }

  const { data: segments, error } = await supabase.rpc('get_user_segments_in_bbox', {
    p_user_id: authUser.id,
    p_min_lat: parseFloat(minLat),
    p_max_lat: parseFloat(maxLat),
    p_min_lng: parseFloat(minLng),
    p_max_lng: parseFloat(maxLng),
    p_min_ride_count: parseInt(minRideCount) || 1
  });

  if (error) {
    console.error('Error fetching segments:', error);
    return res.status(500).json({ error: 'Failed to fetch segments' });
  }

  // Convert to GeoJSON FeatureCollection
  const features = (segments || []).slice(0, limit).map(segment => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [segment.start_lng, segment.start_lat],
        [segment.end_lng, segment.end_lat]
      ]
    },
    properties: {
      id: segment.id,
      rideCount: segment.ride_count,
      lastRidden: segment.last_ridden_at,
      roadName: segment.road_name,
      roadType: segment.road_type,
      // Color coding based on ride count
      color: getSegmentColor(segment.ride_count),
      opacity: getSegmentOpacity(segment.ride_count)
    }
  }));

  return res.json({
    type: 'FeatureCollection',
    features,
    metadata: {
      totalSegments: segments?.length || 0,
      returned: features.length,
      truncated: (segments?.length || 0) > limit
    }
  });
}

/**
 * Get color for segment based on ride count
 */
function getSegmentColor(rideCount) {
  if (rideCount >= 10) return '#22c55e'; // Green - very familiar
  if (rideCount >= 5) return '#84cc16';  // Lime - familiar
  if (rideCount >= 3) return '#eab308';  // Yellow - known
  if (rideCount >= 2) return '#f97316';  // Orange - somewhat known
  return '#6b7280';                       // Gray - ridden once
}

/**
 * Get opacity for segment based on ride count
 */
function getSegmentOpacity(rideCount) {
  if (rideCount >= 10) return 0.9;
  if (rideCount >= 5) return 0.8;
  if (rideCount >= 3) return 0.7;
  if (rideCount >= 2) return 0.6;
  return 0.5;
}
