// COROS API Integration Service
// COROS uses OAuth 2.0

import { supabase } from '../lib/supabase';
import { trackSync, trackInteraction, trackFeature, EventType } from './activityTracking';

const COROS_OAUTH_BASE = 'https://open.coros.com/oauth2';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * COROS OAuth and API service
 */
export class CorosService {
  constructor() {
    this.clientId = import.meta.env.VITE_COROS_CLIENT_ID;
    this.redirectUri = import.meta.env.VITE_COROS_REDIRECT_URI || `${window.location.origin}/oauth/coros/callback`;
  }

  /**
   * Check if COROS credentials are configured
   */
  isConfigured() {
    return !!this.clientId;
  }

  /**
   * Get current user ID from Supabase auth
   */
  async getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }

  /**
   * Generate COROS OAuth authorization URL
   * COROS does not require a scope parameter
   */
  getAuthorizationUrl(state = null) {
    if (!this.isConfigured()) {
      throw new Error('COROS client ID must be configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code'
    });

    if (state) {
      params.append('state', state);
    }

    return `${COROS_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (secure server-side)
   */
  async exchangeCodeForToken(code) {
    if (!this.isConfigured()) {
      throw new Error('COROS client credentials not configured');
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('Exchanging COROS code for tokens...');

      const response = await fetch(`${getApiBaseUrl()}/api/coros-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_code',
          code,
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Token exchange failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Token exchange failed');
      }

      console.log('COROS tokens stored securely');
      trackInteraction(EventType.INTEGRATION_CONNECT, { provider: 'coros' });
      return data;
    } catch (error) {
      console.error('COROS token exchange error:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected to COROS
   */
  async getConnectionStatus() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return { connected: false };
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/coros-auth`, {
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
      console.error('Error checking COROS connection:', error);
      return { connected: false };
    }
  }

  /**
   * Disconnect from COROS
   */
  async disconnect() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      console.log('Disconnecting from COROS...');

      const response = await fetch(`${getApiBaseUrl()}/api/coros-auth`, {
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

      console.log('COROS disconnected');
      trackInteraction(EventType.INTEGRATION_DISCONNECT, { provider: 'coros' });
    } catch (error) {
      console.error('Error disconnecting from COROS:', error);
      throw error;
    }
  }

  /**
   * Sync recent activities from COROS (last 30 days)
   */
  async syncActivities() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    trackSync('coros', 'start');

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/coros-activities`, {
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
      trackSync('coros', 'complete', {
        activitiesSynced: data.imported || 0
      });
      return data;
    } catch (error) {
      console.error('Error syncing COROS activities:', error);
      throw error;
    }
  }

  /**
   * Sync all available COROS activities (up to 3 months)
   */
  async syncAllActivities() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    trackSync('coros', 'start');

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/coros-activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_all_activities',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync all activities');
      }

      const data = await response.json();
      trackSync('coros', 'complete', {
        activitiesSynced: data.imported || 0
      });
      return data;
    } catch (error) {
      console.error('Error syncing all COROS activities:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const corosService = new CorosService();
export default corosService;
