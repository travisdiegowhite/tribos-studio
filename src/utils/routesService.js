// Routes Service - API client for route management
import { supabase } from '../lib/supabase';
import { getAuthHeaders } from './authHeaders';

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

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
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

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
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

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
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
 * Set a route's visibility ('private' | 'public'). Owner only.
 * @param {string} routeId - Route UUID
 * @param {'private'|'public'} visibility
 * @returns {Promise<Object>} - { id, visibility, is_private }
 */
export async function setRouteVisibility(routeId, visibility) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'set_route_visibility',
      userId,
      routeId,
      visibility
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update route visibility');
  }

  const data = await response.json();
  return data.route;
}

/**
 * Fetch a shared route without authentication (public share links).
 * Returns null on 404 (not shared / doesn't exist).
 * @param {string} routeId - Route UUID
 * @returns {Promise<Object|null>}
 */
export async function getPublicRoute(routeId) {
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get_public_route',
      routeId
    })
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to load route');
  }

  const data = await response.json();
  return data.route;
}

/**
 * Autosave the user's single in-progress draft route.
 * @param {Object} routeData - Same shape as saveRoute's routeData
 * @returns {Promise<Object>} - { id, updated_at }
 */
export async function saveDraft(routeData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'save_draft',
      userId,
      routeData
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to save draft');
  }

  const data = await response.json();
  return data.draft;
}

/**
 * Fetch the user's draft route, if any.
 * @returns {Promise<Object|null>}
 */
export async function getDraft() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'get_draft',
      userId
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to get draft');
  }

  const data = await response.json();
  return data.draft ?? null;
}

/**
 * Delete the user's draft route.
 * @returns {Promise<boolean>}
 */
export async function deleteDraft() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      action: 'delete_draft',
      userId
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete draft');
  }

  return true;
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

  const headers = await getAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}/api/routes`, {
    method: 'POST',
    headers,
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
  getPublicRoute,
  setRouteVisibility,
  saveDraft,
  getDraft,
  deleteDraft,
  deleteRoute
};
