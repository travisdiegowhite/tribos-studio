/**
 * Admin Service
 * Handles all admin API calls with authentication
 * SECURITY: All operations require valid JWT from travis@tribos.studio
 */

import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Get the current user's access token for API calls
 */
async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

/**
 * Make an authenticated admin API call
 */
async function adminFetch(action, data = {}) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}/api/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...data })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Admin API request failed');
  }

  return result;
}

/**
 * Get list of all users with basic stats
 */
export async function listUsers() {
  return adminFetch('list_users');
}

/**
 * Get detailed information for a specific user
 */
export async function getUserDetails(targetUserId) {
  return adminFetch('get_user_details', { targetUserId });
}

/**
 * Clean all data for a specific user (for testing)
 * WARNING: This permanently deletes user data
 */
export async function cleanUserData(targetUserId) {
  return adminFetch('clean_user_data', { targetUserId });
}

/**
 * Get all beta feedback submissions
 */
export async function listFeedback() {
  return adminFetch('list_feedback');
}

/**
 * Get recent webhook events
 * @param {string} filterUserId - Optional user ID to filter by
 */
export async function listWebhooks(filterUserId = null) {
  return adminFetch('list_webhooks', { filterUserId });
}

/**
 * Get overall system statistics
 */
export async function getStats() {
  return adminFetch('get_stats');
}

// User Activity Tracking endpoints

/**
 * Make an authenticated user activity API call
 */
async function activityFetch(action, data = {}) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}/api/user-activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...data })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Activity API request failed');
  }

  return result;
}

/**
 * Get activity summary for all users
 */
export async function getActivitySummary() {
  return activityFetch('get_activity_summary');
}

/**
 * Get recent activity across all users
 */
export async function getRecentActivity(limit = 100, eventCategory = null, eventType = null) {
  return activityFetch('get_recent_activity', { limit, eventCategory, eventType });
}

/**
 * Get activity stats for a period
 */
export async function getActivityStats(days = 7) {
  return activityFetch('get_activity_stats', { days });
}

/**
 * Get activity for a specific user
 */
export async function getUserActivity(targetUserId, limit = 100, offset = 0) {
  return activityFetch('get_user_activity', { targetUserId, limit, offset });
}

export default {
  listUsers,
  getUserDetails,
  cleanUserData,
  listFeedback,
  listWebhooks,
  getStats,
  getActivitySummary,
  getRecentActivity,
  getActivityStats,
  getUserActivity
};
