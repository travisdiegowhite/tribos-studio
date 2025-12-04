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
   * Initiate Garmin OAuth flow
   * Returns the authorization URL to redirect the user to
   */
  async getAuthorizationUrl() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      // Request a request token from the server (OAuth 1.0a step 1)
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_request_token',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get Garmin authorization URL');
      }

      const data = await response.json();
      return data.authorizationUrl;
    } catch (error) {
      console.error('Error getting Garmin auth URL:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth flow with verifier (called after callback)
   */
  async exchangeToken(oauthToken, oauthVerifier) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_token',
          userId,
          oauthToken,
          oauthVerifier
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
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
   * Sync activities from Garmin Connect
   */
  async syncActivities() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
}

// Export singleton instance
export const garminService = new GarminService();
export default garminService;
