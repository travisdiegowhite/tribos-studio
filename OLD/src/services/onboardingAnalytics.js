/**
 * Onboarding Analytics Service
 * Tracks user progress through onboarding for funnel analysis
 */

// Check if analytics is available (Vercel Analytics)
const isAnalyticsAvailable = () => {
  return typeof window !== 'undefined' && window.va;
};

// Generic track event function
const trackEvent = (eventName, properties = {}) => {
  console.log(`📊 Analytics: ${eventName}`, properties);

  // Vercel Analytics
  if (isAnalyticsAvailable()) {
    try {
      window.va('event', {
        name: eventName,
        ...properties,
      });
    } catch (err) {
      console.warn('Analytics tracking failed:', err);
    }
  }

  // You can add other analytics providers here (Mixpanel, Amplitude, etc.)
};

/**
 * Track when onboarding starts
 */
export const trackOnboardingStarted = () => {
  trackEvent('onboarding_started', {
    timestamp: new Date().toISOString(),
    version: 2,
  });
};

/**
 * Track when user selects their intent
 * @param {string} intent - routes | training | coach | exploring
 */
export const trackIntentSelected = (intent) => {
  trackEvent('onboarding_intent_selected', {
    intent,
  });
};

/**
 * Track when user starts connecting a provider
 * @param {string} provider - strava | garmin
 */
export const trackConnectStarted = (provider) => {
  trackEvent('onboarding_connect_started', {
    provider,
  });
};

/**
 * Track successful connection
 * @param {string} provider - strava | garmin
 */
export const trackConnectSuccess = (provider) => {
  trackEvent('onboarding_connect_success', {
    provider,
  });
};

/**
 * Track connection failure
 * @param {string} provider - strava | garmin
 * @param {string} error - Error message
 */
export const trackConnectFailed = (provider, error) => {
  trackEvent('onboarding_connect_failed', {
    provider,
    error,
  });
};

/**
 * Track when user skips data connection
 */
export const trackConnectSkipped = () => {
  trackEvent('onboarding_connect_skipped');
};

/**
 * Track sync completion
 * @param {number} ridesCount - Number of rides synced
 */
export const trackSyncComplete = (ridesCount) => {
  trackEvent('onboarding_sync_complete', {
    rides_count: ridesCount,
  });
};

/**
 * Track when aha moment is displayed
 * @param {boolean} hasData - Whether user has stats to display
 * @param {object} stats - Summary of user stats
 */
export const trackAhaMomentViewed = (hasData, stats = {}) => {
  trackEvent('onboarding_aha_viewed', {
    has_data: hasData,
    total_rides: stats.totalRides || 0,
    total_miles: stats.totalMiles || 0,
    years_of_data: stats.yearsOfData || 0,
  });
};

/**
 * Track CTA click on PersonalizedNextAction step
 * @param {string} cta - Which CTA was clicked
 * @param {string} intent - User's selected intent
 */
export const trackCtaClicked = (cta, intent) => {
  trackEvent('onboarding_cta_clicked', {
    cta,
    intent,
  });
};

/**
 * Track when user sets a goal
 * @param {string} goalType - consistency | endurance_event | speed_power | enjoyment
 * @param {boolean} hasEventDate - Whether user set an event date
 */
export const trackGoalSet = (goalType, hasEventDate = false) => {
  trackEvent('onboarding_goal_set', {
    goal_type: goalType,
    has_event_date: hasEventDate,
  });
};

/**
 * Track when user skips goal setting
 */
export const trackGoalSkipped = () => {
  trackEvent('onboarding_goal_skipped');
};

/**
 * Track onboarding completion
 * @param {number} durationSeconds - Time taken to complete
 * @param {number[]} stepsSkipped - Array of skipped step numbers
 * @param {string} intent - User's selected intent
 */
export const trackOnboardingCompleted = (durationSeconds, stepsSkipped = [], intent) => {
  trackEvent('onboarding_completed', {
    duration_seconds: durationSeconds,
    steps_skipped: stepsSkipped,
    steps_skipped_count: stepsSkipped.length,
    intent,
    completed_at: new Date().toISOString(),
  });
};

/**
 * Track step navigation
 * @param {number} fromStep - Step navigating from
 * @param {number} toStep - Step navigating to
 * @param {string} direction - 'next' | 'back' | 'skip'
 */
export const trackStepNavigation = (fromStep, toStep, direction) => {
  trackEvent('onboarding_step_navigation', {
    from_step: fromStep,
    to_step: toStep,
    direction,
  });
};

/**
 * Track onboarding abandonment (called on page unload if not completed)
 * @param {number} lastStep - Last step the user was on
 * @param {number} timeSpentSeconds - Time spent before abandonment
 */
export const trackOnboardingAbandoned = (lastStep, timeSpentSeconds) => {
  trackEvent('onboarding_abandoned', {
    last_step: lastStep,
    time_spent_seconds: timeSpentSeconds,
  });
};

export default {
  trackOnboardingStarted,
  trackIntentSelected,
  trackConnectStarted,
  trackConnectSuccess,
  trackConnectFailed,
  trackConnectSkipped,
  trackSyncComplete,
  trackAhaMomentViewed,
  trackCtaClicked,
  trackGoalSet,
  trackGoalSkipped,
  trackOnboardingCompleted,
  trackStepNavigation,
  trackOnboardingAbandoned,
};
