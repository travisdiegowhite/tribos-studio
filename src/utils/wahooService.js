// Wahoo Fitness API Integration Service
// Wahoo uses OAuth 2.0

import { supabase } from '../lib/supabase';

const WAHOO_OAUTH_BASE = 'https://api.wahooligan.com/oauth';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Wahoo Fitness OAuth and API service
 */
export class WahooService {
  constructor() {
    this.clientId = import.meta.env.VITE_WAHOO_CLIENT_ID;
    this.redirectUri = import.meta.env.VITE_WAHOO_REDIRECT_URI || `${window.location.origin}/oauth/wahoo/callback`;
  }

  /**
   * Check if Wahoo credentials are configured
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
   * Generate Wahoo OAuth authorization URL
   */
  getAuthorizationUrl(state = null) {
    if (!this.isConfigured()) {
      throw new Error('Wahoo client ID must be configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'user_read workouts_read routes_read routes_write'
    });

    if (state) {
      params.append('state', state);
    }

    return `${WAHOO_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (secure server-side)
   */
  async exchangeCodeForToken(code) {
    if (!this.isConfigured()) {
      throw new Error('Wahoo client credentials not configured');
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('🔄 Exchanging Wahoo code for tokens...');

      const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
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

      console.log('✅ Wahoo tokens stored securely');
      return data;
    } catch (error) {
      console.error('Wahoo token exchange error:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected to Wahoo
   */
  async getConnectionStatus() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return { connected: false };
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
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
      console.error('Error checking Wahoo connection:', error);
      return { connected: false };
    }
  }

  /**
   * Disconnect from Wahoo
   */
  async disconnect() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      console.log('🔌 Disconnecting from Wahoo...');

      const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
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

      console.log('✅ Wahoo disconnected');
    } catch (error) {
      console.error('Error disconnecting from Wahoo:', error);
      throw error;
    }
  }

  /**
   * Sync workouts from Wahoo
   */
  async syncWorkouts() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_workouts',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync workouts');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error syncing Wahoo workouts:', error);
      throw error;
    }
  }

  /**
   * Push a route to Wahoo (for ELEMNT devices)
   */
  async pushRoute(routeData) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wahoo-auth`, {
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
        throw new Error(errorData.error || 'Failed to push route to Wahoo');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error pushing route to Wahoo:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const wahooService = new WahooService();
export default wahooService;
