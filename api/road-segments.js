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
    limit = 50,
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
    limit: Math.min(parseInt(limit) || 50, 100),
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
 */
async function scoreRoute(req, res, authUser) {
  const { polyline, routeId } = req.body;

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

    // Convert GeoJSON to polyline if needed
    if (route.geometry?.coordinates) {
      // The route stores coordinates as GeoJSON, we need to extract them
      // For now, return an error - routes should provide polyline
      return res.status(400).json({
        error: 'Route preference scoring requires polyline format. Use an activity polyline or generated route.'
      });
    }
  }

  if (!routePolyline) {
    return res.status(400).json({ error: 'polyline or routeId required' });
  }

  const score = await scoreRoutePreferences(routePolyline, authUser.id);

  return res.json({
    success: true,
    score
  });
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
  const { data, error } = await supabase.rpc('get_user_segment_stats', {
    p_user_id: authUser.id
  });

  if (error) {
    console.error('Error fetching segment stats:', error);
    return res.status(500).json({ error: 'Failed to fetch segment statistics' });
  }

  // Also get count of unprocessed activities
  const { count: unprocessedCount } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', authUser.id)
    .not('map_summary_polyline', 'is', null)
    .is('segments_extracted_at', null);

  return res.json({
    success: true,
    stats: data?.[0] || {
      total_segments: 0,
      total_rides: 0,
      unique_km: 0,
      most_ridden_count: 0,
      segments_by_ride_count: {},
      recent_new_segments: 0
    },
    unprocessedActivities: unprocessedCount || 0
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
