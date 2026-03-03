// Strava API Integration Service
// Secure server-side token management

import { supabase } from '../lib/supabase';
import { trackSync, trackInteraction, EventType } from './activityTracking';

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Secure Strava OAuth and API service
 */
export class StravaService {
  constructor() {
    this.clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    this.redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI || `${window.location.origin}/oauth/strava/callback`;
  }

  /**
   * Check if Strava credentials are configured
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
   * Get authorization headers with Supabase session token
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
   * Generate Strava OAuth authorization URL
   */
  getAuthorizationUrl(state = null) {
    if (!this.isConfigured()) {
      throw new Error('Strava client ID must be configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: 'read,activity:read_all,profile:read_all'
    });

    if (state) {
      params.append('state', state);
    }

    const authUrl = `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
    return authUrl;
  }

  /**
   * Exchange authorization code for access token (secure server-side)
   */
  async exchangeCodeForToken(code) {
    if (!this.isConfigured()) {
      throw new Error('Strava client credentials not configured');
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('🔄 Exchanging Strava code for tokens securely...');

      const response = await fetch(`${getApiBaseUrl()}/api/strava-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_code',
          code: code,
          userId: userId
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

      console.log('✅ Strava tokens stored securely');

      return {
        athlete: data.athlete
      };

    } catch (error) {
      console.error('Strava token exchange error:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected to Strava (secure server-side check)
   */
  async isConnected() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return false;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/strava-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_connection_status',
          userId: userId
        })
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.connected && !data.isExpired;

    } catch (error) {
      console.error('Error checking Strava connection:', error);
      return false;
    }
  }

  /**
   * Get connection status with details
   */
  async getConnectionStatus() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return { connected: false };
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/strava-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_connection_status',
          userId: userId
        })
      });

      if (!response.ok) {
        return { connected: false };
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error getting Strava connection status:', error);
      return { connected: false };
    }
  }

  /**
   * Disconnect from Strava (revoke tokens server-side)
   */
  async disconnect() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      console.log('🔌 Disconnecting from Strava securely...');

      const response = await fetch(`${getApiBaseUrl()}/api/strava-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'disconnect',
          userId: userId
        })
      });

      if (!response.ok) {
        console.warn('Failed to disconnect Strava');
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect');
      }

      console.log('✅ Strava disconnected securely');

    } catch (error) {
      console.error('Error disconnecting from Strava:', error);
      throw error;
    }
  }

  /**
   * Sync activities from Strava (server-side)
   */
  async syncActivities(page = 1, perPage = 50) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('📥 Syncing Strava activities...');

      // Track sync start (only on first page)
      if (page === 1) {
        trackSync('strava', 'start');
      }

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/strava-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_activities',
          userId,
          page,
          perPage
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync activities');
      }

      const data = await response.json();
      console.log(`✅ Synced ${data.stored} activities`);

      // Track sync completion
      trackSync('strava', 'complete', {
        activitiesStored: data.stored,
        page
      });

      return data;

    } catch (error) {
      console.error('Error syncing Strava activities:', error);
      throw error;
    }
  }

  /**
   * Sync all activities (multiple pages)
   */
  async syncAllActivities(onProgress = null) {
    let page = 1;
    let totalSynced = 0;
    let hasMore = true;

    while (hasMore) {
      if (onProgress) {
        onProgress({ page, totalSynced });
      }

      const result = await this.syncActivities(page, 100);
      totalSynced += result.stored;
      hasMore = result.hasMore;
      page++;

      // Safety limit
      if (page > 20) {
        console.warn('Reached sync page limit');
        break;
      }
    }

    return { totalSynced, pages: page - 1 };
  }

  /**
   * Sync full history using the chunked sync_all_activities endpoint.
   * Unlike syncAllActivities(), this calls the backend's chunked endpoint
   * directly (no page cap) and supports date filtering via after/before.
   *
   * @param {Object} options
   * @param {Date|null} options.after - Only fetch activities after this date
   * @param {Date|null} options.before - Only fetch activities before this date
   * @param {Function|null} options.onProgress - Progress callback
   * @returns {Promise<{totalFetched: number, totalStored: number, pages: number}>}
   */
  async syncFullHistory({ after = null, before = null, onProgress = null, importSource = 'strava_import_wizard' } = {}) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    const headers = await this.getAuthHeaders();
    let startPage = 1;
    let totalFetched = 0;
    let totalStored = 0;
    let totalPages = 0;
    let reachedEnd = false;

    // Convert dates to Unix timestamps for Strava API
    const afterTimestamp = after ? Math.floor(new Date(after).getTime() / 1000) : undefined;
    const beforeTimestamp = before ? Math.floor(new Date(before).getTime() / 1000) : undefined;

    while (!reachedEnd) {
      if (onProgress) {
        onProgress({ startPage, totalFetched, totalStored, totalPages });
      }

      const response = await fetch(`${getApiBaseUrl()}/api/strava-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_all_activities',
          userId,
          startPage,
          pagesPerChunk: 5,
          importSource,
          ...(afterTimestamp && { after: afterTimestamp }),
          ...(beforeTimestamp && { before: beforeTimestamp })
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      totalFetched += result.totalFetched;
      totalStored += result.totalStored;
      totalPages += result.pagesProcessed;
      reachedEnd = result.reachedEnd;

      if (!reachedEnd && result.nextPage) {
        startPage = result.nextPage;
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // If rate limited, report back rather than throwing
      if (result.rateLimited) {
        return { totalFetched, totalStored, pages: totalPages, rateLimited: true };
      }
    }

    return { totalFetched, totalStored, pages: totalPages, rateLimited: false };
  }

  /**
   * Get user's speed profile
   */
  async getSpeedProfile() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return null;
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/strava-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_speed_profile',
          userId
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.profile;

    } catch (error) {
      console.error('Error getting speed profile:', error);
      return null;
    }
  }

  /**
   * Recalculate speed profile
   */
  async calculateSpeedProfile() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/strava-activities`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'calculate_speed_profile',
          userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to calculate speed profile');
      }

      const data = await response.json();
      return data.profile;

    } catch (error) {
      console.error('Error calculating speed profile:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const stravaService = new StravaService();
export default stravaService;
