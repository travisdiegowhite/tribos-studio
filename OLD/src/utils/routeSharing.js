// Route Sharing Utilities
// Privacy-first route sharing with automatic privacy zone detection

import { point, lineString } from '@turf/helpers';
import distance from '@turf/distance';
import length from '@turf/length';
import along from '@turf/along';
import lineSlice from '@turf/line-slice';
import { supabase } from '../supabase';

// Sharing levels
export const SharingLevels = {
  PRIVATE: 'private',        // Only you
  LINK_ONLY: 'link_only',   // Anyone with link
  FRIENDS: 'friends',        // Your connections
  LOCAL: 'local',           // People in your area (anonymized)
  PUBLIC: 'public'          // Searchable
};

// Comment types
export const CommentTypes = {
  CONDITION: 'condition',  // Road conditions, closures
  TIP: 'tip',             // Useful info, parking, best times
  VARIANT: 'variant',      // Alternative route suggestions
  HAZARD: 'hazard',       // Safety concerns
  AMENITY: 'amenity'      // Cafes, water, restrooms
};

/**
 * Detect potential privacy zones (home, work) based on route start/end
 * and user's historical data
 */
export const detectPrivacyZones = async (userId, routeGeometry) => {
  try {
    // Get user's routes to identify common start/end points
    const { data: userRoutes, error } = await supabase
      .from('routes')
      .select('route_data')
      .eq('user_id', userId)
      .limit(50);

    if (error) throw error;

    const privacyZones = [];

    if (routeGeometry && routeGeometry.coordinates) {
      const routeCoords = routeGeometry.coordinates;
      const startPoint = routeCoords[0];
      const endPoint = routeCoords[routeCoords.length - 1];

      // Check if start point is commonly used (potential home)
      const startPointUsage = countNearbyPoints(startPoint, userRoutes, 100); // 100m radius
      if (startPointUsage >= 3) {
        privacyZones.push({
          type: 'start',
          center: startPoint,
          radius: 500, // 500m privacy radius
          reason: 'frequent_start_location'
        });
      }

      // Check if end point is commonly used
      const endPointUsage = countNearbyPoints(endPoint, userRoutes, 100);
      if (endPointUsage >= 3) {
        privacyZones.push({
          type: 'end',
          center: endPoint,
          radius: 500,
          reason: 'frequent_end_location'
        });
      }
    }

    return privacyZones;
  } catch (error) {
    console.error('Error detecting privacy zones:', error);
    return [];
  }
};

/**
 * Count how many routes have points near a given location
 */
const countNearbyPoints = (pt, routes, radiusMeters) => {
  let count = 0;
  const searchPoint = point(pt);

  routes.forEach(route => {
    if (route.route_data && route.route_data.coordinates) {
      const coords = route.route_data.coordinates;

      // Check start and end points
      if (coords.length > 0) {
        const start = point(coords[0]);
        const end = point(coords[coords.length - 1]);

        if (distance(searchPoint, start, { units: 'meters' }) < radiusMeters ||
            distance(searchPoint, end, { units: 'meters' }) < radiusMeters) {
          count++;
        }
      }
    }
  });

  return count;
};

/**
 * Sanitize route geometry by obscuring privacy zones
 */
export const sanitizeRouteGeometry = (routeGeometry, privacyZones, obscureStartEnd = true) => {
  if (!routeGeometry || !routeGeometry.coordinates) {
    return routeGeometry;
  }

  let sanitized = { ...routeGeometry };
  let coords = [...routeGeometry.coordinates];

  // Obscure start/end points (first/last 500m)
  if (obscureStartEnd && coords.length > 4) {
    const line = lineString(coords);
    const totalLength = length(line, { units: 'kilometers' });

    // Only obscure if route is long enough
    if (totalLength > 1) { // More than 1km
      const obscureDistance = 0.5; // 500m in km

      // Find point 500m from start
      const startCutPoint = along(line, obscureDistance, { units: 'kilometers' });

      // Find point 500m before end
      const endCutPoint = along(line, totalLength - obscureDistance, { units: 'kilometers' });

      // Slice the line
      const sliced = lineSlice(startCutPoint, endCutPoint, line);
      coords = sliced.geometry.coordinates;
    }
  }

  // Apply additional privacy zones
  privacyZones.forEach(zone => {
    coords = coords.filter(coord => {
      const pt = point(coord);
      const center = point(zone.center);
      const dist = distance(pt, center, { units: 'meters' });
      return dist > zone.radius;
    });
  });

  sanitized.coordinates = coords;
  return sanitized;
};

/**
 * Generate a shareable link token
 */
export const generateShareToken = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Share a route with specified privacy level
 */
export const shareRoute = async (routeId, options = {}) => {
  const {
    sharingLevel = SharingLevels.PRIVATE,
    title = null,
    description = null,
    tags = [],
    expiresInDays = null,
    obscureStartEnd = true,
    customPrivacyZones = []
  } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get route data
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('*')
      .eq('id', routeId)
      .single();

    if (routeError) throw routeError;
    if (route.user_id !== user.id) throw new Error('Not authorized to share this route');

    // Detect privacy zones
    const autoPrivacyZones = await detectPrivacyZones(user.id, route.route_data);
    const privacyZones = [...autoPrivacyZones, ...customPrivacyZones];

    // Sanitize route geometry
    const sanitizedGeometry = sanitizeRouteGeometry(
      route.route_data,
      privacyZones,
      obscureStartEnd
    );

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Share token (only for link_only)
    const shareToken = sharingLevel === SharingLevels.LINK_ONLY
      ? generateShareToken()
      : null;

    // Create or update shared route
    const { data: sharedRoute, error: shareError } = await supabase
      .from('shared_routes')
      .upsert({
        route_id: routeId,
        owner_id: user.id,
        sharing_level: sharingLevel,
        privacy_zones: privacyZones,
        sanitized_geometry: sanitizedGeometry,
        obscure_start_end: obscureStartEnd,
        title: title || route.name,
        description,
        tags,
        expires_at: expiresAt,
        share_token: shareToken,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'route_id,owner_id'
      })
      .select()
      .single();

    if (shareError) throw shareError;

    return {
      success: true,
      sharedRoute,
      shareUrl: shareToken
        ? `${window.location.origin}/routes/shared/${shareToken}`
        : null
    };
  } catch (error) {
    console.error('Error sharing route:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get shared route by token (for link-only sharing)
 */
export const getSharedRouteByToken = async (shareToken) => {
  try {
    const { data, error } = await supabase
      .from('shared_routes')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          elevation_gain,
          route_type,
          created_at
        ),
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('share_token', shareToken)
      .eq('sharing_level', SharingLevels.LINK_ONLY)
      .single();

    if (error) throw error;

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new Error('This share link has expired');
    }

    // Increment view count (fire and forget)
    supabase.rpc('increment_route_view', { shared_route_id: data.id }).then();

    return {
      success: true,
      sharedRoute: data
    };
  } catch (error) {
    console.error('Error fetching shared route:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Unshare a route (set back to private)
 */
export const unshareRoute = async (routeId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('shared_routes')
      .update({ sharing_level: SharingLevels.PRIVATE })
      .eq('route_id', routeId)
      .eq('owner_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error unsharing route:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user's shared routes
 */
export const getUserSharedRoutes = async (userId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;

    if (!targetUserId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('shared_routes')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          elevation_gain,
          route_type,
          created_at
        )
      `)
      .eq('owner_id', targetUserId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, sharedRoutes: data };
  } catch (error) {
    console.error('Error fetching shared routes:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Save a route to user's library
 */
export const saveRoute = async (routeId, sharedRouteId = null, folder = null, notes = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('saved_routes')
      .upsert({
        user_id: user.id,
        route_id: routeId,
        shared_route_id: sharedRouteId,
        folder,
        notes,
        saved_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,route_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Increment save count
    if (sharedRouteId) {
      await supabase
        .from('shared_routes')
        .update({ save_count: supabase.raw('save_count + 1') })
        .eq('id', sharedRouteId);
    }

    return { success: true, savedRoute: data };
  } catch (error) {
    console.error('Error saving route:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if user has saved a route
 */
export const isRouteSaved = async (routeId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('saved_routes')
      .select('id')
      .eq('user_id', user.id)
      .eq('route_id', routeId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error checking saved route:', error);
    return false;
  }
};

/**
 * Get user's saved routes
 */
export const getSavedRoutes = async (folder = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    let query = supabase
      .from('saved_routes')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          elevation_gain,
          route_type,
          route_data
        ),
        shared_routes (
          title,
          description,
          tags
        )
      `)
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });

    if (folder) {
      query = query.eq('folder', folder);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, savedRoutes: data };
  } catch (error) {
    console.error('Error fetching saved routes:', error);
    return { success: false, error: error.message };
  }
};

export default {
  SharingLevels,
  CommentTypes,
  shareRoute,
  unshareRoute,
  getSharedRouteByToken,
  getUserSharedRoutes,
  saveRoute,
  isRouteSaved,
  getSavedRoutes,
  detectPrivacyZones,
  sanitizeRouteGeometry
};
