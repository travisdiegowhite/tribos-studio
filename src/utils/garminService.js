// Garmin Connect API Integration Service
// Garmin uses OAuth 1.0a which requires server-side handling

import { supabase } from '../lib/supabase';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Garmin Connect OAuth and API service
 * Note: Garmin uses OAuth 1.0a, so most operations must happen server-side
 */
export class GarminService {
  constructor() {
    this.configured = import.meta.env.VITE_GARMIN_CONSUMER_KEY ? true : false;
  }

  /**
   * Check if Garmin credentials are configured
   */
  isConfigured() {
    return this.configured;
  }

  /**
   * Get current user ID from Supabase auth
   */
  async getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }

  /**
   * Get auth headers for API requests
   * Uses session access token for consistent auth with all endpoints
   */
  async getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { 'Content-Type': 'application/json' };
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    };
  }

  /**
   * Initiate Garmin OAuth flow
   * Returns the authorization URL to redirect the user to
   */
  async getAuthorizationUrl() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      // Request authorization URL from the server (OAuth 2.0 PKCE)
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_authorization_url',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get Garmin authorization URL');
      }

      const data = await response.json();

      // Check if not configured
      if (data.configured === false) {
        throw new Error(data.error || 'Garmin integration not configured');
      }

      return data.authorizationUrl;
    } catch (error) {
      console.error('Error getting Garmin auth URL:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth flow with authorization code (called after callback)
   */
  async exchangeToken(code, state) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_token',
          userId,
          code,
          state
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete Garmin connection');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error exchanging Garmin token:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected to Garmin
   */
  async getConnectionStatus() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return { connected: false };
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_connection_status',
          userId
        })
      });

      if (!response.ok) {
        return { connected: false };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking Garmin connection:', error);
      return { connected: false };
    }
  }

  /**
   * Disconnect from Garmin
   */
  async disconnect() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'disconnect',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect');
      }

      console.log('✅ Garmin disconnected');
    } catch (error) {
      console.error('Error disconnecting from Garmin:', error);
      throw error;
    }
  }

  /**
   * Repair a broken Garmin connection
   * Use when connection shows "Missing User ID" or "Token Expired"
   * This refreshes the token and re-fetches the Garmin User ID
   */
  async repairConnection() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'repair_connection',
          userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Return the error info so UI can decide whether to show reconnect option
        return {
          success: false,
          error: data.error || 'Failed to repair connection',
          requiresReconnect: data.requiresReconnect || false
        };
      }

      console.log('✅ Garmin connection repaired');
      return data;
    } catch (error) {
      console.error('Error repairing Garmin connection:', error);
      throw error;
    }
  }

  /**
   * Sync activities from Garmin Connect
   */
  async syncActivities() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_activities',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync activities');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error syncing Garmin activities:', error);
      throw error;
    }
  }

  /**
   * Push a route to Garmin Connect (for loading onto device)
   */
  async pushRoute(routeData) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'push_route',
          userId,
          routeData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to push route to Garmin');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error pushing route to Garmin:', error);
      throw error;
    }
  }

  /**
   * Fetch health data from Garmin (dailies, sleep, body composition)
   * Returns resting HR, HRV, sleep hours/quality, stress, and weight
   */
  async getHealthData() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_health_data',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Failed to fetch health data' };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Garmin health data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get webhook status and diagnostics
   */
  async getWebhookStatus() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${getApiBaseUrl()}/api/garmin-webhook-status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get webhook status');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting webhook status:', error);
      throw error;
    }
  }

  /**
   * Sync recent activities from Garmin (last N days)
   * @param {number} days - Number of days to sync (default 30)
   * @returns {Promise<{success: boolean, fetched: number, stored: number}>}
   */
  async syncRecentActivities(days = 30) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_activities',
          userId,
          days
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync activities');
      }

      const data = await response.json();
      console.log(`✅ Synced ${data.stored} Garmin activities`);
      return data;
    } catch (error) {
      console.error('Error syncing Garmin activities:', error);
      throw error;
    }
  }

  /**
   * Backfill historical activities from Garmin
   * @param {number} days - Number of days to backfill (default 90)
   * @returns {Promise<{success: boolean, fetched: number, stored: number, method: string}>}
   */
  async backfillActivities(days = 90) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'backfill_activities',
          userId,
          days
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to backfill activities');
      }

      const data = await response.json();
      console.log(`✅ Backfilled Garmin activities:`, data);
      return data;
    } catch (error) {
      console.error('Error backfilling Garmin activities:', error);
      throw error;
    }
  }

  /**
   * Reprocess failed webhook events
   * This recovers activities from webhooks that failed due to "Invalid download token" errors
   * by extracting activity data directly from the stored webhook payloads
   * @returns {Promise<{success: boolean, reprocessed: number, skipped: number, errors: array}>}
   */
  async reprocessFailedEvents() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'reprocess_failed',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reprocess events');
      }

      const data = await response.json();
      console.log(`✅ Reprocessed ${data.reprocessed} Garmin events`);
      return data;
    } catch (error) {
      console.error('Error reprocessing failed events:', error);
      throw error;
    }
  }

  /**
   * Get details for a specific Garmin activity
   * @param {string} activityId - The Garmin activity/summary ID
   * @returns {Promise<{success: boolean, activity: object}>}
   */
  async getActivityDetails(activityId) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_activity',
          userId,
          activityId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get activity details');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting Garmin activity details:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const garminService = new GarminService();
export default garminService;
