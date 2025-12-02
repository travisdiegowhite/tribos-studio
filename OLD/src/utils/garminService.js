// Garmin Connect API Integration Service
// Secure server-side OAuth and API integration
// Documentation: https://developer.garmin.com/gc-developer-program/

import { supabase } from '../supabase';

const GARMIN_OAUTH_BASE = 'https://connect.garmin.com/oauthConfirm';
const GARMIN_API_BASE = 'https://apis.garmin.com';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Secure Garmin OAuth and API service
 * Note: Garmin uses OAuth 1.0a (different from Wahoo's OAuth 2.0)
 */
export class GarminService {
  constructor() {
    this.consumerKey = process.env.REACT_APP_GARMIN_CONSUMER_KEY;
    this.redirectUri = process.env.REACT_APP_GARMIN_REDIRECT_URI || `${window.location.origin}/garmin/callback`;
  }

  /**
   * Check if Garmin credentials are configured
   */
  isConfigured() {
    return !!(this.consumerKey);
  }

  /**
   * Get current user ID from Supabase auth
   */
  async getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }

  /**
   * Initiate Garmin OAuth 2.0 PKCE flow
   * This calls the server to generate authorization URL with PKCE challenge
   */
  async initiateAuth() {
    if (!this.isConfigured()) {
      throw new Error('Garmin consumer key must be configured');
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('🔍 Initiating Garmin OAuth 2.0 PKCE flow...');

      // Call server to get authorization URL with PKCE
      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_authorization_url',
          userId: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Garmin API Error Response:', errorData);
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      const authUrl = data.authorizationUrl;

      console.log('🔗 Generated Garmin Auth URL with PKCE');
      return authUrl;

    } catch (error) {
      console.error('❌ Garmin auth initiation failed:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth 2.0 flow after callback (exchange code for access token)
   */
  async completeAuth(code, state) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('🔄 Completing Garmin OAuth 2.0 flow...');

      const response = await fetch(`${getApiBaseUrl()}/api/garmin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_code',
          code: code,
          state: state,
          userId: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Garmin connection successful');

      return data;
    } catch (error) {
      console.error('❌ Garmin auth completion failed:', error);
      throw error;
    }
  }

  /**
   * Check if user has connected Garmin account
   */
  async isConnected() {
    const userId = await this.getCurrentUserId();
    if (!userId) return false;

    try {
      const { data, error } = await supabase
        .from('bike_computer_integrations')
        .select('id, sync_enabled')
        .eq('user_id', userId)
        .eq('provider', 'garmin')
        .maybeSingle();

      // Silently handle expected errors (table doesn't exist, no data)
      if (error) {
        if (error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn('Garmin connection check failed:', error.message);
        }
        return false;
      }

      return data?.sync_enabled === true;
    } catch (error) {
      // Silently fail - Garmin integration is optional
      return false;
    }
  }

  /**
   * Get Garmin integration details for current user
   */
  async getIntegration() {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('bike_computer_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'garmin')
        .maybeSingle();

      // Silently handle expected errors (table doesn't exist, no data)
      if (error) {
        if (error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn('Garmin integration fetch failed:', error.message);
        }
        return null;
      }

      return data;
    } catch (error) {
      // Silently fail - Garmin integration is optional
      return null;
    }
  }

  /**
   * Disconnect Garmin account
   */
  async disconnect() {
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
          action: 'disconnect',
          userId: userId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect Garmin');
      }

      console.log('✅ Garmin disconnected successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to disconnect Garmin:', error);
      throw error;
    }
  }

  /**
   * Trigger backfill request for historical Garmin activities
   * Note: Garmin primarily uses PUSH webhooks for real-time data.
   * This backfill function requests historical activities from Garmin,
   * which will then be sent to your webhook endpoint.
   *
   * @param {Object} options - Sync options
   * @param {string} options.startDate - Start date (ISO string or Date)
   * @param {string} options.endDate - End date (ISO string or Date)
   *
   * Examples:
   * - syncActivities() - Last 30 days
   * - syncActivities({ startDate: '2020-01-01' }) - From Jan 2020 to now
   * - syncActivities({ startDate: '2020-01-01', endDate: '2023-12-31' }) - 2020-2023
   */
  async syncActivities(options = {}) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const { startDate, endDate } = options;

      const dateRangeStr = startDate && endDate
        ? ` from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
        : startDate
        ? ` from ${new Date(startDate).toLocaleDateString()} to now`
        : ' (last 30 days)';

      console.log(`🔄 Requesting Garmin activity backfill${dateRangeStr}...`);

      const response = await fetch(`${getApiBaseUrl()}/api/garmin-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: userId,
          startDate,
          endDate
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Garmin backfill error response:', errorData);
        const errorMessage = errorData.message || errorData.error || `HTTP error ${response.status}`;
        const errorDetails = errorData.details || '';
        throw new Error(`${errorMessage}${errorDetails ? '\n' + errorDetails : ''}`);
      }

      const data = await response.json();
      console.log('✅ Garmin backfill request completed:', data);

      return data;
    } catch (error) {
      console.error('❌ Garmin backfill failed:', error);
      throw error;
    }
  }

  /**
   * Get sync history
   */
  async getSyncHistory(limit = 50) {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    try {
      const { data, error } = await supabase
        .from('bike_computer_sync_history')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'garmin')
        .order('synced_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching Garmin sync history:', error);
      return [];
    }
  }

  /**
   * Send route to Garmin Connect as a course
   * @param {string} routeId - Route UUID
   * @param {string} format - Upload format: 'json' (recommended), 'gpx', or 'fit'
   * @returns {Promise<Object>} Response with courseId and courseName
   */
  async sendCourse(routeId, format = 'json') {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    if (!['json', 'gpx', 'fit'].includes(format)) {
      throw new Error('Format must be json, gpx, or fit');
    }

    try {
      console.log(`🚴 Sending route to Garmin (format: ${format})...`);

      const response = await fetch(`${getApiBaseUrl()}/api/garmin-send-course`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: userId,
          routeId: routeId,
          uploadFormat: format
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Garmin course upload error response:', errorData);
        const errorMessage = errorData.message || errorData.error || `HTTP error ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ Route sent to Garmin successfully:', data);

      return data;
    } catch (error) {
      console.error('❌ Failed to send route to Garmin:', error);
      throw error;
    }
  }

  /**
   * Check if user has Course API scope
   * @returns {Promise<boolean>} True if user has course upload permissions
   */
  async hasCourseScope() {
    try {
      const integration = await this.getIntegration();
      if (!integration) return false;

      const scope = integration.provider_user_data?.scope || '';
      return scope.includes('COURSE');
    } catch (error) {
      console.error('Error checking Garmin course scope:', error);
      return false;
    }
  }
}

// Export singleton instance
const garminService = new GarminService();
export default garminService;
