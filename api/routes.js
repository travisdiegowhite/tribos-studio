// Vercel API Route: Routes Management
// Handles CRUD operations for user cycling routes

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { completeActivationStep } from './utils/activation.js';

// Initialize Supabase (server-side with service role)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Extract and validate user from Authorization header
 * Returns user object or null if not authenticated
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

/**
 * Validate that authenticated user matches the requested userId
 * Returns error response if validation fails, null if valid
 */
async function validateUserAccess(req, res, requestedUserId) {
  const authUser = await getUserFromAuthHeader(req);

  if (!authUser) {
    // Authentication required - reject unauthenticated requests
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please sign in to access routes'
    });
  }

  if (authUser.id !== requestedUserId) {
    console.error(`🚨 User ID mismatch: auth user ${authUser.id} requested data for ${requestedUserId}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You can only access your own data'
    });
  }

  return null; // Validation passed
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, routeId, routeData } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate that authenticated user matches requested userId
    const validationError = await validateUserAccess(req, res, userId);
    if (validationError) {
      return; // Response already sent
    }

    switch (action) {
      case 'save_route':
        return await saveRoute(req, res, userId, routeData);

      case 'list_routes':
        return await listRoutes(req, res, userId);

      case 'get_route':
        return await getRoute(req, res, userId, routeId);

      case 'delete_route':
        return await deleteRoute(req, res, userId, routeId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Routes API error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Save a new route or update existing
 */
async function saveRoute(req, res, userId, routeData) {
  if (!routeData) {
    return res.status(400).json({ error: 'routeData required' });
  }

  if (!routeData.name || !routeData.geometry) {
    return res.status(400).json({ error: 'Route name and geometry are required' });
  }

  try {
    // Extract start/end coordinates from geometry
    const coordinates = routeData.geometry?.coordinates || [];
    const startCoord = coordinates[0];
    const endCoord = coordinates[coordinates.length - 1];

    const routeRecord = {
      user_id: userId,
      name: routeData.name,
      description: routeData.description || null,
      distance_km: routeData.distance_km || null,
      elevation_gain_m: routeData.elevation_gain_m || null,
      elevation_loss_m: routeData.elevation_loss_m || null,
      estimated_duration_minutes: routeData.estimated_duration_minutes || null,
      geometry: routeData.geometry,
      waypoints: routeData.waypoints || null,
      start_latitude: startCoord ? startCoord[1] : null,
      start_longitude: startCoord ? startCoord[0] : null,
      end_latitude: endCoord ? endCoord[1] : null,
      end_longitude: endCoord ? endCoord[0] : null,
      route_type: routeData.route_type || 'loop',
      difficulty_rating: routeData.difficulty_rating || null,
      training_goal: routeData.training_goal || null,
      surface_type: routeData.surface_type || null,
      generated_by: routeData.generated_by || 'manual',
      ai_prompt: routeData.ai_prompt || null,
      ai_suggestions: routeData.ai_suggestions || null,
      is_private: routeData.is_private !== false,
      visibility: routeData.visibility || 'private',
      tags: routeData.tags || null,
      updated_at: new Date().toISOString()
    };

    let result;

    if (routeData.id) {
      // Update existing route
      const { data, error } = await supabase
        .from('routes')
        .update(routeRecord)
        .eq('id', routeData.id)
        .eq('user_id', userId) // Ensure user owns this route
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Updated route: ${result.id}`);
    } else {
      // Insert new route
      const { data, error } = await supabase
        .from('routes')
        .insert(routeRecord)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Created route: ${result.id}`);

      // Track activation step for first route
      await completeActivationStep(supabase, userId, 'first_route').catch(() => {});
    }

    return res.status(200).json({
      success: true,
      route: result
    });

  } catch (error) {
    console.error('Save route error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * List user's routes
 */
async function listRoutes(req, res, userId) {
  try {
    const { data: routes, error } = await supabase
      .from('routes')
      .select(`
        id,
        name,
        description,
        distance_km,
        elevation_gain_m,
        estimated_duration_minutes,
        route_type,
        training_goal,
        surface_type,
        generated_by,
        is_private,
        created_at,
        updated_at,
        start_latitude,
        start_longitude
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      routes: routes || [],
      count: routes?.length || 0
    });

  } catch (error) {
    console.error('List routes error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get a single route with full details
 */
async function getRoute(req, res, userId, routeId) {
  if (!routeId) {
    return res.status(400).json({ error: 'routeId required' });
  }

  try {
    const { data: route, error } = await supabase
      .from('routes')
      .select('*')
      .eq('id', routeId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Route not found' });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      route
    });

  } catch (error) {
    console.error('Get route error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Delete a route
 */
async function deleteRoute(req, res, userId, routeId) {
  if (!routeId) {
    return res.status(400).json({ error: 'routeId required' });
  }

  try {
    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', routeId)
      .eq('user_id', userId);

    if (error) throw error;

    console.log(`🗑️ Deleted route: ${routeId}`);

    return res.status(200).json({
      success: true,
      deleted: routeId
    });

  } catch (error) {
    console.error('Delete route error:', error);
    return res.status(500).json({ error: error.message });
  }
}
