// Routes Service - API client for route management
import { supabase } from '../lib/supabase';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Get current user ID from Supabase auth
 */
async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Save a route (create or update)
 * @param {Object} routeData - Route data to save
 * @returns {Promise<Object>} - Saved route
 */
export async function saveRoute(routeData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'save_route',
      userId,
      routeData
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to save route');
  }

  const data = await response.json();
  return data.route;
}

/**
 * List user's saved routes
 * @returns {Promise<Array>} - List of routes
 */
export async function listRoutes() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'list_routes',
      userId
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to list routes');
  }

  const data = await response.json();
  return data.routes;
}

/**
 * Get a single route by ID
 * @param {string} routeId - Route UUID
 * @returns {Promise<Object>} - Route data
 */
export async function getRoute(routeId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'get_route',
      userId,
      routeId
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to get route');
  }

  const data = await response.json();
  return data.route;
}

/**
 * Delete a route
 * @param {string} routeId - Route UUID
 * @returns {Promise<boolean>} - Success
 */
export async function deleteRoute(routeId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'delete_route',
      userId,
      routeId
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete route');
  }

  return true;
}

export default {
  saveRoute,
  listRoutes,
  getRoute,
  deleteRoute
};
