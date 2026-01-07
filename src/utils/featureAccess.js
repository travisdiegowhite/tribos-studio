/**
 * Feature Access Utilities
 * Helper functions for checking feature access and usage limits
 */

// Feature names (for consistency across the app)
export const FEATURES = {
  TRAINING_PLANS: 'training_plans',
  ROUTES: 'routes',
  ACTIVITY_SYNC: 'activity_sync',
  BASIC_ANALYTICS: 'basic_analytics',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  AI_COACH: 'ai_coach',
  REALTIME_SYNC: 'realtime_sync',
  PRIORITY_SUPPORT: 'priority_support'
};

// Limit names (for consistency across the app)
export const LIMITS = {
  MAX_ACTIVE_PLANS: 'max_active_plans',
  MAX_ROUTES_PER_MONTH: 'max_routes_per_month',
  ACTIVITY_HISTORY_DAYS: 'activity_history_days',
  AI_COACH_SESSIONS: 'ai_coach_sessions'
};

// Tier configuration (for UI display)
export const TIERS = {
  free: {
    name: 'Free',
    slug: 'free',
    price: 0,
    description: 'Get started with basic training tools',
    features: [
      '1 active training plan',
      '5 custom routes per month',
      '30 days of activity history',
      'Basic analytics',
      'Manual activity sync'
    ],
    notIncluded: [
      'AI Coach sessions',
      'Advanced analytics',
      'Real-time sync',
      'Priority support'
    ]
  },
  pro: {
    name: 'Pro',
    slug: 'pro',
    price: 14.99,
    description: 'Unlimited training with AI coaching',
    features: [
      'Unlimited training plans',
      'Unlimited custom routes',
      'Full activity history',
      'Advanced analytics & insights',
      'AI Coach (unlimited sessions)',
      'Real-time activity sync',
      'Priority support'
    ],
    highlighted: true
  }
};

/**
 * Get tier display information
 */
export function getTierInfo(tierSlug) {
  return TIERS[tierSlug] || TIERS.free;
}

/**
 * Format limit value for display
 * Handles -1 (unlimited) and 0 (none) values
 */
export function formatLimit(value) {
  if (value === -1) return 'Unlimited';
  if (value === 0) return 'None';
  return value.toString();
}

/**
 * Calculate usage percentage for progress bars
 */
export function getUsagePercentage(current, max) {
  if (max === -1) return 0; // Unlimited
  if (max === 0) return 100; // No access
  return Math.min(100, Math.round((current / max) * 100));
}

/**
 * Get feature gate message for when a user tries to access a gated feature
 */
export function getFeatureGateMessage(featureName) {
  const messages = {
    [FEATURES.ADVANCED_ANALYTICS]: 'Advanced analytics are available on the Pro plan.',
    [FEATURES.AI_COACH]: 'AI Coach sessions are available on the Pro plan.',
    [FEATURES.REALTIME_SYNC]: 'Real-time activity sync is available on the Pro plan.',
    [FEATURES.PRIORITY_SUPPORT]: 'Priority support is available on the Pro plan.'
  };

  return messages[featureName] || 'This feature is available on the Pro plan.';
}

/**
 * Get limit reached message
 */
export function getLimitReachedMessage(limitName, max) {
  const messages = {
    [LIMITS.MAX_ACTIVE_PLANS]: `You've reached your limit of ${max} active training plan${max !== 1 ? 's' : ''}. Upgrade to Pro for unlimited plans.`,
    [LIMITS.MAX_ROUTES_PER_MONTH]: `You've used all ${max} custom routes for this month. Upgrade to Pro for unlimited routes.`,
    [LIMITS.ACTIVITY_HISTORY_DAYS]: `Free accounts can view the last ${max} days of activity history. Upgrade to Pro for full history.`,
    [LIMITS.AI_COACH_SESSIONS]: 'AI Coach sessions are only available on the Pro plan.'
  };

  return messages[limitName] || `You've reached your usage limit. Upgrade to Pro for more.`;
}

/**
 * Check if a date is within the allowed activity history window
 */
export function isWithinActivityHistory(date, historyDays) {
  if (historyDays === -1) return true; // Unlimited

  const activityDate = new Date(date);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - historyDays);

  return activityDate >= cutoffDate;
}
