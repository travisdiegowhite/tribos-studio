// User Activity Tracking Service
// Tracks user behavior for analytics (page views, syncs, uploads, feature usage)

import { supabase } from '../lib/supabase';

// Generate a session ID for grouping related events
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('tribos_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('tribos_session_id', sessionId);
  }
  return sessionId;
};

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

/**
 * Event categories
 */
export const EventCategory = {
  PAGE_VIEW: 'page_view',
  SYNC: 'sync',
  UPLOAD: 'upload',
  FEATURE: 'feature',
  INTERACTION: 'interaction'
};

/**
 * Common event types
 */
export const EventType = {
  // Page views
  PAGE_VIEW: 'page_view',

  // Sync events
  STRAVA_SYNC_START: 'strava_sync_start',
  STRAVA_SYNC_COMPLETE: 'strava_sync_complete',
  GARMIN_SYNC_START: 'garmin_sync_start',
  GARMIN_SYNC_COMPLETE: 'garmin_sync_complete',
  WAHOO_SYNC_START: 'wahoo_sync_start',
  WAHOO_SYNC_COMPLETE: 'wahoo_sync_complete',

  // Upload events
  GPX_UPLOAD: 'gpx_upload',
  FIT_UPLOAD: 'fit_upload',
  BULK_IMPORT: 'bulk_import',

  // Feature usage
  TRAINING_PLAN_CREATE: 'training_plan_create',
  TRAINING_PLAN_VIEW: 'training_plan_view',
  ROUTE_CREATE: 'route_create',
  ROUTE_VIEW: 'route_view',
  COACH_MESSAGE: 'coach_message',
  WORKOUT_SCHEDULE: 'workout_schedule',
  WORKOUT_COMPLETE: 'workout_complete',
  CALENDAR_SYNC: 'calendar_sync',

  // Interactions
  INTEGRATION_CONNECT: 'integration_connect',
  INTEGRATION_DISCONNECT: 'integration_disconnect',
  SETTINGS_UPDATE: 'settings_update',
  PROFILE_UPDATE: 'profile_update',
  FEEDBACK_SUBMIT: 'feedback_submit'
};

// Event queue for batching
let eventQueue = [];
let flushTimeout = null;
const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_QUEUE_SIZE = 20;

/**
 * User Activity Tracking Service
 */
class ActivityTrackingService {
  constructor() {
    this.enabled = true;
    this.debugMode = import.meta.env.DEV;

    // Flush events on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  /**
   * Enable or disable tracking
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get authorization headers
   */
  async getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return null;
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    };
  }

  /**
   * Track a single event
   */
  async track(eventType, eventCategory, eventData = {}, pagePath = null) {
    if (!this.enabled) return;

    const event = {
      eventType,
      eventCategory,
      eventData,
      pagePath: pagePath || (typeof window !== 'undefined' ? window.location.pathname : null),
      sessionId: getSessionId(),
      timestamp: new Date().toISOString()
    };

    if (this.debugMode) {
      console.log('📊 Activity tracked:', event);
    }

    eventQueue.push(event);

    // Flush immediately if queue is full
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      await this.flush();
    } else if (!flushTimeout) {
      // Schedule flush
      flushTimeout = setTimeout(() => this.flush(), FLUSH_INTERVAL);
    }
  }

  /**
   * Track a page view
   */
  async trackPageView(pagePath, pageTitle = null) {
    await this.track(
      EventType.PAGE_VIEW,
      EventCategory.PAGE_VIEW,
      { title: pageTitle },
      pagePath
    );
  }

  /**
   * Track a sync event
   */
  async trackSync(provider, status, details = {}) {
    const eventType = status === 'start'
      ? `${provider}_sync_start`
      : `${provider}_sync_complete`;

    await this.track(
      eventType,
      EventCategory.SYNC,
      { provider, status, ...details }
    );
  }

  /**
   * Track an upload event
   */
  async trackUpload(type, details = {}) {
    await this.track(
      type,
      EventCategory.UPLOAD,
      details
    );
  }

  /**
   * Track feature usage
   */
  async trackFeature(featureType, details = {}) {
    await this.track(
      featureType,
      EventCategory.FEATURE,
      details
    );
  }

  /**
   * Track user interaction
   */
  async trackInteraction(interactionType, details = {}) {
    await this.track(
      interactionType,
      EventCategory.INTERACTION,
      details
    );
  }

  /**
   * Flush event queue to server
   */
  async flush() {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    if (eventQueue.length === 0) return;

    const eventsToSend = [...eventQueue];
    eventQueue = [];

    const headers = await this.getAuthHeaders();
    if (!headers) {
      // User not authenticated, discard events
      if (this.debugMode) {
        console.log('📊 Discarding events - user not authenticated');
      }
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/user-activity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'log_events',
          events: eventsToSend
        })
      });

      if (!response.ok) {
        // Put events back in queue to retry
        eventQueue = [...eventsToSend, ...eventQueue];
        console.warn('Failed to send activity events, will retry');
      } else if (this.debugMode) {
        console.log(`📊 Flushed ${eventsToSend.length} events`);
      }
    } catch (error) {
      // Put events back in queue to retry
      eventQueue = [...eventsToSend, ...eventQueue];
      console.warn('Error sending activity events:', error);
    }
  }
}

// Singleton instance
export const activityTracking = new ActivityTrackingService();

// Convenience exports
export const trackPageView = (path, title) => activityTracking.trackPageView(path, title);
export const trackSync = (provider, status, details) => activityTracking.trackSync(provider, status, details);
export const trackUpload = (type, details) => activityTracking.trackUpload(type, details);
export const trackFeature = (type, details) => activityTracking.trackFeature(type, details);
export const trackInteraction = (type, details) => activityTracking.trackInteraction(type, details);
