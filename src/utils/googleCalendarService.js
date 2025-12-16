// Google Calendar Integration Service
// Secure server-side token management for calendar access

import { supabase } from '../lib/supabase';

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

/**
 * Google Calendar OAuth and API service
 */
export class GoogleCalendarService {
  constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    this.redirectUri = import.meta.env.VITE_GOOGLE_CALENDAR_REDIRECT_URI ||
      `${window.location.origin}/oauth/google/callback`;
  }

  /**
   * Check if Google Calendar credentials are configured
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
   * Generate Google OAuth authorization URL
   * Requests full calendar access for reading and creating events
   */
  getAuthorizationUrl(state = null) {
    if (!this.isConfigured()) {
      throw new Error('Google Client ID must be configured');
    }

    console.log('Google Calendar OAuth Debug:', {
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      currentOrigin: window.location.origin,
      environment: import.meta.env.MODE
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline', // Required for refresh token
      prompt: 'consent', // Force consent to get refresh token
    });

    if (state) {
      params.append('state', state);
    }

    const authUrl = `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
    console.log('Generated Google Auth URL:', authUrl);

    return authUrl;
  }

  /**
   * Exchange authorization code for access token (secure server-side)
   */
  async exchangeCodeForToken(code) {
    if (!this.isConfigured()) {
      throw new Error('Google credentials not configured');
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      console.log('Exchanging Google Calendar code for tokens securely...');

      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'exchange_code',
          code: code,
          userId: userId,
          redirectUri: this.redirectUri
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

      console.log('Google Calendar tokens stored securely');

      return {
        email: data.email,
        calendarId: data.calendarId
      };

    } catch (error) {
      console.error('Google Calendar token exchange error:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected to Google Calendar
   */
  async isConnected() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return false;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
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
      return data.connected;

    } catch (error) {
      console.error('Error checking Google Calendar connection:', error);
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
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
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
      console.error('Error getting Google Calendar connection status:', error);
      return { connected: false };
    }
  }

  /**
   * Disconnect from Google Calendar
   */
  async disconnect() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      console.log('Disconnecting from Google Calendar...');

      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
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
        console.warn('Failed to disconnect Google Calendar');
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect');
      }

      console.log('Google Calendar disconnected');

    } catch (error) {
      console.error('Error disconnecting from Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Get calendar events for a date range
   */
  async getEvents(startDate, endDate) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_events',
          userId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch events');
      }

      const data = await response.json();
      return data.events || [];

    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Get busy time blocks for a date range
   */
  async getBusyTimes(startDate, endDate) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_busy_times',
          userId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch busy times');
      }

      const data = await response.json();
      return data.busyTimes || [];

    } catch (error) {
      console.error('Error fetching busy times:', error);
      throw error;
    }
  }

  /**
   * Get available time windows for a specific date
   * Combines calendar events with user's work hours setting
   */
  async getAvailableWindows(date) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'get_available_windows',
          userId,
          date: date instanceof Date ? date.toISOString().split('T')[0] : date
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to calculate available windows');
      }

      const data = await response.json();
      return data.windows || [];

    } catch (error) {
      console.error('Error calculating available windows:', error);
      throw error;
    }
  }

  /**
   * Create a workout event in Google Calendar
   * @param {Object} workout - Workout details
   * @param {string} workout.name - Workout name
   * @param {string} workout.description - Workout description
   * @param {number} workout.duration - Duration in minutes
   * @param {string} workout.scheduledDate - Date in YYYY-MM-DD format
   * @param {string} workout.scheduledTime - Optional time in HH:MM format
   * @param {string} workout.workoutType - Type of workout (endurance, intervals, etc.)
   * @returns {Object} Created event details including event ID
   */
  async createWorkoutEvent(workout) {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/google-calendar-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create_event',
          userId,
          workout
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create calendar event');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  /**
   * Format available windows for display
   */
  formatWindowsForDisplay(windows) {
    return windows.map(window => {
      const start = new Date(window.start);
      const end = new Date(window.end);

      const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      };

      const hours = Math.floor(window.durationMins / 60);
      const mins = window.durationMins % 60;
      let durationStr;
      if (hours > 0 && mins > 0) {
        durationStr = `${hours}h ${mins}m`;
      } else if (hours > 0) {
        durationStr = `${hours}h`;
      } else {
        durationStr = `${mins}m`;
      }

      return {
        ...window,
        startFormatted: formatTime(start),
        endFormatted: formatTime(end),
        durationFormatted: durationStr,
        label: `${formatTime(start)} - ${formatTime(end)} (${durationStr})`
      };
    });
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;
